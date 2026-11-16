from pathlib import Path

import pytest

from openhidro import No, Rede, Trecho, dimensionar_agua_fria, dimensionar_esgoto
from openhidro.normas import nbr5626 as N
from openhidro.normas.nbr5626 import KPA_POR_MCA

EX = Path(__file__).parent.parent / "exemplos"


def rede_simples(z_res=5.0):
    r = Rede("agua_fria")
    r.add_no(No("RES", 0, 0, z_res, "reservatorio"))
    r.add_no(No("A", 0, 0, 2.8))
    r.add_no(No("LAV", 2, 0, 0.6, "ponto", "lavatorio"))
    r.add_no(No("PIA", 0, 3, 1.1, "ponto", "pia"))
    r.add_trecho(Trecho("T1", "RES", "A"))
    r.add_trecho(Trecho("T2", "A", "LAV"))
    r.add_trecho(Trecho("T3", "A", "PIA"))
    return r


def test_soma_pesos_e_vazao():
    res = dimensionar_agua_fria(rede_simples())
    t = {x.id: x for x in res.trechos}
    assert t["T1"].soma_pesos == pytest.approx(1.0)
    assert t["T1"].vazao_ls == pytest.approx(0.3)          # 0,3·√1
    assert t["T2"].vazao_ls == pytest.approx(0.15)         # limitado à vazão do aparelho
    assert all(x.velocidade_ms <= 3.0 for x in res.trechos)


def test_pressao_a_mao():
    """Confere a pressão no lavatório calculada à mão."""
    res = dimensionar_agua_fria(rede_simples())
    t = {x.id: x for x in res.trechos}
    n = {x.id: x for x in res.nos}
    h_lav = (5.0 - 0.6) - t["T1"].perda_carga_m - t["T2"].perda_carga_m
    assert n["LAV"].pressao_dinamica_kpa == pytest.approx(h_lav * KPA_POR_MCA)
    assert n["LAV"].pressao_estatica_kpa == pytest.approx(4.4 * KPA_POR_MCA)
    # comprimento T2 = 2 m horizontais + 2,2 m de descida
    assert t["T2"].comprimento_m == pytest.approx(4.2)


def test_aumenta_dn_quando_falta_pressao():
    r = Rede("agua_fria")
    r.add_no(No("RES", 0, 0, 3.2, "reservatorio"))
    r.add_no(No("A", 30, 0, 3.2))
    r.add_no(No("CH", 30, 0, 1.9, "ponto", "chuveiro"))
    r.add_no(No("LAV", 31, 0, 0.6, "ponto", "lavatorio"))
    r.add_no(No("PIA", 32, 0, 1.1, "ponto", "pia"))
    for i, (a, b) in enumerate([("RES", "A"), ("A", "CH"), ("A", "LAV"), ("A", "PIA")]):
        r.add_trecho(Trecho(f"T{i}", a, b))
    res = dimensionar_agua_fria(r)
    t0 = res.trechos[0]
    assert t0.dn > 20             # o barrilete longo precisou ser aumentado
    assert res.iteracoes > 0
    ch = next(n for n in res.nos if n.id == "CH")
    assert ch.pressao_dinamica_kpa >= 10 - 1e-6


def test_alerta_quando_desnivel_insuficiente():
    r = Rede("agua_fria")
    r.add_no(No("RES", 0, 0, 2.5, "reservatorio"))
    r.add_no(No("CH", 1, 0, 2.2, "ponto", "chuveiro"))
    r.add_trecho(Trecho("T1", "RES", "CH"))
    res = dimensionar_agua_fria(r)
    assert not res.ok
    assert any("CH" in a for a in res.alertas)


def test_dn_nunca_reduz_rumo_ao_reservatorio():
    r = Rede("agua_fria")
    r.add_no(No("RES", 0, 0, 6, "reservatorio"))
    r.add_no(No("A", 0, 0, 2.8))
    r.add_no(No("VD", 1, 0, 1.1, "ponto", "bacia_valvula_descarga"))
    r.add_trecho(Trecho("T1", "RES", "A"))
    r.add_trecho(Trecho("T2", "A", "VD"))
    res = dimensionar_agua_fria(r)
    dns = {t.id: t.dn for t in res.trechos}
    assert dns["T2"] >= N.DN_MIN_SUB_RAMAL["bacia_valvula_descarga"]
    assert dns["T1"] >= dns["T2"]


def test_rede_invalida():
    r = Rede("agua_fria")
    r.add_no(No("RES", 0, 0, 5, "reservatorio"))
    r.add_no(No("X", 1, 0, 1))
    with pytest.raises(ValueError):
        dimensionar_agua_fria(r)


def test_exemplo_agua_fria():
    res = dimensionar_agua_fria(Rede.carregar(EX / "residencia_agua_fria.json"))
    assert res.ok
    assert res.trechos[0].soma_pesos == pytest.approx(3.1)


def test_exemplo_esgoto():
    res = dimensionar_esgoto(Rede.carregar(EX / "sobrado_esgoto.json"))
    t = {x.id: x for x in res.trechos}
    assert res.ok
    assert t["E4"].dn == 100 and t["E4"].tipo == "ramal_descarga"      # bacia
    assert t["E3"].dn == 40 and t["E3"].uhc == 3                        # lav + chuveiro
    assert t["E6"].tipo == "tubo_queda" and t["E6"].dn == 100
    assert t["E19"].uhc == pytest.approx(27)
    assert t["E19"].dn == 100
    assert t["E14"].dn == 50                                            # pia


def test_esgoto_declividade_insuficiente():
    r = Rede("esgoto")
    r.add_no(No("BS", 0, 0, 0, "ponto", "bacia"))
    r.add_no(No("CI", 3, 0, -0.01, "caixa_inspecao"))
    r.add_trecho(Trecho("E1", "BS", "CI", tipo="ramal_esgoto"))
    res = dimensionar_esgoto(r)
    assert res.trechos[0].dn == 100
    assert not res.ok


def test_esgoto_dn_imposto_menor():
    r = Rede("esgoto")
    r.add_no(No("BS", 0, 0, 0, "ponto", "bacia"))
    r.add_no(No("CI", 3, 0, -0.1, "caixa_inspecao"))
    r.add_trecho(Trecho("E1", "BS", "CI", dn=75))
    res = dimensionar_esgoto(r)
    assert not res.ok


def test_dxf(tmp_path):
    import json

    from openhidro.io.dxf import anotar_dxf, ler_rede_dxf
    from exemplos_gerar import gerar  # noqa

    dxf = gerar(tmp_path / "b.dxf")
    cfg = json.loads((EX / "banheiro_af_config.json").read_text(encoding="utf-8"))
    rede = ler_rede_dxf(dxf, cfg)
    aps = sorted(n.aparelho for n in rede.nos.values() if n.aparelho)
    assert aps == ["bacia_caixa_descarga", "chuveiro_eletrico", "lavatorio", "pia"]
    assert len(rede.trechos) == len(rede.nos) - 1
    res = dimensionar_agua_fria(rede)
    assert res.ok
    out = anotar_dxf(dxf, tmp_path / "out.dxf", rede, res, 0.01)
    assert out.exists()
