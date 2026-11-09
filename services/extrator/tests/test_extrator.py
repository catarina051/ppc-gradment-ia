from __future__ import annotations

from io import BytesIO
import sys
from pathlib import Path
import zipfile

import pymupdf
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import ErroExtracao, extrair_documento  # noqa: E402


def _criar_pdf_bytes(textos_paginas: list[str]) -> bytes:
    doc = pymupdf.open()
    for txt in textos_paginas:
        page = doc.new_page()
        page.insert_text((50, 72), txt, fontsize=11)
    dados = doc.tobytes()
    doc.close()
    return dados


def _criar_docx_com_tabela() -> bytes:
    xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>PROJETO PEDAGÓGICO DO CURSO DE CIÊNCIA DA COMPUTAÇÃO</w:t></w:r></w:p>
        <w:tbl>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Período</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Código</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Disciplina</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>CH</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>1º</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>DCC101</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Algoritmos e Programação</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>60h</w:t></w:r></w:p></w:tc>
          </w:tr>
        </w:tbl>
      </w:body>
    </w:document>"""
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("word/document.xml", xml)
    return buf.getvalue()


def test_extrair_pdf_multiplas_paginas():
    pdf = _criar_pdf_bytes([
        "PROJETO PEDAGOGICO DO CURSO DE ENGENHARIA DE COMPUTACAO\nMatriz Curricular 2026.1 - Carga Horaria 60h",
        "EMENTARIO DAS DISCIPLINAS\nCALC1 - Calculo I: Limites, derivadas e integrais de funcoes reais.",
    ])
    res = extrair_documento(pdf, "ppc.pdf")
    assert res["formato"] == "pdf"
    assert res["paginas"] == 2
    assert "[PÁGINA 1]" in res["texto"]
    assert "[PÁGINA 2]" in res["texto"]
    assert "CALC1" in res["texto"]


def test_extrair_docx_preserva_tabelas():
    docx = _criar_docx_com_tabela()
    res = extrair_documento(docx, "ppc.docx")
    assert res["formato"] == "docx"
    assert "[TABELA]" in res["texto"]
    assert "1º | DCC101 | Algoritmos e Programação | 60h" in res["texto"]


def test_extrair_texto_puro():
    txt = (
        "PPC de Sistemas de Informação - Matriz 2026.1\n"
        "1º Período: SIN101 Fundamentos de Sistemas (60h) - Ementa: Conceitos gerais de SI."
    ).encode("utf-8")
    res = extrair_documento(txt, "ppc.txt")
    assert res["formato"] == "txt"
    assert "SIN101" in res["texto"]


def test_rejeita_arquivo_vazio():
    with pytest.raises(ErroExtracao):
        extrair_documento(b"", "vazio.pdf")


def test_poda_bibliografia_preservando_proxima_disciplina():
    pdf = _criar_pdf_bytes([
        (
            "Disciplina: MAT101 - Cálculo I\n"
            "Carga Horária: 60h | Período: 1º\n"
            "Ementa: Limites, derivadas e integrais.\n"
            "Bibliografia Básica:\n"
            "STEWART, J. Cálculo Vol. 1. São Paulo: Cengage, 2021.\n"
            "GUIDORIZZI, H. L. Um Curso de Cálculo. Rio de Janeiro: LTC, 2019.\n"
            "Bibliografia Complementar:\n"
            "LEITHOLD, L. O Cálculo com Geometria Analítica. Harbra, 1994.\n"
            "MAT102 - Cálculo II\n"
            "Carga Horária: 60h | Pré-requisito: MAT101\n"
            "Ementa: Séries e funções de várias variáveis."
        )
    ])
    res = extrair_documento(pdf, "ppc_bib.pdf")
    assert "MAT101" in res["texto"]
    assert "MAT102" in res["texto"]
    assert "Séries e funções de várias variáveis" in res["texto"]
    assert "STEWART" not in res["texto"]
    assert "GUIDORIZZI" not in res["texto"]




def test_leitura_integral_nao_recorta_ppc_grande():
    # 300 mil caracteres (acima do antigo limite de 125 mil): todo o texto precisa chegar às IAs
    linha = "1º Período: DCC101 Algoritmos (60h). Pré-requisito: nenhum. Ementa: lógica e estruturas.\n"
    txt = ("PPC de Ciência da Computação\n" + linha * 3400 + "ÚLTIMA DISCIPLINA: DCC999 Projeto Final (60h)").encode("utf-8")
    res = extrair_documento(txt, "ppc.txt")
    assert res["leitura_integral"] is True
    assert res["recortado_por_tamanho"] is False
    assert "DCC999" in res["texto"], "o fim do documento não pode ser cortado"


def test_recusa_em_vez_de_recortar_acima_do_teto(monkeypatch):
    import app
    monkeypatch.setattr(app, "LIMITE_LEITURA_INTEGRAL_CHARS", 1_000)
    with pytest.raises(ErroExtracao, match="limite de leitura integral"):
        extrair_documento(("Matriz curricular " * 200).encode("utf-8"), "ppc.txt")


def test_pdf_informa_paginas_sem_texto():
    pdf = _criar_pdf_bytes(["PROJETO PEDAGÓGICO DO CURSO\nMatriz curricular 1º período: Cálculo I 60h", "", "Ementário: Cálculo I"])
    res = extrair_documento(pdf, "ppc.pdf")
    assert res["leitura_integral"] is True
    assert res["paginas_sem_texto"] == [2]
