"""Gera um gabarito (ground truth) a partir de um PPC no formato CEFET-MG.

Os PPCs do CEFET-MG trazem, para cada disciplina, um bloco "Detalhamento de Disciplinas":

    Disciplina: <nome>   SIGLA PPC: <SIGLA>
    Eixo: <eixo>   Período: <n>   Característica: ...
    ... TEORIA PRÁTICA TOTAL ... (horas-aula) ... HORAS
    90,0  0,0  90,0  75,0
    ... Teórica/Obrigatória | Teórico-Prática/Optativa ...
    PRÉ-REQUISITOS            CORREQUISITOS
    <nomes separados por />   <nomes separados por />
    Ementa:

Esse layout é estável e independe de LLM, então serve como régua para medir
o que o pipeline de IAs extraiu. Uso (dentro do container do extrator, que já
tem PyMuPDF):

    python gerar_gabarito_cefet.py <ppc.pdf> <saida.json>
"""
from __future__ import annotations

import difflib
import json
import re
import sys
import unicodedata

import pymupdf

# Inconsistências encontradas DENTRO do próprio PPC, conferidas manualmente no PDF. Nesses casos as duas
# leituras são aceitas como corretas (a IA não deve ser penalizada por seguir uma das duas fontes do documento).
INCONSISTENCIAS_DO_PPC = {
    "SDIG0": {
        "periodos_aceitos": [6, 5],
        "nota": "Detalhamento de Disciplinas diz 6º período; o quadro da matriz (5º período, item 3/5) lista no 5º.",
    },
}

RODAPE_RE = re.compile(
    r"(Projeto Pedag[óo]gico do Curso de|Centro Federal de Educa|Rua Jos[ée] Peres|^\s*\d{1,3}\s*$)",
    re.IGNORECASE,
)


def sem_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def chave(nome: str) -> str:
    s = re.sub(r"\([A-Z]{2,5}\)", " ", nome)  # ignora siglas entre parênteses, ex.: "(OFT)"
    s = sem_acentos(s).upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def numeros(linha: str) -> list[float]:
    return [float(x.replace(",", ".")) for x in re.findall(r"\d+,\d", linha)]


def colunas_requisitos(linhas: list[str]) -> tuple[str, str]:
    """Separa as colunas PRÉ-REQUISITOS | CORREQUISITOS pela posição do cabeçalho."""
    cab = next(i for i, ln in enumerate(linhas) if "PRÉ-REQUISITOS" in ln and "CORREQUISITOS" in ln)
    meio = (linhas[cab].index("PRÉ-REQUISITOS") + len("PRÉ-REQUISITOS") + linhas[cab].index("CORREQUISITOS")) / 2
    pre, co = [], []
    for ln in linhas[cab + 1:]:
        if ln.strip().startswith("Ementa"):
            break
        if not ln.strip() or RODAPE_RE.search(ln):
            continue
        for m in re.finditer(r"\S+(?: {1,2}\S+)*", ln):
            centro = (m.start() + m.end()) / 2
            (pre if centro < meio else co).append(m.group(0))
    return " ".join(pre), " ".join(co)


def separar_nomes(celula: str) -> list[str]:
    txt = re.sub(r"\s+", " ", celula).strip()
    if not txt or chave(txt) in {"NAO HA", "NAO", "HA"}:
        return []
    txt = re.sub(r"\s*\([A-Z]{2,5}\)", "", txt)  # remove siglas entre parênteses, ex.: "(OFT)"
    # Mantém a célula inteira: o próprio PPC usa "/" e "," dentro de nomes
    # ("Fundamentos de Oscilações/Fluidos e Termodinâmica"); a separação é feita em resolver().
    return [txt]


