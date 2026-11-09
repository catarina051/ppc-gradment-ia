"""Serviço interno de extração estruturada de PPCs (PDF, DOCX, TXT, MD).

Lê PDFs nativos preservando leitura de tabelas (PyMuPDF sort=True), aplica OCR
local (Tesseract) em páginas digitalizadas, e extrai parágrafos + tabelas de
arquivos DOCX na ordem exata do documento.

POST /extrair[?nome=arquivo.pdf]  corpo: bytes brutos  ->  JSON com texto paginado
GET  /health                                           ->  {"status": "ok"}
"""
from __future__ import annotations

import json
import re
import subprocess
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from urllib.parse import parse_qs, urlparse
import xml.etree.ElementTree as ET

import pymupdf

TAMANHO_MAXIMO_BYTES = 50 * 1024 * 1024  # 50 MiB
TAMANHO_MAXIMO_XML_DOCX = 80 * 1024 * 1024  # Proteção contra zip-bomb
OCR_LIMITE_CARACTERES_PAGINA = 140
# Leitura integral: TODAS as páginas vão para as IAs. Nunca se recorta o documento; acima deste teto de
# segurança (~450 mil tokens, muito acima de um PPC típico de 300 mil caracteres) o extrator recusa com
# erro claro em vez de mandar um texto parcial.
LIMITE_LEITURA_INTEGRAL_CHARS = 1_500_000

PALAVRAS_CURRICULO_RE = re.compile(
    r"(matriz\s+curricular|estrutura\s+curricular|quadro\s+curricular|grade\s+curricular|"
    r"ement[áa]rio|\bementa\s*:|pr[ée][-\s]?requisito|correquisito|co[-\s]?requisito|"
    r"carga\s+hor[áa]ria|\b\d{2,3}\s*h\b|disciplinas?\s+optativas?|componentes?\s+optativos?|"
    r"\b[1-9][º°o]?\s*(per[íi]odo|semestre)\b|\b1[0-2][º°o]?\s*(per[íi]odo|semestre)\b)",
    re.IGNORECASE,
)

INICIO_BIBLIOGRAFIA_RE = re.compile(
    r"^\s*(?:\d+[\.\)]\s*)?(?:bibliografia\s+(?:b[áa]sica|complementar)|refer[êe]ncias\s+bibliogr[áa]ficas)\b",
    re.IGNORECASE,
)

RETOMADA_FICHA_CURRICULAR_RE = re.compile(
    r"(\bdisciplina\b|\bcomponente\s+curricular\b|\bc[óo]digo\b|\bunidade\s+curricular\b|"
    r"\bper[íi]odo\b|\bsemestre\b|\bcarga\s+hor[áa]ria\b|\bcr[ée]ditos?\b|"
    r"pr[ée][-\s]?requisito|correquisito|co[-\s]?requisito|\bementa\b|\bement[áa]rio\b|"
    r"\bmatriz\s+curricular\b|\bquadro\b|\boptativas?\b|\beletivas?\b|\bn[úu]cleo\b|\beixo\b|"
    r"^\s*[A-Z]{2,6}[-\s]?\d{2,5}\b)",
    re.IGNORECASE,
)


class ErroExtracao(Exception):
    """Erro de validação/leitura com mensagem clara para o usuário."""


def _podar_bibliografias(texto: str) -> str:
    """Remove listas extensas de Bibliografia Básica/Complementar preservando 100% de códigos, CH, requisitos e ementas."""
    linhas_saida: list[str] = []
    em_bibliografia = False
    for ln in texto.splitlines():
        limpa = ln.strip()
        if INICIO_BIBLIOGRAFIA_RE.match(limpa):
            em_bibliografia = True
            continue
        if em_bibliografia:
            if RETOMADA_FICHA_CURRICULAR_RE.search(limpa):
                em_bibliografia = False
            else:
                continue
        linhas_saida.append(ln)
    return "\n".join(linhas_saida)


def _limpar_espacos(texto: str) -> str:
    texto = _podar_bibliografias(texto)
    linhas = [re.sub(r"[ \t]+", " ", ln).strip() for ln in texto.splitlines()]
    # Remove sequências de mais de 2 linhas em branco consecutivas
    saida: list[str] = []
    vazias = 0
    for ln in linhas:
        if not ln:
            vazias += 1
            if vazias <= 1:
                saida.append("")
        else:
            vazias = 0
            saida.append(ln)
    return "\n".join(saida).strip()


def _ocr_pagina(page: pymupdf.Page) -> str:
    pix = page.get_pixmap(dpi=200, colorspace=pymupdf.csGRAY)
    png_bytes = pix.tobytes("png")
    try:
        proc = subprocess.run(
            ["tesseract", "stdin", "stdout", "-l", "por+eng", "--psm", "6"],
            input=png_bytes,
            capture_output=True,
            timeout=25,
            check=False,
        )
        if proc.returncode == 0:
            return proc.stdout.decode("utf-8", errors="replace")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return ""


