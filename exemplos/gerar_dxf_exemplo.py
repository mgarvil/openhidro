"""Gera um DXF de exemplo (planta de banheiro em cm) para testar a leitura de DXF.

    python exemplos/gerar_dxf_exemplo.py
    openhidro dxf exemplos/banheiro_af.dxf --config exemplos/banheiro_af_config.json -o saida/
"""
from pathlib import Path

import ezdxf

AQUI = Path(__file__).parent


def gerar(caminho: Path = AQUI / "banheiro_af.dxf") -> Path:
    doc = ezdxf.new("R2010", setup=True)
    msp = doc.modelspace()
    doc.layers.add("HID-AF", color=5)
    doc.layers.add("ARQ", color=8)
    for nome, raio in [("RESERVATORIO", 30), ("LAVATORIO", 15), ("BACIA", 18), ("CHUVEIRO", 10), ("PIA", 15)]:
        b = doc.blocks.new(nome)
        b.add_circle((0, 0), raio)
        b.add_text(nome[:3], height=6).set_placement((0, 0))
    # paredes
    msp.add_lwpolyline([(-50, -250), (450, -250), (450, 150), (-50, 150)], close=True, dxfattribs={"layer": "ARQ"})
    # tubulação (cm): descida do reservatório em (0,0) -> barrilete -> banheiro
    lin = [((0, 0), (0, -100)), ((0, -100), (200, -100)), ((200, -100), (400, -100)),
           ((200, -100), (200, -40)),            # lavatório
           ((300, -100), (300, -160)),           # bacia (derivação em T no meio do trecho)
           ((400, -100), (400, -200)),           # chuveiro
           ((0, -100), (0, -220)), ((0, -220), (80, -220))]  # pia
    for a, b in lin:
        msp.add_line(a, b, dxfattribs={"layer": "HID-AF"})
    msp.add_blockref("RESERVATORIO", (0, 0))
    msp.add_blockref("LAVATORIO", (205, -35))
    msp.add_blockref("BACIA", (300, -170))
    msp.add_blockref("CHUVEIRO", (400, -205))
    msp.add_blockref("PIA", (85, -220))
    doc.saveas(caminho)
    return caminho


if __name__ == "__main__":
    print(gerar())
