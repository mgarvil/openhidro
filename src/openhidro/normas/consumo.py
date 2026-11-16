"""Consumo diário de água e reservação.

Valores de consumo per capita de uso corrente na literatura técnica brasileira
(referência usual: Macintyre, "Instalações Hidráulicas Prediais e Industriais").
Confirmar com o órgão local/concessionária e, para reserva de incêndio, com a
Instrução Técnica do Corpo de Bombeiros do estado.
"""
from __future__ import annotations

from dataclasses import dataclass

# (litros/dia, unidade)
CONSUMO_PER_CAPITA: dict[str, tuple[float, str]] = {
    "apartamento": (200, "pessoa"),
    "residencia": (150, "pessoa"),
    "residencia_alto_padrao": (300, "pessoa"),
    "residencia_popular": (120, "pessoa"),
    "escritorio": (50, "pessoa"),
    "escola_externato": (50, "aluno"),
    "escola_semi_internato": (100, "aluno"),
    "escola_internato": (150, "aluno"),
    "hospital": (250, "leito"),
    "hotel_sem_cozinha": (120, "hóspede"),
    "hotel_com_cozinha": (250, "hóspede"),
    "restaurante": (25, "refeição"),
    "quartel": (150, "pessoa"),
    "industria_uso_pessoal": (70, "operário"),
    "cinema_teatro": (2, "lugar"),
    "templo": (2, "lugar"),
    "garagem": (50, "automóvel"),
    "lavanderia": (30, "kg de roupa"),
    "mercado": (5, "m²"),
    "jardim": (1.5, "m²"),
}


@dataclass
class ResultadoReservatorio:
    consumo_diario_l: float
    dias_reserva: float
    reserva_consumo_l: float
    reserva_incendio_l: float
    volume_total_l: float
    volume_inferior_l: float
    volume_superior_l: float
    detalhes: list[str]


def dimensionar_reservatorio(ocupacoes: list[tuple[str, float]],
                             dias_reserva: float = 2.0,
                             reserva_incendio_l: float = 0.0,
                             fracao_superior: float = 0.4,
                             incendio_no_superior: bool = True) -> ResultadoReservatorio:
    """ocupacoes: lista de (tipo, quantidade), ex.: [("escritorio", 120)].

    Divisão usual: 2/5 no reservatório superior e 3/5 no inferior (fracao_superior=0,4).
    Use fracao_superior=1 quando houver apenas reservatório elevado.
    """
    detalhes = []
    total = 0.0
    for tipo, qtd in ocupacoes:
        per_capita, unidade = CONSUMO_PER_CAPITA[tipo]
        c = per_capita * qtd
        total += c
        detalhes.append(f"{tipo}: {qtd:g} {unidade} × {per_capita:g} L/dia = {c:,.0f} L/dia")
    reserva = total * dias_reserva
    sup = reserva * fracao_superior + (reserva_incendio_l if incendio_no_superior else 0)
    inf = reserva * (1 - fracao_superior) + (0 if incendio_no_superior else reserva_incendio_l)
    return ResultadoReservatorio(total, dias_reserva, reserva, reserva_incendio_l,
                                 reserva + reserva_incendio_l, inf, sup, detalhes)