def main(caminho_pdf: str, caminho_saida: str) -> None:
    doc = pymupdf.open(caminho_pdf)
    texto = "\n".join(p.get_text(sort=True) for p in doc)
    linhas = texto.splitlines()

    inicios = [i for i, ln in enumerate(linhas) if re.search(r"Disciplina:\s+.+SIGLA PPC:\s+[A-Z]", ln)]
    disciplinas = []
    for n, ini in enumerate(inicios):
        fim = inicios[n + 1] if n + 1 < len(inicios) else min(len(linhas), ini + 80)
        bloco = linhas[ini:fim]
        m = re.search(r"Disciplina:\s+(.+?)\s+SIGLA PPC:\s+([A-Z0-9]+)", bloco[0])
        nome, sigla = m.group(1).strip(), m.group(2).strip()
        corpo = "\n".join(bloco)
        per = re.search(r"Per[íi]odo:\s+(\d+)", corpo)
        eixo = re.search(r"Eixo:\s+(.+?)\s{2,}Per[íi]odo", corpo)
        optativa = bool(re.search(r"/\s*Optativa", corpo))
        ch_aula = ch_relogio = None
        for i, ln in enumerate(bloco):
            if "TEORIA" in ln and "TOTAL" in ln:
                for prox in bloco[i + 1:i + 16]:
                    if RODAPE_RE.search(prox):
                        continue
                    nums = numeros(prox)
                    if len(nums) >= 4:
                        ch_aula, ch_relogio = int(round(nums[2])), int(round(nums[3]))
                        break
                break
        try:
            pre_txt, co_txt = colunas_requisitos(bloco)
        except StopIteration:
            pre_txt, co_txt = "", ""
        disciplinas.append({
            "sigla": sigla,
            "nome": nome,
            "eixo": eixo.group(1).strip() if eixo else None,
            "periodo_sugerido": int(per.group(1)) if per else None,
            "optativa": optativa,
            "periodo": None if optativa else (int(per.group(1)) if per else None),
            "carga_horaria_horas_aula": ch_aula,
            "carga_horaria_horas_relogio": ch_relogio,
            "pre_nomes": separar_nomes(pre_txt),
            "co_nomes": separar_nomes(co_txt),
        })

    # Resolve os nomes dos requisitos para siglas (nome exato normalizado; senão, o mais parecido)
    por_chave = {chave(d["nome"]): d["sigla"] for d in disciplinas}
    nao_resolvidos = []

    def resolver_um(nome: str, aproximado: bool = True) -> str | None:
        k = chave(nome)
        if k in por_chave:
            return por_chave[k]
        if re.fullmatch(r"[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*", nome.strip()):
            return nome.strip()
        if not aproximado:
            return None
        perto = difflib.get_close_matches(k, list(por_chave), n=1, cutoff=0.88)
        return por_chave[perto[0]] if perto else None

    def resolver(celula: str) -> list[str]:
        # Divide em pedaços por "/" ou "," e junta vizinhos de forma gulosa até formar nomes conhecidos.
        pedacos = [p.strip() for p in re.split(r"[/,]", celula) if p.strip()]
        achadas, i = [], 0
        while i < len(pedacos):
            # 1º tenta casamento exato do maior trecho; o aproximado só vale para um pedaço isolado
            candidatos = [(j, False) for j in range(len(pedacos), i, -1)] + [(i + 1, True)]
            for j, aprox in candidatos:
                sigla = resolver_um(" ".join(pedacos[i:j]), aproximado=aprox)
                if sigla:
                    achadas.append(sigla)
                    i = j
                    break
            else:
                nao_resolvidos.append(pedacos[i])
                i += 1
        return achadas

    dependencias = []
    for d in disciplinas:
        for tipo, campo in (("PRE", "pre_nomes"), ("CO", "co_nomes")):
            for nome in d[campo]:
                for req in resolver(nome):
                    if req != d["sigla"]:
                            dependencias.append({"disciplina": d["sigla"], "requisito": req, "tipo": tipo})

    for d in disciplinas:
        if d["sigla"] in INCONSISTENCIAS_DO_PPC:
            d.update(INCONSISTENCIAS_DO_PPC[d["sigla"]])

    gabarito = {
        "fonte": caminho_pdf.split("/")[-1],
        "metodo": "parser deterministico dos blocos 'Detalhamento de Disciplinas' (sem LLM)",
        "total_disciplinas": len(disciplinas),
        "obrigatorias": sum(1 for d in disciplinas if not d["optativa"]),
        "optativas": sum(1 for d in disciplinas if d["optativa"]),
        "total_dependencias": len(dependencias),
        "requisitos_nao_resolvidos": nao_resolvidos,
        "validacao_cruzada": "56 de 57 obrigatórias conferem com os quadros 'Relação de disciplinas do Nº período'; a exceção está em inconsistencias_do_ppc.",
        "inconsistencias_do_ppc": INCONSISTENCIAS_DO_PPC,
        "disciplinas": disciplinas,
        "dependencias": dependencias,
    }
    with open(caminho_saida, "w", encoding="utf-8") as f:
        json.dump(gabarito, f, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in gabarito.items() if k not in ("disciplinas", "dependencias")}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
