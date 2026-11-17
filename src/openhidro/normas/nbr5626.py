"""Tabelas e parâmetros de água fria — ABNT NBR 5626.

Os pesos relativos e vazões de projeto seguem a tabela do método da soma dos
pesos (NBR 5626:1998, Anexo A). A NBR 5626:2020 retirou esse roteiro e essas
tabelas do texto da norma e deixou a escolha do método de cálculo a cargo do
projetista (que deve justificá-lo); a soma dos pesos continua sendo o método
mais usado na prática e é o adotado aqui. Os limites de velocidade e pressão
ficam em ParametrosAguaFria para que o projetista ajuste ao critério adotado.

ATENÇÃO: todos os valores desta tabela precisam ser conferidos contra a norma
vigente antes de uso em projeto (ver docs/conferencia-normas.md). Os limites
de pressão e velocidade são parâmetros configuráveis (ParametrosAguaFria).
"""
from __future__ import annotations

from dataclasses import dataclass, field

# --------------------------------------------------------------------------
# Aparelhos: peso relativo e vazão de projeto (L/s)
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class AparelhoAF:
    chave: str
    descricao: str
    peso: float
    vazao_ls: float
    # pressão dinâmica mínima no ponto de utilização (kPa); None = padrão geral
    pressao_min_kpa: float | None = None


APARELHOS_AF: dict[str, AparelhoAF] = {a.chave: a for a in [
    AparelhoAF("bacia_caixa_descarga", "Bacia sanitária com caixa de descarga", 0.3, 0.15, 5.0),
    AparelhoAF("bacia_valvula_descarga", "Bacia sanitária com válvula de descarga", 32.0, 1.70),
    AparelhoAF("banheira", "Banheira (misturador, água fria)", 1.0, 0.30),
    AparelhoAF("bebedouro", "Bebedouro", 0.1, 0.10),
    AparelhoAF("bide", "Bidê (misturador, água fria)", 0.1, 0.10),
    AparelhoAF("chuveiro", "Chuveiro ou ducha (misturador, água fria)", 0.4, 0.20),
    # Ducha higiênica: não consta da tabela de pesos; adotada por equivalência ao bidê (mesma função,
    # mesma peça de utilização de 1/2"). PENDENTE de fonte normativa — ver docs/conferencia-normas.md.
    AparelhoAF("ducha_higienica", "Ducha higiênica (equivalente ao bidê — conferir)", 0.1, 0.10),
    AparelhoAF("chuveiro_eletrico", "Chuveiro elétrico", 0.1, 0.10),
    AparelhoAF("lavadora", "Máquina de lavar pratos ou roupas", 1.0, 0.30),
    AparelhoAF("lavatorio", "Lavatório (torneira ou misturador, água fria)", 0.3, 0.15),
    AparelhoAF("mictorio_valvula", "Mictório cerâmico com sifão integrado e válvula de descarga", 2.8, 0.50),
    AparelhoAF("mictorio_caixa", "Mictório cerâmico sem sifão integrado (caixa, registro ou válvula)", 0.3, 0.15),
    AparelhoAF("mictorio_calha", "Mictório tipo calha (por metro)", 0.3, 0.15),
    AparelhoAF("pia", "Pia — torneira ou misturador (água fria)", 0.7, 0.25),
    AparelhoAF("pia_torneira_eletrica", "Pia — torneira elétrica", 0.1, 0.10),
    AparelhoAF("tanque", "Tanque", 0.7, 0.25),
    AparelhoAF("torneira_jardim", "Torneira de jardim ou lavagem em geral", 0.4, 0.20),
]}


# Alturas usuais dos pontos de utilização acima do piso acabado (m) — prática
# de projeto/catálogos; usadas quando a cota do ponto não é informada.
ALTURA_PONTO_M: dict[str, float] = {
    "bacia_caixa_descarga": 0.30,
    "bacia_valvula_descarga": 1.10,
    "banheira": 0.55,
    "bebedouro": 1.00,
    "bide": 0.30,
    "ducha_higienica": 0.45,
    "chuveiro": 2.20,
    "chuveiro_eletrico": 2.20,
    "lavadora": 0.90,
    "lavatorio": 0.60,
    "mictorio_valvula": 1.05,
    "mictorio_caixa": 1.05,
    "mictorio_calha": 1.05,
    "pia": 1.10,
    "pia_torneira_eletrica": 1.10,
    "tanque": 1.10,
    "torneira_jardim": 0.60,
}

