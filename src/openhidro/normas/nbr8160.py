"""Tabelas de esgoto sanitário — ABNT NBR 8160:1999.

Método das Unidades de Hunter de Contribuição (UHC).

ATENÇÃO: conferir todos os valores contra a norma antes de uso em projeto
(ver docs/conferencia-normas.md).
"""
from __future__ import annotations

from dataclasses import dataclass

DNS_ESGOTO = [40, 50, 75, 100, 150, 200, 250, 300, 400]


@dataclass(frozen=True)
class AparelhoES:
    chave: str
    descricao: str
    uhc: float
    dn_min_ramal_descarga: int
    sifonado_proprio: bool = True   # possui desconector próprio


# Tabela 3 — UHC e DN mínimo do ramal de descarga
APARELHOS_ES: dict[str, AparelhoES] = {a.chave: a for a in [
    AparelhoES("bacia", "Bacia sanitária", 6, 100),
    AparelhoES("banheira", "Banheira de residência", 2, 40, False),
    AparelhoES("bebedouro", "Bebedouro", 0.5, 40, False),
    AparelhoES("bide", "Bidê", 1, 40, False),
    AparelhoES("chuveiro", "Chuveiro de residência", 2, 40, False),
    AparelhoES("chuveiro_coletivo", "Chuveiro coletivo", 4, 40, False),
    AparelhoES("lavador_comadre", "Lavador de comadre", 6, 100),
    AparelhoES("lavatorio", "Lavatório de residência", 1, 40, False),
    AparelhoES("lavatorio_coletivo", "Lavatório de uso geral", 2, 40, False),
    AparelhoES("maquina_louca", "Máquina de lavar louças", 2, 50),
    AparelhoES("maquina_roupa", "Máquina de lavar roupas", 3, 50),
    AparelhoES("mictorio_valvula", "Mictório com válvula de descarga", 6, 75),
    AparelhoES("mictorio_caixa", "Mictório com caixa de descarga", 5, 50),
    AparelhoES("mictorio_automatico", "Mictório com descarga automática", 2, 40),
    AparelhoES("mictorio_calha", "Mictório de calha (por metro)", 2, 50),
    AparelhoES("pia", "Pia de cozinha residencial", 3, 50),
    AparelhoES("pia_industrial", "Pia de cozinha industrial — preparação", 3, 50),
    AparelhoES("pia_industrial_panelas", "Pia de cozinha industrial — lavagem de panelas", 4, 50),
    AparelhoES("tanque", "Tanque de lavar roupas", 3, 40),
]}

# Tabela 4 — aparelhos não relacionados: UHC pelo DN do ramal de descarga
UHC_POR_DN_RAMAL = {40: 2, 50: 3, 75: 5, 100: 6}

# Tabela 5 — ramais de esgoto: nº máximo de UHC por DN
RAMAL_ESGOTO_MAX_UHC = {40: 3, 50: 6, 75: 20, 100: 160}

# Tabela 6 — tubos de queda: nº máx. de UHC (prédio até 3 pavimentos, prédio com mais de 3 pavimentos)
TUBO_QUEDA_MAX_UHC = {
    40: (4, 8),
    50: (10, 24),
    75: (30, 70),
    100: (240, 500),
    150: (960, 1900),
    200: (2200, 3600),
    250: (3800, 5600),
    300: (6000, 8400),
}

# Tabela 7 — subcoletores e coletor predial: nº máx. de UHC por DN e declividade
DECLIVIDADES_COLETOR = [0.005, 0.01, 0.02, 0.04]
COLETOR_MAX_UHC = {
    100: (None, 180, 216, 250),
    150: (None, 700, 840, 1000),
    200: (1400, 1600, 1920, 2300),
    250: (2500, 2900, 3500, 4200),
    300: (3900, 4600, 5600, 6700),
    400: (7000, 8300, 10000, 12000),
}

# Tabela 8 — ramais de ventilação
# (sem bacia: até UHC -> DN) ; (com bacia: até UHC -> DN)
RAMAL_VENTILACAO_SEM_BACIA = [(12, 40), (18, 50), (36, 75)]
RAMAL_VENTILACAO_COM_BACIA = [(17, 50), (60, 75)]


def declividade_minima(dn: int) -> float:
    """Declividade mínima de ramais e coletores horizontais (m/m)."""
    return 0.02 if dn <= 75 else 0.01


DECLIVIDADE_MAXIMA_RECOMENDADA = 0.05


def dn_ramal_esgoto(uhc: float) -> int:
    for dn in sorted(RAMAL_ESGOTO_MAX_UHC):
        if uhc <= RAMAL_ESGOTO_MAX_UHC[dn]:
            return dn
    raise ValueError(f"{uhc} UHC excede o ramal de esgoto DN100 (160 UHC); usar subcoletor")


def dn_tubo_queda(uhc_total: float, pavimentos: int = 1) -> int:
    col = 0 if pavimentos <= 3 else 1
    for dn in sorted(TUBO_QUEDA_MAX_UHC):
        if uhc_total <= TUBO_QUEDA_MAX_UHC[dn][col]:
            return dn
    raise ValueError(f"{uhc_total} UHC excede a Tabela 6")


def dn_coletor(uhc: float, declividade: float) -> int:
    """DN de subcoletor / coletor predial (Tabela 7). Usa a coluna de declividade
    tabelada imediatamente inferior ou igual à informada (a favor da segurança)."""
    cols = [i for i, d in enumerate(DECLIVIDADES_COLETOR) if d <= declividade + 1e-9]
    if not cols:
        raise ValueError(f"Declividade {declividade:.3%} abaixo do mínimo tabelado (0,5 %)")
    col = cols[-1]
    for dn in sorted(COLETOR_MAX_UHC):
        lim = COLETOR_MAX_UHC[dn][col]
        if lim is not None and uhc <= lim:
            return dn
    raise ValueError(f"{uhc} UHC excede a Tabela 7 com declividade {declividade:.1%}")


def dn_ramal_ventilacao(uhc: float, tem_bacia: bool) -> int:
    tabela = RAMAL_VENTILACAO_COM_BACIA if tem_bacia else RAMAL_VENTILACAO_SEM_BACIA
    for lim, dn in tabela:
        if uhc <= lim:
            return dn
    raise ValueError("UHC acima da Tabela 8 — ventilar por coluna de ventilação dimensionada")
