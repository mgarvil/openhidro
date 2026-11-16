"""Linha de comando: ``openhidro``.

Exemplos::

    openhidro calcular exemplos/banheiro_agua_fria.json -o saida/
    openhidro dxf planta.dxf --config config_af.json -o saida/
    openhidro reservatorio escritorio=120 --dias 2 --incendio 6000
    openhidro aparelhos
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__
from .calculo import dimensionar_agua_fria, dimensionar_esgoto
from .io import relatorio as R
from .modelo import Rede
from .normas.consumo import CONSUMO_PER_CAPITA, dimensionar_reservatorio


def _calcular(rede: Rede):
    if rede.sistema == "agua_fria":
        res = dimensionar_agua_fria(rede)
        return res, R.memorial_agua_fria(res)
    if rede.sistema == "esgoto":
        res = dimensionar_esgoto(rede)
        return res, R.memorial_esgoto(res)
    raise SystemExit(f"Sistema desconhecido: {rede.sistema}")


def _gravar(res, memorial: str, rede: Rede, saida: Path | None, base: str):
    if saida is None:
        print(memorial)
        return
    saida.mkdir(parents=True, exist_ok=True)
    (saida / f"{base}_memorial.md").write_text(memorial, encoding="utf-8")
    (saida / f"{base}_trechos.csv").write_text(R.csv_trechos(res), encoding="utf-8-sig")
    (saida / f"{base}_resultado.json").write_text(R.resultado_json(res), encoding="utf-8")
    rede.salvar(saida / f"{base}_rede.json")
    print(f"Arquivos gravados em {saida}/ — situação: {'OK' if res.ok else 'COM PENDÊNCIAS'}")
    for a in res.alertas:
        print("  -", a)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="openhidro", description="Projeto hidrossanitário (NBR 5626 / NBR 8160)")
    ap.add_argument("--version", action="version", version=f"openhidro {__version__}")
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("calcular", help="dimensiona uma rede descrita em JSON")
    c.add_argument("rede")
    c.add_argument("-o", "--saida", type=Path)

    d = sub.add_parser("dxf", help="lê a rede de um DXF, dimensiona e devolve DXF anotado")
    d.add_argument("dxf")
    d.add_argument("--config", required=True)
    d.add_argument("-o", "--saida", type=Path, required=True)

    r = sub.add_parser("reservatorio", help="volume de reservação (ex.: escritorio=120 apartamento=64)")
    r.add_argument("ocupacoes", nargs="+")
    r.add_argument("--dias", type=float, default=2.0)
    r.add_argument("--incendio", type=float, default=0.0, help="reserva técnica de incêndio (L)")
    r.add_argument("--fracao-superior", type=float, default=0.4)

    sub.add_parser("aparelhos", help="lista aparelhos e chaves aceitas")

    a = ap.parse_args(argv)
    if a.cmd == "calcular":
        rede = Rede.carregar(a.rede)
        res, mem = _calcular(rede)
        _gravar(res, mem, rede, a.saida, Path(a.rede).stem)
    elif a.cmd == "dxf":
        from .io.dxf import anotar_dxf, ler_rede_dxf
        cfg = json.loads(Path(a.config).read_text(encoding="utf-8"))
        rede = ler_rede_dxf(a.dxf, cfg)
        res, mem = _calcular(rede)
        base = Path(a.dxf).stem
        _gravar(res, mem, rede, a.saida, base)
        anotar_dxf(a.dxf, a.saida / f"{base}_dimensionado.dxf", rede, res, float(cfg.get("escala_para_m", 1.0)))
    elif a.cmd == "reservatorio":
        occ = []
        for o in a.ocupacoes:
            tipo, qtd = o.split("=")
            if tipo not in CONSUMO_PER_CAPITA:
                raise SystemExit(f"Ocupação '{tipo}' desconhecida. Opções: {', '.join(CONSUMO_PER_CAPITA)}")
            occ.append((tipo, float(qtd)))
        res = dimensionar_reservatorio(occ, a.dias, a.incendio, a.fracao_superior)
        for d_ in res.detalhes:
            print(d_)
        print(f"Consumo diário: {res.consumo_diario_l:,.0f} L | reserva {res.dias_reserva:g} dia(s): "
              f"{res.reserva_consumo_l:,.0f} L | incêndio: {res.reserva_incendio_l:,.0f} L")
        print(f"Superior: {res.volume_superior_l:,.0f} L | Inferior: {res.volume_inferior_l:,.0f} L | "
              f"Total: {res.volume_total_l:,.0f} L")
    elif a.cmd == "aparelhos":
        print(R.tabela_aparelhos())
    return 0


if __name__ == "__main__":
    sys.exit(main())