# DN mínimo do sub-ramal por aparelho (mm, PVC soldável)
DN_MIN_SUB_RAMAL: dict[str, int] = {
    "bacia_valvula_descarga": 40,   # válvula de descarga 1 1/4" (verificar fabricante)
}


def vazao_por_pesos(soma_pesos: float) -> float:
    """Vazão provável (L/s) pelo método da soma dos pesos: Q = 0,3·√ΣP."""
    if soma_pesos <= 0:
        return 0.0
    return 0.3 * soma_pesos ** 0.5


# --------------------------------------------------------------------------
# Tubos
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Tubo:
    material: str
    dn: int               # diâmetro nominal / externo de referência (mm)
    referencia: str       # bitola comercial em polegadas
    di_mm: float          # diâmetro interno (mm)


# PVC rígido soldável marrom (NBR 5648) — diâmetros internos usuais de catálogo.
TUBOS_PVC_SOLDAVEL: list[Tubo] = [
    Tubo("pvc", 20, '1/2"', 17.0),
    Tubo("pvc", 25, '3/4"', 21.6),
    Tubo("pvc", 32, '1"', 27.8),
    Tubo("pvc", 40, '1 1/4"', 35.2),
    Tubo("pvc", 50, '1 1/2"', 44.0),
    Tubo("pvc", 60, '2"', 53.4),
    Tubo("pvc", 75, '2 1/2"', 66.6),
    Tubo("pvc", 85, '3"', 75.6),
    Tubo("pvc", 110, '4"', 97.8),
]

TUBOS: dict[str, list[Tubo]] = {"pvc": TUBOS_PVC_SOLDAVEL}


def tubo(material: str, dn: int) -> Tubo:
    for t in TUBOS[material]:
        if t.dn == dn:
            return t
    raise KeyError(f"DN {dn} não cadastrado para {material}")


# --------------------------------------------------------------------------
# Perda de carga localizada — comprimentos equivalentes (m), PVC soldável
# Valores de catálogo usuais de fabricantes, por DN 20..110.
# --------------------------------------------------------------------------

