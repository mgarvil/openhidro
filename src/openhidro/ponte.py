"""Ponte entre o aplicativo de desktop e o motor de cálculo.

O aplicativo grava um pedido JSON num arquivo e chama::

    openhidro-motor --entrada pedido.json

(ou envia o JSON pela entrada padrão). A resposta sai na saída padrão, em JSON ASCII
(evita problemas de codificação do console do Windows).

Pedidos::

    {"acao": "versao"}
    {"acao": "aparelhos"}
    {"acao": "dimensionar", "rede": {...formato-rede...}}

Resposta: ``{"ok": true, ...}`` ou ``{"ok": false, "erro": "mensagem"}``.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict

from . import __version__
from .calculo import dimensionar_agua_fria, dimensionar_esgoto
from .io import relatorio as R
from .modelo import Rede
from .catalogo import PONTOS, ROSCA_DN, catalogo
from .normas import nbr5626 as N


def catalogo_agua_fria() -> dict:
    """Dados que o aplicativo usa para a biblioteca de aparelhos e tubos."""
    return {
        "aparelhos": [
            {"chave": a.chave, "descricao": a.descricao, "peso": a.peso, "vazao_ls": a.vazao_ls,
             "pressao_min_kpa": a.pressao_min_kpa, "altura_m": N.ALTURA_PONTO_M.get(a.chave, 0.6),
             "dn_min": N.DN_MIN_SUB_RAMAL.get(a.chave)}
            for a in N.APARELHOS_AF.values()
        ],
        "tubos": {m: [asdict(t) for t in ts] for m, ts in N.TUBOS.items()},
        "conexoes": sorted(N.LEQ_PVC),
    }


def catalogo_pecas() -> dict:
    return {"itens": catalogo(), "pontos": PONTOS, "rosca_dn": {str(k): v for k, v in ROSCA_DN.items()}}


def atender(pedido: dict) -> dict:
    acao = pedido.get("acao")
    if acao == "versao":
        return {"ok": True, "versao": __version__}
    if acao == "aparelhos":
        return {"ok": True, **catalogo_agua_fria()}
    if acao == "catalogo":
        return {"ok": True, **catalogo_pecas()}
    if acao == "dimensionar":
        rede = Rede.from_dict(pedido["rede"])
        if rede.sistema == "agua_fria":
            res = dimensionar_agua_fria(rede)
            memorial = R.memorial_agua_fria(res)
        elif rede.sistema == "esgoto":
            res = dimensionar_esgoto(rede)
            memorial = R.memorial_esgoto(res)
        else:
            raise ValueError(f"Sistema desconhecido: {rede.sistema}")
        return {"ok": True, "situacao_ok": res.ok, "resultado": asdict(res), "memorial": memorial}
    raise ValueError(f"Ação desconhecida: {acao!r}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="openhidro-motor")
    ap.add_argument("--entrada", help="arquivo JSON com o pedido (padrão: entrada padrão)")
    a = ap.parse_args(argv)
    try:
        if a.entrada:
            with open(a.entrada, encoding="utf-8") as f:
                pedido = json.load(f)
        else:
            pedido = json.loads(sys.stdin.buffer.read().decode("utf-8"))
        resposta = atender(pedido)
    except Exception as e:  # o app mostra a mensagem ao usuário
        resposta = {"ok": False, "erro": f"{type(e).__name__}: {e}" if not isinstance(e, (ValueError, KeyError)) else str(e).strip("'\"")}
    sys.stdout.write(json.dumps(resposta, ensure_ascii=True))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
