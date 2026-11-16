"""Dimensionamento de rede predial de água fria (NBR 5626, método da soma dos pesos).

Fluxo:
1. valida a árvore a partir do reservatório;
2. acumula a soma dos pesos a jusante de cada trecho e calcula a vazão provável;
3. escolhe o menor DN que respeita a velocidade máxima (sem reduzir DN rumo ao
   reservatório);
4. calcula perdas de carga e pressões dinâmicas/estáticas em cada nó;
5. se algum ponto ficar abaixo da pressão mínima, aumenta o DN do trecho de
   maior perda no caminho crítico e repete.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..modelo import Rede, Trecho
from ..normas import nbr5626 as N
from ..normas.nbr5626 import KPA_POR_MCA, ParametrosAguaFria


@dataclass
class ResultadoTrechoAF:
    id: str
    de: str
    para: str
    soma_pesos: float
    vazao_ls: float
    dn: int
    referencia: str
    di_mm: float
    velocidade_ms: float
    perda_unitaria: float      # m/m
    comprimento_m: float
    comprimento_equiv_m: float
    perda_carga_m: float
    imposto: bool = False


@dataclass
class ResultadoNoAF:
    id: str
    z: float
    aparelho: str | None
    pressao_dinamica_kpa: float
    pressao_estatica_kpa: float
    pressao_min_kpa: float | None
    ok: bool


@dataclass
class ResultadoAguaFria:
    rede: str
    trechos: list[ResultadoTrechoAF]
    nos: list[ResultadoNoAF]
    alertas: list[str] = field(default_factory=list)
    iteracoes: int = 0
    parametros: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return all(n.ok for n in self.nos) and not any(a.startswith("ERRO") for a in self.alertas)


def _raiz(rede: Rede) -> str:
    raizes = [n.id for n in rede.nos.values() if n.tipo == "reservatorio"]
    if len(raizes) != 1:
        raise ValueError(f"A rede de água fria precisa de exatamente 1 nó tipo 'reservatorio' (achei {len(raizes)})")
    return raizes[0]


def _ordem(rede: Rede, raiz: str) -> list[Trecho]:
    """Trechos em ordem de montante para jusante (BFS a partir da raiz)."""
    entrada = rede.entrada()
    if raiz in entrada:
        raise ValueError("O reservatório não pode receber trechos")
    filhos = rede.filhos()
    ordem, fila, vistos = [], [raiz], {raiz}
    while fila:
        n = fila.pop(0)
        for t in filhos[n]:
            if t.para in vistos:
                raise ValueError(f"Ciclo detectado no trecho {t.id}")
            vistos.add(t.para)
            ordem.append(t)
            fila.append(t.para)
    soltos = set(rede.nos) - vistos
    if soltos:
        raise ValueError(f"Nós não conectados ao reservatório: {sorted(soltos)}")
    return ordem


def _peso_no(rede: Rede, nid: str) -> tuple[float, float, int]:
    """(peso, vazão máx. de projeto, DN mínimo) do aparelho do nó."""
    no = rede.nos[nid]
    if not no.aparelho:
        return 0.0, 0.0, 0
    try:
        ap = N.APARELHOS_AF[no.aparelho]
    except KeyError as e:
        raise KeyError(f"Nó {nid}: aparelho '{no.aparelho}' não existe na tabela de água fria") from e
    return ap.peso * no.quantidade, ap.vazao_ls * no.quantidade, N.DN_MIN_SUB_RAMAL.get(no.aparelho, 0)


def dimensionar_agua_fria(rede: Rede, params: ParametrosAguaFria | None = None,
                          nivel_agua_m: float | None = None, max_iter: int = 200) -> ResultadoAguaFria:
    """Dimensiona a rede.

    nivel_agua_m: altura da lâmina d'água acima da cota (z) do nó reservatório.
    Por segurança o padrão é 0 (reservatório no nível mínimo / saída).
    """
    if rede.sistema != "agua_fria":
        raise ValueError("Rede não é de água fria")
    p = params or ParametrosAguaFria(**{k: v for k, v in rede.parametros.items()
                                        if k in ParametrosAguaFria.__dataclass_fields__})
    if nivel_agua_m is None:
        nivel_agua_m = float(rede.parametros.get("nivel_agua_m", 0.0))
    tubos = N.TUBOS[p.material]
    dns = [t.dn for t in tubos]
    raiz = _raiz(rede)
    ordem = _ordem(rede, raiz)
    alertas: list[str] = []

    # --- soma de pesos / vazões / DN mínimo a jusante (de jusante p/ montante)
    peso_sub: dict[str, float] = {}
    vaz_sub: dict[str, float] = {}
    dnmin_sub: dict[str, int] = {}
    for n in rede.nos:
        peso_sub[n], vaz_sub[n], dnmin_sub[n] = _peso_no(rede, n)
    for t in reversed(ordem):
        peso_sub[t.de] += peso_sub[t.para]
        vaz_sub[t.de] += vaz_sub[t.para]
    # DN mínimo herdado do aparelho só vale para o caminho até ele
    q: dict[str, float] = {}
    sp: dict[str, float] = {}
    for t in ordem:
        sp[t.id] = peso_sub[t.para]
        q[t.id] = min(N.vazao_por_pesos(sp[t.id]), vaz_sub[t.para]) if sp[t.id] > 0 else 0.0
        if sp[t.id] == 0:
            alertas.append(f"AVISO trecho {t.id}: nenhum aparelho a jusante")

    # --- DN inicial por velocidade
    dn: dict[str, int] = {}

    def menor_dn(q_ls: float, dmin: int) -> int:
        for tb in tubos:
            if tb.dn < dmin:
                continue
            if N.velocidade(q_ls, tb.di_mm) <= p.velocidade_max_ms + 1e-9:
                return tb.dn
        alertas.append(f"ERRO vazão {q_ls:.2f} L/s excede o maior DN cadastrado")
        return tubos[-1].dn

    for t in ordem:
        if t.dn is not None:
            if t.dn not in dns:
                raise ValueError(f"Trecho {t.id}: DN {t.dn} não cadastrado para {p.material}")
            dn[t.id] = t.dn
        else:
            dn[t.id] = menor_dn(q[t.id], max(p.dn_minimo, dnmin_sub[t.para]))

    filhos = rede.filhos()
    entrada = rede.entrada()

    def monotonico():
        # DN de um trecho nunca menor que o dos trechos imediatamente a jusante
        for t in reversed(ordem):
            if t.dn is not None:
                continue
            jus = [dn[f.id] for f in filhos[t.para]]
            if jus and max(jus) > dn[t.id]:
                dn[t.id] = max(jus)

    monotonico()

    def calcular():
        res_t: dict[str, ResultadoTrechoAF] = {}
        hd: dict[str, float] = {raiz: nivel_agua_m}   # pressão dinâmica em mca
        for t in ordem:
            tb = N.tubo(p.material, dn[t.id])
            L = rede.comprimento(t)
            leq = sum(N.comprimento_equivalente(pc, tb.dn, p.material) * qtd for pc, qtd in t.conexoes.items())
            if not t.conexoes and p.acrescimo_localizadas:
                leq = L * p.acrescimo_localizadas
            if p.formula_perda == "darcy":
                J = N.perda_unitaria_darcy(q[t.id], tb.di_mm)
            else:
                J = N.perda_unitaria_fwh(q[t.id], tb.di_mm, p.material)
            hf = J * (L + leq)
            za, zb = rede.nos[t.de].z, rede.nos[t.para].z
            hd[t.para] = hd[t.de] + (za - zb) - hf
            res_t[t.id] = ResultadoTrechoAF(
                t.id, t.de, t.para, round(sp[t.id], 3), q[t.id], tb.dn, tb.referencia, tb.di_mm,
                N.velocidade(q[t.id], tb.di_mm), J, L, leq, hf, t.dn is not None)
        return res_t, hd

    z_na = rede.nos[raiz].z + nivel_agua_m
    it = 0
    while True:
        res_t, hd = calcular()
        falhas = []
        for nid, no in rede.nos.items():
            if nid == raiz:
                continue
            pmin = p.pressao_min_rede_kpa
            if no.aparelho:
                ap = N.APARELHOS_AF.get(no.aparelho)
                pmin = (ap.pressao_min_kpa if ap and ap.pressao_min_kpa is not None else p.pressao_min_ponto_kpa)
            if hd[nid] * KPA_POR_MCA < pmin - 1e-6:
                falhas.append((hd[nid] * KPA_POR_MCA - pmin, nid))
        if not falhas or not p.dimensionar_por_pressao or it >= max_iter:
            break
        # caminho crítico: nó com maior déficit
        _, critico = min(falhas)
        caminho = []
        n = critico
        while n in entrada:
            caminho.append(entrada[n])
            n = entrada[n].de
        candidatos = [t for t in caminho if t.dn is None and dn[t.id] != dns[-1]]
        if not candidatos:
            break
        alvo = max(candidatos, key=lambda t: res_t[t.id].perda_carga_m)
        if res_t[alvo.id].perda_carga_m <= 1e-9:
            break   # déficit é geométrico (desnível), aumentar DN não resolve
        dn[alvo.id] = dns[dns.index(dn[alvo.id]) + 1]
        # mantém montante >= jusante
        n = alvo.de
        while n in entrada:
            tm = entrada[n]
            if tm.dn is None and dn[tm.id] < dn[alvo.id]:
                dn[tm.id] = dn[alvo.id]
            n = tm.de
        it += 1

    nos_res = []
    for nid, no in rede.nos.items():
        pd_kpa = hd[nid] * KPA_POR_MCA
        pe_kpa = (z_na - no.z) * KPA_POR_MCA
        pmin = None
        if nid != raiz:
            pmin = p.pressao_min_rede_kpa
            if no.aparelho:
                ap = N.APARELHOS_AF.get(no.aparelho)
                pmin = (ap.pressao_min_kpa if ap and ap.pressao_min_kpa is not None else p.pressao_min_ponto_kpa)
        ok = (pmin is None or pd_kpa >= pmin - 1e-6) and pe_kpa <= p.pressao_max_estatica_kpa
        if pmin is not None and pd_kpa < pmin - 1e-6:
            alertas.append(f"ERRO nó {nid}: pressão dinâmica {pd_kpa:.1f} kPa < mínimo {pmin:.0f} kPa")
        if pe_kpa > p.pressao_max_estatica_kpa:
            alertas.append(f"ERRO nó {nid}: pressão estática {pe_kpa:.0f} kPa > {p.pressao_max_estatica_kpa:.0f} kPa "
                           "(prever válvula redutora de pressão)")
        nos_res.append(ResultadoNoAF(nid, no.z, no.aparelho, pd_kpa, pe_kpa, pmin, ok))

    for r in res_t.values():
        if r.velocidade_ms > p.velocidade_max_ms + 1e-6:
            alertas.append(f"ERRO trecho {r.id}: velocidade {r.velocidade_ms:.2f} m/s > {p.velocidade_max_ms} m/s")

    return ResultadoAguaFria(rede.nome, [res_t[t.id] for t in ordem], nos_res, alertas, it,
                             {k: getattr(p, k) for k in ParametrosAguaFria.__dataclass_fields__ if k != "extras"}
                             | {"nivel_agua_m": nivel_agua_m})