_DNS = [20, 25, 32, 40, 50, 60, 75, 85, 110]
_LEQ_PVC_TABELA: dict[str, list[float]] = {
    "joelho_90":        [1.1, 1.2, 1.5, 2.0, 3.2, 3.4, 3.7, 3.9, 4.3],
    "joelho_45":        [0.4, 0.5, 0.7, 1.0, 1.3, 1.5, 1.7, 1.8, 1.9],
    "curva_90":         [0.4, 0.5, 0.6, 0.7, 1.2, 1.3, 1.4, 1.5, 1.6],
    "curva_45":         [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    "te_passagem_direta": [0.7, 0.8, 0.9, 1.5, 2.2, 2.3, 2.4, 2.5, 2.6],
    "te_saida_lateral": [2.3, 2.4, 3.1, 4.6, 7.3, 7.6, 7.8, 8.0, 8.3],
    "te_saida_bilateral": [2.3, 2.4, 3.1, 4.6, 7.3, 7.6, 7.8, 8.0, 8.3],
    "entrada_normal":   [0.3, 0.4, 0.5, 0.6, 1.0, 1.5, 1.6, 2.0, 2.2],
    "entrada_borda":    [0.9, 1.0, 1.2, 1.8, 2.3, 2.8, 3.3, 3.7, 4.0],
    "saida_canalizacao": [0.8, 0.9, 1.3, 1.4, 3.2, 3.3, 3.5, 3.7, 3.9],
    "registro_gaveta":  [0.1, 0.2, 0.3, 0.4, 0.7, 0.8, 0.9, 0.9, 1.0],
    "registro_globo":   [11.1, 11.4, 15.0, 22.0, 35.8, 37.9, 38.0, 40.0, 42.3],
    "registro_angulo":  [5.9, 6.1, 8.4, 10.5, 17.0, 18.5, 19.0, 20.0, 22.1],
    "valvula_retencao_leve": [2.5, 2.7, 3.8, 4.9, 6.8, 7.1, 8.2, 9.3, 10.4],
    "valvula_pe_crivo": [8.1, 9.5, 13.3, 15.5, 18.3, 23.7, 25.0, 26.8, 28.6],
}

LEQ_PVC: dict[str, dict[int, float]] = {
    peca: dict(zip(_DNS, valores)) for peca, valores in _LEQ_PVC_TABELA.items()
}


def comprimento_equivalente(peca: str, dn: int, material: str = "pvc") -> float:
    if material != "pvc":
        raise NotImplementedError("Somente PVC soldável na v0.1")
    try:
        return LEQ_PVC[peca][dn]
    except KeyError as e:
        raise KeyError(f"Peça '{peca}' / DN {dn} sem comprimento equivalente cadastrado") from e


# --------------------------------------------------------------------------
# Perda de carga distribuída
# --------------------------------------------------------------------------


def perda_unitaria_fwh(q_ls: float, di_mm: float, material: str = "pvc") -> float:
    """Perda de carga unitária J (m/m) — fórmula de Fair-Whipple-Hsiao.

    PVC / cobre (tubo liso):  J = 0,0008695 · Q^1,75 / D^4,75
    Aço galvanizado:          J = 0,002021  · Q^1,88 / D^4,88
    com Q em m³/s e D em m.
    """
    if q_ls <= 0:
        return 0.0
    q = q_ls / 1000.0
    d = di_mm / 1000.0
    if material in ("pvc", "cobre"):
        return 0.0008695 * q ** 1.75 / d ** 4.75
    if material == "galvanizado":
        return 0.002021 * q ** 1.88 / d ** 4.88
    raise ValueError(f"Material desconhecido: {material}")


def perda_unitaria_darcy(q_ls: float, di_mm: float, rugosidade_mm: float = 0.0015,
                         temperatura_c: float = 20.0) -> float:
    """Perda de carga unitária J (m/m) — Darcy-Weisbach com fator de atrito de
    Swamee-Jain (aproximação explícita de Colebrook-White)."""
    import math

    if q_ls <= 0:
        return 0.0
    q = q_ls / 1000.0
    d = di_mm / 1000.0
    area = math.pi * d * d / 4
    v = q / area
    # viscosidade cinemática da água (m²/s) — aproximação para 0–40 °C
    nu = 1.792e-6 / (1 + 0.0337 * temperatura_c + 0.000221 * temperatura_c ** 2)
    re = v * d / nu
    if re < 2000:
        f = 64 / re
    else:
        f = 0.25 / (math.log10(rugosidade_mm / 1000 / (3.7 * d) + 5.74 / re ** 0.9)) ** 2
    return f * v * v / (2 * 9.81 * d)


def velocidade(q_ls: float, di_mm: float) -> float:
    import math

    d = di_mm / 1000.0
    return (q_ls / 1000.0) / (math.pi * d * d / 4)


# --------------------------------------------------------------------------
# Parâmetros de verificação
# --------------------------------------------------------------------------


@dataclass
class ParametrosAguaFria:
    material: str = "pvc"
    formula_perda: str = "fwh"            # "fwh" (Fair-Whipple-Hsiao) ou "darcy"
    velocidade_max_ms: float = 3.0
    pressao_min_ponto_kpa: float = 10.0   # pontos de utilização
    pressao_min_rede_kpa: float = 5.0     # qualquer ponto da rede
    pressao_max_estatica_kpa: float = 400.0
    acrescimo_localizadas: float = 0.0    # fração de L real somada como perdas localizadas
                                          # quando o trecho não informa conexões (ex.: 0,2 = 20 %)
    dn_minimo: int = 20
    dimensionar_por_pressao: bool = True  # aumenta diâmetros até atender pressão mínima
    extras: dict = field(default_factory=dict)


KPA_POR_MCA = 9.80665
