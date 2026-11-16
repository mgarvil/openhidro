"""Dimensionamento de esgoto sanitário (NBR 8160, método das UHC).

O trecho vai no sentido do escoamento (do aparelho para a saída). A rede deve
ser uma árvore convergente: cada nó tem no máximo um trecho de saída, e há
um único nó final (sem saída) — a caixa de inspeção / ligação à rede pública.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..modelo import Rede, Trecho
from ..normas import nbr8160 as E

TIPOS = ("ramal_descarga", "ramal_esgoto", "tubo_queda", "subcoletor", "coletor")


@dataclass
class ResultadoTrechoES:
    id: str
    de: str
    para: str
    tipo: str
    uhc: float
    dn: int
    comprimento_m: float
    declividade: float | None
    declividade_min: float | None
    recebe_bacia: bool
    imposto: bool = False


@dataclass
class ResultadoEsgoto:
    rede: str
    trechos: list[ResultadoTrechoES]
    ventilacao: list[dict]
    alertas: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not any(a.startswith("ERRO") for a in self.alertas)


def _ordem(rede: Rede) -> tuple[list[Trecho], str]:
    saida: dict[str, Trecho] = {}
    for t in rede.trechos.values():
        if t.de in saida:
            raise ValueError(f"O nó '{t.de}' tem mais de um trecho de saída ({saida[t.de].id}, {t.id}); "
                             "no esgoto cada nó deve escoar para um único trecho")
        saida[t.de] = t
    finais = [n for n in rede.nos if n not in saida and any(t.para == n for t in rede.trechos.values())]
    if len(finais) != 1:
        raise ValueError(f"A rede de esgoto precisa de um único nó final; encontrei {finais}")
    final = finais[0]
    entrada: dict[str, list[Trecho]] = {n: [] for n in rede.nos}
    for t in rede.trechos.values():
        entrada[t.para].append(t)
    # ordem de montante para jusante: pós-ordem a partir do nó final
    ordem: list[Trecho] = []
    visit = set()

    def dfs(n):
        for t in entrada[n]:
            if t.id in visit:
                raise ValueError(f"Ciclo no trecho {t.id}")
            visit.add(t.id)
            dfs(t.de)
            ordem.append(t)

    dfs(final)
    soltos = set(rede.trechos) - visit
    if soltos:
        raise ValueError(f"Trechos não conectados ao nó final: {sorted(soltos)}")
    return ordem, final


def _inferir_tipo(rede: Rede, t: Trecho, entrada_cnt: dict[str, int], a_jusante_de_tq: bool,
                  uhc: float) -> str:
    if t.tipo:
        if t.tipo not in TIPOS:
            raise ValueError(f"Trecho {t.id}: tipo '{t.tipo}' inválido; use {TIPOS}")
        return t.tipo
    a, b = rede.nos[t.de], rede.nos[t.para]
    horiz = ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) ** 0.5
    if abs(a.z - b.z) > max(horiz, 1.0):
        return "tubo_queda"
    if a.aparelho and entrada_cnt[t.de] == 0:
        return "ramal_descarga"
    if a_jusante_de_tq or uhc > E.RAMAL_ESGOTO_MAX_UHC[100]:
        return "subcoletor"
    return "ramal_esgoto"


def dimensionar_esgoto(rede: Rede, pavimentos: int | None = None,
                       declividade_padrao: float | None = None) -> ResultadoEsgoto:
    if rede.sistema != "esgoto":
        raise ValueError("Rede não é de esgoto")
    pavimentos = pavimentos or int(rede.parametros.get("pavimentos", 1))
    declividade_padrao = declividade_padrao or rede.parametros.get("declividade_padrao")
    ordem, final = _ordem(rede)
    alertas: list[str] = []

    entrada_cnt = {n: 0 for n in rede.nos}
    for t in rede.trechos.values():
        entrada_cnt[t.para] += 1

    uhc_no: dict[str, float] = {}
    bacia_no: dict[str, bool] = {}
    for nid, no in rede.nos.items():
        u, b = 0.0, False
        if no.aparelho:
            ap = E.APARELHOS_ES.get(no.aparelho)
            if ap is None:
                raise KeyError(f"Nó {nid}: aparelho '{no.aparelho}' não existe na tabela de esgoto")
            u = ap.uhc * no.quantidade
            b = no.aparelho in ("bacia", "lavador_comadre")
        uhc_no[nid], bacia_no[nid] = u, b

    uhc_t: dict[str, float] = {}
    bacia_t: dict[str, bool] = {}
    dn: dict[str, int] = {}
    tipo: dict[str, str] = {}
    tq_montante: dict[str, bool] = {}   # há tubo de queda a montante?
    chegada: dict[str, list[Trecho]] = {n: [] for n in rede.nos}
    for t in rede.trechos.values():
        chegada[t.para].append(t)

    res = []
    for t in ordem:   # montante -> jusante
        ups = chegada[t.de]
        u = uhc_no[t.de] + sum(uhc_t[x.id] for x in ups)
        b = bacia_no[t.de] or any(bacia_t[x.id] for x in ups)
        tqm = any(tipo[x.id] == "tubo_queda" or tq_montante[x.id] for x in ups)
        uhc_t[t.id], bacia_t[t.id], tq_montante[t.id] = u, b, tqm
        tp = _inferir_tipo(rede, t, entrada_cnt, tqm, u)
        tipo[t.id] = tp

        dn_up = max((dn[x.id] for x in ups), default=0)
        no_de = rede.nos[t.de]
        if tp == "ramal_descarga":
            if no_de.aparelho:
                d = E.APARELHOS_ES[no_de.aparelho].dn_min_ramal_descarga
            else:
                d = 40
        elif tp == "ramal_esgoto":
            d = E.dn_ramal_esgoto(u)
        elif tp == "tubo_queda":
            d = E.dn_tubo_queda(u, pavimentos)
        else:
            dec = t.declividade or _declividade(rede, t) or declividade_padrao or 0.01
            d = max(100, E.dn_coletor(u, dec))
        d = max(d, dn_up)
        if b and tp != "ramal_descarga":
            d = max(d, 100)
        if t.dn is not None:
            if t.dn < d:
                alertas.append(f"ERRO trecho {t.id}: DN {t.dn} imposto é menor que o exigido (DN {d})")
            d = t.dn
        dn[t.id] = d

        dec = None
        dmin = None
        if tp != "tubo_queda":
            dec = t.declividade if t.declividade is not None else _declividade(rede, t)
            if dec is None:
                dec = declividade_padrao
            dmin = E.declividade_minima(d)
            if dec is not None:
                if dec < dmin - 1e-9:
                    alertas.append(f"ERRO trecho {t.id}: declividade {dec:.2%} < mínima {dmin:.0%} para DN {d}")
                elif dec > E.DECLIVIDADE_MAXIMA_RECOMENDADA + 1e-9 and tp != "ramal_descarga":
                    alertas.append(f"AVISO trecho {t.id}: declividade {dec:.2%} > 5 % recomendado")
        res.append(ResultadoTrechoES(t.id, t.de, t.para, tp, u, d, rede.comprimento(t), dec, dmin, b,
                                     t.dn is not None))

    # caixas sifonadas: limite usual de UHC por diâmetro
    LIM_CS = {100: 6, 125: 10, 150: 15}
    for nid, no in rede.nos.items():
        if no.tipo == "caixa_sifonada":
            u = sum(uhc_t[x.id] for x in chegada[nid]) + uhc_no[nid]
            diam = int(rede.parametros.get("diametro_caixa_sifonada", 100))
            if u > LIM_CS.get(diam, 6):
                alertas.append(f"AVISO caixa sifonada {nid}: {u:g} UHC acima do usual para CS {diam} "
                               f"({LIM_CS.get(diam, 6)} UHC)")

    # ventilação: um ramal de ventilação por ramal de esgoto (sugestão)
    vent = []
    for r in res:
        if r.tipo == "ramal_esgoto":
            try:
                d = E.dn_ramal_ventilacao(r.uhc, r.recebe_bacia)
                vent.append({"trecho": r.id, "uhc": r.uhc, "com_bacia": r.recebe_bacia, "dn_ventilacao": d})
            except ValueError as e:
                alertas.append(f"AVISO trecho {r.id}: {e}")
    if any(r.tipo == "tubo_queda" for r in res):
        alertas.append("AVISO todo tubo de queda deve ser prolongado como tubo ventilador primário ou "
                       "ligado a coluna de ventilação — verificar")

    return ResultadoEsgoto(rede.nome, res, vent, alertas)


def _declividade(rede: Rede, t: Trecho) -> float | None:
    a, b = rede.nos[t.de], rede.nos[t.para]
    horiz = ((b.x - a.x) ** 2 + (b.y - a.y) ** 2) ** 0.5
    if horiz <= 1e-6 or (a.z == 0 and b.z == 0):
        return None
    return (a.z - b.z) / horiz
