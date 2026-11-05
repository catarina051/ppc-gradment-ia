"""Gabarito PARCIAL de um PPC da UNIFEI (layout diferente do CEFET-MG).

O PPC traz uma tabela por período ("Xo Período": Código | Componente Curricular | CH Teórica | CH Prática).
Dela saem, sem LLM, as disciplinas obrigatórias com período e carga horária total (teórica + prática).
Pré-requisitos e optativas NÃO entram (ficam nas fichas, com layout irregular), por isso o gabarito é
parcial: serve para medir revocação, período e CH das obrigatórias, mas não precisão nem requisitos.

Uso (no container do extrator): python gerar_gabarito_unifei.py <ppc.pdf> <saida.json>
"""
from __future__ import annotations

import json
import re
import sys

import pymupdf

# Inconsistências DENTRO do próprio PPC, conferidas no PDF: as duas leituras são aceitas.
INCONSISTENCIAS_DO_PPC = {
    "EPRIB002": {
        "cargas_aceitas": [32, 48],
        "nota": "Matriz do 9º período diz 32h; a ficha (código EPRi04, p. 125) diz 48h.",
    },
}
# Observado, mas NÃO aceito como desculpa: as fichas de "Projeto Aplicado de Eletrônica" (p. 100) e de
# "Processamento Digital de Sinais" (p. 110) usam o mesmo código ELTi2216; a matriz desambigua
# (ELTI2220 x ELTI2216), então fundir as duas continua contando como erro do pipeline.

LINHA_RE = re.compile(r"^\s*([A-Z]{2,5}\d{2,4}|TCC I+|EST)\s{2,}(.*?)\s{2,}(\d+)\s+(\d+)\s*$")
TEXTO_SOLTO_RE = re.compile(r"^\s{4,}(\S.*?)\s*$")


def main(caminho_pdf: str, caminho_saida: str) -> None:
    doc = pymupdf.open(caminho_pdf)
    texto = "\n".join(p.get_text(sort=True) for p in doc)
    ini = texto.find("1o Período")
    fim = texto.find("Planos de Ensino", ini)
    linhas = [ln for ln in texto[ini:fim].splitlines() if ln.strip()]

    disciplinas, periodo = [], None
    for i, ln in enumerate(linhas):
        m = re.match(r"\s*(\d{1,2})o Per[íi]odo\s*$", ln)
        if m:
            periodo = int(m.group(1))
            continue
        m = LINHA_RE.match(ln)
        if not (m and periodo):
            continue
        nome = m.group(2).strip()
        if not nome:  # nome quebrado em duas linhas: uma acima e outra abaixo da linha do código
            antes = TEXTO_SOLTO_RE.match(linhas[i - 1]) if i > 0 else None
            depois = TEXTO_SOLTO_RE.match(linhas[i + 1]) if i + 1 < len(linhas) else None
            nome = " ".join(x.group(1) for x in (antes, depois) if x)
        nome = re.sub(r"\s+", " ", nome)
        disciplinas.append({
            "sigla": m.group(1).replace(" ", ""),
            "nome": nome,
            "eixo": None,
            "periodo_sugerido": periodo,
            "optativa": False,
            "periodo": periodo,
            "carga_horaria_horas_aula": int(m.group(3)) + int(m.group(4)),
            "carga_horaria_horas_relogio": None,
        })

    for d in disciplinas:
        if d["sigla"] in INCONSISTENCIAS_DO_PPC:
            d.update(INCONSISTENCIAS_DO_PPC[d["sigla"]])

    gabarito = {
        "fonte": caminho_pdf.split("/")[-1],
        "metodo": "parser deterministico das tabelas 'Xo Período' (sem LLM); gabarito PARCIAL",
        "parcial": True,
        "inconsistencias_do_ppc": INCONSISTENCIAS_DO_PPC,
        "sem_gabarito_requisitos": True,
        "total_disciplinas": len(disciplinas),
        "obrigatorias": len(disciplinas),
        "optativas": None,
        "total_dependencias": None,
        "disciplinas": disciplinas,
        "dependencias": [],
    }
    with open(caminho_saida, "w", encoding="utf-8") as f:
        json.dump(gabarito, f, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in gabarito.items() if k not in ("disciplinas", "dependencias")}, ensure_ascii=False))
    print([d["nome"] for d in disciplinas if len(d["nome"]) < 4])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
