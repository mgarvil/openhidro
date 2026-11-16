"""Leitura de rede a partir de DXF e anotação dos resultados.

Fluxo típico (planta baixa 2D):

* a tubulação é desenhada com LINE/LWPOLYLINE/POLYLINE em uma ou mais camadas;
* os aparelhos são blocos (INSERT) cujo nome é mapeado para uma chave da
  tabela de aparelhos;
* o reservatório (água fria) ou a saída (esgoto) é um bloco mapeado ou uma
  coordenada informada.

Configuração (dict ou JSON)::

    {
      "sistema": "agua_fria",
      "camadas_tubos": ["HID-AF"],
      "escala_para_m": 0.01,          # desenho em cm
      "tolerancia": 2.0,              # em unidades do desenho
      "raio_aparelho": 40.0,          # distância máx. bloco -> extremidade de tubo
      "blocos": {"LAV*": "lavatorio", "BACIA*": "bacia_caixa_descarga"},
      "bloco_origem": "RESERVATORIO", # ou "ponto_origem": [x, y]
      "z_tubulacao": 2.80,            # m — cota dos trechos horizontais (água fria)
      "z_piso": 0.0,
      "z_origem": 6.0,                # m — cota do nó reservatório
      "declividade_padrao": 0.01      # esgoto 2D
    }
"""
from __future__ import annotations

import fnmatch
import json
import math
from collections import defaultdict
from pathlib import Path

import ezdxf

from ..modelo import No, Rede, Trecho
from ..normas import nbr5626 as N


def _segmentos(msp, camadas: list[str]):
    camadas_l = {c.lower() for c in camadas}
    for e in msp:
        if e.dxf.layer.lower() not in camadas_l:
            continue
        t = e.dxftype()
        if t == "LINE":
            yield (e.dxf.start.x, e.dxf.start.y), (e.dxf.end.x, e.dxf.end.y)
        elif t == "LWPOLYLINE":
            pts = [(p[0], p[1]) for p in e.get_points("xy")]
            if e.closed:
                pts.append(pts[0])
            yield from zip(pts, pts[1:])
        elif t == "POLYLINE":
            pts = [(v.dxf.location.x, v.dxf.location.y) for v in e.vertices]
            yield from zip(pts, pts[1:])


def _mapear_bloco(nome: str, blocos: dict[str, str]) -> str | None:
    for padrao, chave in blocos.items():
        if fnmatch.fnmatch(nome.upper(), padrao.upper()):
            return chave
    return None