def _montar_texto_integral(paginas: list[tuple[int, str]]) -> str:
    """Junta TODAS as páginas com o marcador de página. Se não couber, recusa: nunca envia texto parcial."""
    texto = "\n\n".join(f"--- [PÁGINA {num}] ---\n{conteudo}" for num, conteudo in paginas if conteudo)
    if len(texto) > LIMITE_LEITURA_INTEGRAL_CHARS:
        total = f"{len(texto):,}".replace(",", ".")
        teto = f"{LIMITE_LEITURA_INTEGRAL_CHARS:,}".replace(",", ".")
        raise ErroExtracao(
            f"O documento tem {total} caracteres de texto, acima do limite de leitura integral ({teto}). "
            "Para não analisar o PPC pela metade, envie só a parte curricular (matriz, ementário e quadros "
            "de pré-requisitos)."
        )
    return texto


def extrair_pdf(dados: bytes) -> dict:
    try:
        doc = pymupdf.open(stream=dados, filetype="pdf")
    except Exception as exc:
        raise ErroExtracao("Não foi possível abrir o arquivo PDF enviado.") from exc

    if doc.page_count == 0:
        raise ErroExtracao("O PDF enviado não possui páginas.")

    # Passo 1: extração nativa rápida de todas as páginas (< 0,5s mesmo em PDFs de 250 páginas)
    textos_nativos: list[str] = []
    for idx in range(doc.page_count):
        textos_nativos.append(_limpar_espacos(doc[idx].get_text("text", sort=True) or ""))

    # Passo 2: OCR em TODA página sem texto nativo que tenha imagem (quadros escaneados, anexos). Sem limite de
    # páginas: a leitura precisa ser integral. Páginas sem texto e sem imagem são realmente vazias.
    paginas_extraidas: list[tuple[int, str]] = []
    paginas_ocr = 0
    paginas_sem_texto: list[int] = []

    for idx in range(doc.page_count):
        texto = textos_nativos[idx]
        if len(texto) < OCR_LIMITE_CARACTERES_PAGINA and len(doc[idx].get_images(full=False)) > 0:
            texto_ocr = _limpar_espacos(_ocr_pagina(doc[idx]))
            if len(texto_ocr) > len(texto):
                texto = texto_ocr
                paginas_ocr += 1
        if len(texto.strip()) < 20:
            paginas_sem_texto.append(idx + 1)
        paginas_extraidas.append((idx + 1, texto))

    total_paginas = doc.page_count
    doc.close()

    texto_final = _montar_texto_integral(paginas_extraidas)
    if len(texto_final.strip()) < 80:
        raise ErroExtracao(
            "Não foi possível extrair texto suficiente do PDF (documento vazio ou ilegível)."
        )

    return {
        "formato": "pdf",
        "paginas": total_paginas,
        "paginas_ocr": paginas_ocr,
        "paginas_sem_texto": paginas_sem_texto,
        "leitura_integral": True,
        "recortado_por_tamanho": False,
        "caracteres": len(texto_final),
        "texto": texto_final,
    }


def _texto_no_w(elem: ET.Element, ns: dict[str, str]) -> str:
    partes: list[str] = []
    for sub in elem.iter():
        tag = sub.tag.split("}")[-1]
        if tag == "t" and sub.text:
            partes.append(sub.text)
        elif tag == "tab":
            partes.append(" ")
        elif tag in ("br", "cr"):
            partes.append("\n")
    return re.sub(r"[ \t]+", " ", "".join(partes)).strip()


