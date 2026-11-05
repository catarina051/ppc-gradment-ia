"""Gera samples/ppc-ciencia-computacao.pdf a partir de samples/ppc-ciencia-computacao.txt."""
from pathlib import Path
import pymupdf

pasta = Path(__file__).resolve().parent
texto = (pasta / "ppc-ciencia-computacao.txt").read_text(encoding="utf-8")

doc = pymupdf.open()
blocos = texto.split("\n4. EMENTÁRIO DAS DISCIPLINAS")
for parte_idx, parte in enumerate([blocos[0], "4. EMENTÁRIO DAS DISCIPLINAS" + blocos[1]]):
    page = doc.new_page(width=595, height=842)
    rect = pymupdf.Rect(42, 42, 553, 800)
    page.insert_textbox(rect, parte.strip(), fontsize=9.5, fontname="helv")

saida = pasta / "ppc-ciencia-computacao.pdf"
doc.save(str(saida))
doc.close()
print(f"PDF gerado em {saida} ({saida.stat().st_size} bytes)")