def ler_rede_dxf(caminho: str | Path, config: dict | str | Path) -> Rede:
    if not isinstance(config, dict):
        config = json.loads(Path(config).read_text(encoding="utf-8"))
    sistema = config.get("sistema", "agua_fria")
    esc = float(config.get("escala_para_m", 1.0))
    tol = float(config.get("tolerancia", 0.01 / esc))
    raio = float(config.get("raio_aparelho", 0.4 / esc))
    doc = ezdxf.readfile(str(caminho))
    msp = doc.modelspace()

    # ---- nós por agrupamento de extremidades
    coords: list[tuple[float, float]] = []

    def no_de(p):
        for i, q in enumerate(coords):
            if math.dist(p, q) <= tol:
                return i
        coords.append(p)
        return len(coords) - 1

    arestas = set()
    segs = list(_segmentos(msp, config["camadas_tubos"]))
    if not segs:
        raise ValueError(f"Nenhuma linha encontrada nas camadas {config['camadas_tubos']}")
    for a, b in segs:
        ia, ib = no_de(a), no_de(b)
        if ia != ib:
            arestas.add((min(ia, ib), max(ia, ib)))

    # ---- quebra trechos onde uma extremidade toca o meio de outro (derivação em T)
    mudou = True
    while mudou:
        mudou = False
        for (ia, ib) in list(arestas):
            pa, pb = coords[ia], coords[ib]
            L = math.dist(pa, pb)
            for k, pk in enumerate(coords):
                if k in (ia, ib):
                    continue
                t = ((pk[0] - pa[0]) * (pb[0] - pa[0]) + (pk[1] - pa[1]) * (pb[1] - pa[1])) / (L * L)
                if 0 < t < 1:
                    proj = (pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1]))
                    if math.dist(proj, pk) <= tol:
                        arestas.discard((ia, ib))
                        arestas.add((min(ia, k), max(ia, k)))
                        arestas.add((min(k, ib), max(k, ib)))
                        mudou = True
                        break
            if mudou:
                break

    grau = defaultdict(int)
    for a, b in arestas:
        grau[a] += 1
        grau[b] += 1

    # ---- aparelhos e origem por blocos
    blocos = config.get("blocos", {})
    aparelho_no: dict[int, str] = {}
    origem = None
    for e in msp.query("INSERT"):
        p = (e.dxf.insert.x, e.dxf.insert.y)
        nome = e.dxf.name
        if config.get("bloco_origem") and fnmatch.fnmatch(nome.upper(), config["bloco_origem"].upper()):
            origem = min(range(len(coords)), key=lambda i: math.dist(coords[i], p))
            continue
        chave = _mapear_bloco(nome, blocos)
        if not chave:
            continue
        cand = [i for i in range(len(coords)) if grau[i] == 1 and math.dist(coords[i], p) <= raio
                and i not in aparelho_no]
        if not cand:
            continue
        i = min(cand, key=lambda i: math.dist(coords[i], p))
        aparelho_no[i] = chave
    if origem is None and "ponto_origem" in config:
        po = tuple(config["ponto_origem"])
        origem = min(range(len(coords)), key=lambda i: math.dist(coords[i], po))
    if origem is None:
        raise ValueError("Defina 'bloco_origem' ou 'ponto_origem' (reservatório ou saída do esgoto)")

    # ---- orientação: BFS a partir da origem
    viz = defaultdict(list)
    for a, b in arestas:
        viz[a].append(b)
        viz[b].append(a)
    pai = {origem: None}
    fila = [origem]
    while fila:
        n = fila.pop(0)
        for m in viz[n]:
            if m not in pai:
                pai[m] = n
                fila.append(m)
    soltos = set(range(len(coords))) - set(pai)
    if soltos:
        raise ValueError(f"{len(soltos)} nós desconectados da origem (verifique a tolerância de ligação)")
    if len(arestas) != len(coords) - 1:
        raise ValueError("A tubulação desenhada forma um circuito fechado; a v0.1 só calcula redes em árvore")

    z_tub = float(config.get("z_tubulacao", 0.0))
    z_piso = float(config.get("z_piso", 0.0))
    z_or = float(config.get("z_origem", z_tub))
    from ..normas.nbr5626 import ParametrosAguaFria
    chaves = {"declividade_padrao", "pavimentos", "nivel_agua_m", "diametro_caixa_sifonada"} \
        | set(ParametrosAguaFria.__dataclass_fields__)
    parametros = {k: config[k] for k in chaves if k in config}
    if sistema == "agua_fria":
        # desenho sem conexões: perdas localizadas estimadas como % do comprimento real
        parametros.setdefault("acrescimo_localizadas", 0.25)
    rede = Rede(sistema, nome=Path(caminho).stem, parametros=parametros)
    ids = {}
    for i, (x, y) in enumerate(coords):
        if i == origem:
            nid, tipo, z = ("RES" if sistema == "agua_fria" else "SAIDA"), \
                ("reservatorio" if sistema == "agua_fria" else "saida"), z_or
        elif i in aparelho_no:
            ap = aparelho_no[i]
            nid, tipo = f"P{i}", "ponto"
            z = z_piso + N.ALTURA_PONTO_M.get(ap, 0.0) if sistema == "agua_fria" else z_piso
        else:
            nid, tipo, z = f"N{i}", "juncao", (z_tub if sistema == "agua_fria" else z_piso)
        ids[i] = nid
        rede.add_no(No(nid, x * esc, y * esc, z, tipo, aparelho_no.get(i)))
    k = 0
    for filho, p in pai.items():
        if p is None:
            continue
        k += 1
        if sistema == "agua_fria":
            de, para = ids[p], ids[filho]
        else:
            de, para = ids[filho], ids[p]
        rede.add_trecho(Trecho(f"T{k}", de, para))
    return rede


def anotar_dxf(entrada: str | Path, saida: str | Path, rede: Rede, resultado, escala_para_m: float = 1.0,
               camada: str = "OH-DIMENSIONAMENTO", altura_texto: float | None = None) -> Path:
    """Grava uma cópia do DXF com o DN (e a declividade, no esgoto) de cada trecho."""
    doc = ezdxf.readfile(str(entrada))
    msp = doc.modelspace()
    if camada not in doc.layers:
        doc.layers.add(camada, color=1)
    h = altura_texto or 0.12 / escala_para_m
    for r in resultado.trechos:
        a, b = rede.nos[r.de], rede.nos[r.para]
        xm, ym = (a.x + b.x) / 2 / escala_para_m, (a.y + b.y) / 2 / escala_para_m
        ang = math.degrees(math.atan2(b.y - a.y, b.x - a.x))
        if ang > 90 or ang < -90:
            ang += 180
        # afasta o texto da linha (normal à esquerda do sentido de leitura)
        rad = math.radians(ang)
        xm, ym = xm - math.sin(rad) * h * 0.4, ym + math.cos(rad) * h * 0.4
        txt = f"Ø{r.dn}"
        if getattr(r, "declividade", None):
            txt += f" i={r.declividade:.0%}"
        msp.add_text(txt, height=h, rotation=ang,
                     dxfattribs={"layer": camada}).set_placement((xm, ym), align=ezdxf.enums.TextEntityAlignment.BOTTOM_CENTER)
    doc.saveas(str(saida))
    return Path(saida)
