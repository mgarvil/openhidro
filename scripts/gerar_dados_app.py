"""Gera os dados de catálogo que o aplicativo usa na interface (biblioteca de aparelhos, tubos).

A fonte é sempre o motor (src/openhidro/normas). Rode depois de alterar as tabelas:

    python scripts/gerar_dados_app.py
"""
import json
from pathlib import Path

from openhidro.ponte import catalogo_agua_fria, catalogo_esgoto, catalogo_pecas

destino = Path(__file__).resolve().parents[1] / "app/src/dados/agua_fria.json"
destino.parent.mkdir(parents=True, exist_ok=True)
destino.write_text(json.dumps(catalogo_agua_fria(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("gravado", destino)
destino2 = destino.parent / "catalogo.json"
destino2.write_text(json.dumps(catalogo_pecas(), ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
print("gravado", destino2)
destino3 = destino.parent / "esgoto.json"
destino3.write_text(json.dumps(catalogo_esgoto(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("gravado", destino3)
