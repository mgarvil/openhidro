import math

import pytest

from openhidro.normas import nbr5626 as N
from openhidro.normas import nbr8160 as E
from openhidro.normas.consumo import dimensionar_reservatorio


def test_vazao_por_pesos():
    assert N.vazao_por_pesos(32) == pytest.approx(1.697, abs=1e-3)   # válvula de descarga
    assert N.vazao_por_pesos(1) == pytest.approx(0.30)
    assert N.vazao_por_pesos(0) == 0


def test_fair_whipple_hsiao_pvc_mao():
    # Q = 0,5 L/s, DN 25 (Di 21,6 mm): J = 0,0008695 · 0,0005^1,75 / 0,0216^4,75
    esperado = 0.0008695 * 0.0005 ** 1.75 / 0.0216 ** 4.75
    assert N.perda_unitaria_fwh(0.5, 21.6) == pytest.approx(esperado)
    assert 0.11 < esperado < 0.13


def test_darcy_proximo_de_fwh_para_pvc():
    j1 = N.perda_unitaria_fwh(0.5, 21.6)
    j2 = N.perda_unitaria_darcy(0.5, 21.6)
    assert abs(j1 - j2) / j1 < 0.25


def test_velocidade():
    v = N.velocidade(1.0, 27.8)
    assert v == pytest.approx(0.001 / (math.pi * 0.0278 ** 2 / 4))


def test_comprimento_equivalente():
    assert N.comprimento_equivalente("joelho_90", 25) == 1.2
    with pytest.raises(KeyError):
        N.comprimento_equivalente("joelho_90", 26)


def test_tabelas_esgoto():
    assert E.dn_ramal_esgoto(3) == 40
    assert E.dn_ramal_esgoto(6) == 50
    assert E.dn_ramal_esgoto(20) == 75
    assert E.dn_ramal_esgoto(21) == 100
    assert E.dn_tubo_queda(30) == 75
    assert E.dn_tubo_queda(31) == 100
    assert E.dn_tubo_queda(60, pavimentos=5) == 75
    assert E.dn_tubo_queda(260, pavimentos=5) == 100
    assert E.dn_coletor(180, 0.01) == 100
    assert E.dn_coletor(181, 0.01) == 150
    assert E.dn_coletor(216, 0.03) == 100   # usa a coluna de 2 %
    with pytest.raises(ValueError):
        E.dn_coletor(10, 0.004)
    assert E.declividade_minima(75) == 0.02
    assert E.declividade_minima(100) == 0.01
    assert E.dn_ramal_ventilacao(9, True) == 50
    assert E.dn_ramal_ventilacao(10, False) == 40


def test_reservatorio():
    r = dimensionar_reservatorio([("escritorio", 120)], 2, 6000)
    assert r.consumo_diario_l == 6000
    assert r.volume_total_l == 18000
    assert r.volume_superior_l == pytest.approx(12000 * 0.4 + 6000)
    assert r.volume_inferior_l == pytest.approx(12000 * 0.6)