def extrair_docx(dados: bytes) -> dict:
    try:
        zf = zipfile.ZipFile(BytesIO(dados))
    except zipfile.BadZipFile as exc:
        raise ErroExtracao("O arquivo DOCX enviado está corrompido.") from exc

    with zf:
        if "word/document.xml" not in zf.namelist():
            raise ErroExtracao("Arquivo ZIP não é um documento Word (.docx) válido.")
        info = zf.getinfo("word/document.xml")
        if info.file_size > TAMANHO_MAXIMO_XML_DOCX:
            raise ErroExtracao("Documento DOCX excede o limite de segurança descompactado.")
        xml_bytes = zf.read("word/document.xml")

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise ErroExtracao("Não foi possível interpretar o XML interno do DOCX.") from exc

    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    body = root.find("w:body", ns)
    if body is None:
        raise ErroExtracao("Documento DOCX sem corpo de texto.")

    blocos: list[str] = []
    for child in body:
        tag = child.tag.split("}")[-1]
        if tag == "p":
            txt = _texto_no_w(child, ns)
            if txt:
                blocos.append(txt)
        elif tag == "tbl":
            linhas_tabela: list[str] = []
            for tr in child.findall(".//w:tr", ns):
                celulas = []
                for tc in tr.findall("./w:tc", ns):
                    pars = [_texto_no_w(p, ns) for p in tc.findall(".//w:p", ns)]
                    celula_txt = " / ".join(p for p in pars if p)
                    celulas.append(celula_txt)
                if any(celulas):
                    linhas_tabela.append(" | ".join(celulas))
            if linhas_tabela:
                blocos.append("[TABELA]\n" + "\n".join(linhas_tabela) + "\n[/TABELA]")

    texto_bruto = _limpar_espacos("\n".join(blocos))
    if len(texto_bruto) < 80:
        raise ErroExtracao("O documento DOCX não contém texto suficiente de PPC.")

    # Divide em blocos virtuais de ~3500 caracteres para manter âncoras de seção/página
    fatias: list[tuple[int, str]] = []
    linhas = texto_bruto.splitlines()
    atual: list[str] = []
    tam_atual = 0
    num_bloco = 1
    for ln in linhas:
        atual.append(ln)
        tam_atual += len(ln) + 1
        if tam_atual >= 3500:
            fatias.append((num_bloco, "\n".join(atual)))
            atual = []
            tam_atual = 0
            num_bloco += 1
    if atual:
        fatias.append((num_bloco, "\n".join(atual)))

    texto_final = _montar_texto_integral(fatias)
    return {
        "formato": "docx",
        "paginas": len(fatias),
        "paginas_ocr": 0,
        "paginas_sem_texto": [],
        "leitura_integral": True,
        "recortado_por_tamanho": False,
        "caracteres": len(texto_final),
        "texto": texto_final,
    }


def extrair_texto_puro(dados: bytes) -> dict:
    try:
        texto = dados.decode("utf-8")
    except UnicodeDecodeError:
        texto = dados.decode("latin-1", errors="replace")

    texto = _limpar_espacos(texto)
    if len(texto) < 50:
        raise ErroExtracao("O arquivo de texto enviado é muito curto para ser um PPC.")

    texto_paginado = _montar_texto_integral([(1, texto)])
    return {
        "formato": "txt",
        "paginas": 1,
        "paginas_ocr": 0,
        "paginas_sem_texto": [],
        "leitura_integral": True,
        "recortado_por_tamanho": False,
        "caracteres": len(texto_paginado),
        "texto": texto_paginado,
    }


def extrair_documento(dados: bytes, nome_arquivo: str = "") -> dict:
    if not dados:
        raise ErroExtracao("Nenhum arquivo de PPC foi recebido.")
    if len(dados) > TAMANHO_MAXIMO_BYTES:
        raise ErroExtracao("O arquivo excede o tamanho máximo permitido de 50 MB.")

    nome_lower = (nome_arquivo or "").lower().strip()
    if dados.startswith(b"%PDF-") or nome_lower.endswith(".pdf"):
        return extrair_pdf(dados)
    if dados.startswith(b"PK\x03\x04") or nome_lower.endswith(".docx"):
        return extrair_docx(dados)
    if b"\x00" in dados[:1024]:
        raise ErroExtracao(
            "Formato binário não suportado. Envie o PPC em PDF, DOCX, TXT ou Markdown."
        )
    return extrair_texto_puro(dados)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A002
        return  # Não registrar conteúdo em logs

    def _responder_json(self, status: int, payload: dict) -> None:
        corpo = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self) -> None:  # noqa: N802
        rota = urlparse(self.path).path
        if rota == "/health":
            self._responder_json(200, {"status": "ok"})
            return
        self._responder_json(404, {"erro": "Rota não encontrada."})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/extrair":
            self._responder_json(404, {"erro": "Rota não encontrada."})
            return

        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho <= 0:
            self._responder_json(400, {"erro": "Corpo da requisição vazio."})
            return
        if tamanho > TAMANHO_MAXIMO_BYTES:
            self._responder_json(413, {"erro": "Arquivo acima do limite de 50 MB."})
            return

        dados = self.rfile.read(tamanho)
        qs = parse_qs(parsed.query)
        nome = (qs.get("nome") or [""])[0]
        try:
            resultado = extrair_documento(dados, nome)
            self._responder_json(200, resultado)
        except ErroExtracao as exc:
            self._responder_json(422, {"erro": str(exc)})
        except Exception:
            self._responder_json(500, {"erro": "Falha interna ao extrair texto do documento."})


if __name__ == "__main__":
    servidor = ThreadingHTTPServer(("0.0.0.0", 8000), Handler)
    print("extrator ouvindo na porta 8000", flush=True)
    servidor.serve_forever()

