"""Ponte JSON usada pelo aplicativo de desktop."""
import io
import json
import sys
from pathlib import Path

from openhidro import ponte

RAIZ = Path(__file__).resolve().parents[1]


def _rodar(pedido, monkeypatch, capsys):
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(json.dumps(pedido).encode())))
    ponte.main([])
    return json.loads(capsys.readouterr().out)


def test_dimensionar_exemplo(monkeypatch, capsys):
    rede = json.loads((RAIZ / "exemplos/residencia_agua_fria.json").read_text(encoding="utf-8"))
    r = _rodar({"acao": "dimensionar", "rede": rede}, monkeypatch, capsys)
    assert r["ok"] and r["resultado"]["trechos"]
    assert "Memorial" in r["memorial"]


def test_erro_vira_mensagem(monkeypatch, capsys):
    r = _rodar({"acao": "dimensionar", "rede": {"sistema": "agua_fria", "nos": [], "trechos": []}},
               monkeypatch, capsys)
    assert r["ok"] is False and "reservatorio" in r["erro"]


def test_catalogo_do_app_em_dia():
    """app/src/dados/agua_fria.json é gerado do motor (scripts/gerar_dados_app.py)."""
    gravado = json.loads((RAIZ / "app/src/dados/agua_fria.json").read_text(encoding="utf-8"))
    assert gravado == ponte.catalogo_agua_fria(), "rode: python scripts/gerar_dados_app.py"


def test_catalogo_pecas_em_dia():
    gravado = json.loads((RAIZ / "app/src/dados/catalogo.json").read_text(encoding="utf-8"))
    assert gravado == ponte.catalogo_pecas(), "rode: python scripts/gerar_dados_app.py"


def test_catalogo_ids_unicos_e_fabricantes():
    itens = ponte.catalogo_pecas()["itens"]
    ids = [i["id"] for i in itens]
    assert len(ids) == len(set(ids))
    for fab in ("Tigre", "Amanco"):
        assert any(i["fabricante"] == fab and i["familia"] == "te_reducao_90" and (i["dn"], i["dn2"]) == (50, 25) for i in itens)
        assert any(i["fabricante"] == fab and i["familia"] == "joelho_reducao_90_bucha_latao" and i["rosca"] == '1/2"' for i in itens)


def test_catalogo_esgoto_em_dia():
    gravado = json.loads((RAIZ / "app/src/dados/esgoto.json").read_text(encoding="utf-8"))
    assert gravado == ponte.catalogo_esgoto(), "rode: python scripts/gerar_dados_app.py"
