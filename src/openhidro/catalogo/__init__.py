"""Catálogo de peças comerciais (tubos, conexões, registros e metais).

Fontes (regra de sala limpa: só material público dos fabricantes):
- Tigre — Linha Soldável (água fria) e Linha Esgoto Série Normal: catálogos técnicos públicos e
  páginas de produto (bitolas e combinações de redução disponíveis).
- Amanco Wavin — Linha Soldável (NBR 5648) e Esgoto Série Normal (NBR 5688): idem.
- Metais (registros com canopla, registro bruto, engates): itens genéricos de mercado.

Os **códigos de fabricante** ficam em branco até serem conferidos no catálogo vigente de cada
fabricante (ver docs/conferencia-normas.md). As bitolas, nomes e combinações de redução seguem os
catálogos públicos; se o seu fornecedor não tiver uma peça, a lista de materiais troca por
peça equivalente + bucha (ver app/src/modelo/quantitativo.ts).

Estrutura de um item::

    {"id": "tigre.joelho_90.25", "fabricante": "Tigre", "linha": "Soldável", "familia": "joelho_90",
     "grupo": "PVC soldável", "descricao": "Joelho 90° soldável 25 mm", "dn": 25, "dn2": null,
     "rosca": null, "unidade": "pç", "codigo": null}
"""
from __future__ import annotations

FABRICANTES = ["Tigre", "Amanco"]

# DN do tubo soldável -> rosca de transição usual (BSP)
ROSCA_DN = {20: '1/2"', 25: '3/4"', 32: '1"', 40: '1.1/4"', 50: '1.1/2"', 60: '2"', 75: '2.1/2"', 85: '3"', 110: '4"'}
DN_SOLDAVEL = list(ROSCA_DN)
DN_ESGOTO = [40, 50, 75, 100, 150]

# --- água fria, PVC soldável (NBR 5648) — bitolas conforme catálogos públicos Tigre/Amanco
_SOLDAVEL = [
    # família, grupo, descrição (formato com {dn}, {dn2}, {r}), lista de (dn, dn2, rosca), unidade
    ("tubo_soldavel", "Tubos", "Tubo PVC soldável {dn} mm (barra 6 m)", [(d, None, None) for d in DN_SOLDAVEL], "m"),
    ("joelho_90", "PVC soldável", "Joelho 90° soldável {dn} mm", [(d, None, None) for d in DN_SOLDAVEL], "pç"),
    ("joelho_45", "PVC soldável", "Joelho 45° soldável {dn} mm", [(d, None, None) for d in DN_SOLDAVEL], "pç"),
    ("curva_90", "PVC soldável", "Curva 90° soldável {dn} mm", [(d, None, None) for d in (20, 25, 32, 40, 50, 60)], "pç"),
    ("curva_45", "PVC soldável", "Curva 45° soldável {dn} mm", [(d, None, None) for d in (20, 25, 32, 40, 50, 60)], "pç"),
    ("te_90", "PVC soldável", "Tê 90° soldável {dn} mm", [(d, None, None) for d in DN_SOLDAVEL], "pç"),
    ("te_reducao_90", "PVC soldável", "Tê de redução 90° soldável {dn} x {dn2} mm",
     [(a, b, None) for a, b in ((25, 20), (32, 25), (40, 25), (40, 32), (50, 25), (50, 32), (50, 40), (60, 25),
                                 (60, 32), (60, 40), (60, 50), (75, 50), (75, 60), (85, 60), (85, 75), (110, 75), (110, 85))], "pç"),
    ("joelho_reducao_90", "PVC soldável", "Joelho de redução 90° soldável {dn} x {dn2} mm", [(25, 20, None), (32, 25, None)], "pç"),
    ("luva", "PVC soldável", "Luva soldável {dn} mm", [(d, None, None) for d in DN_SOLDAVEL], "pç"),
    ("bucha_reducao_curta", "PVC soldável", "Bucha de redução soldável curta {dn} x {dn2} mm",
     [(a, b, None) for a, b in ((25, 20), (32, 25), (40, 32), (50, 40), (60, 50), (75, 60), (85, 75), (110, 85))], "pç"),
    ("bucha_reducao_longa", "PVC soldável", "Bucha de redução soldável longa {dn} x {dn2} mm",
     [(a, b, None) for a, b in ((32, 20), (40, 25), (50, 25), (50, 32), (60, 40), (75, 50), (85, 60), (110, 75))], "pç"),
    ("cap", "PVC soldável", "Cap soldável {dn} mm", [(d, None, None) for d in DN_SOLDAVEL], "pç"),
    ("uniao", "PVC soldável", "União soldável {dn} mm", [(d, None, None) for d in DN_SOLDAVEL], "pç"),
    ("adaptador_curto", "PVC soldável", "Adaptador soldável curto com bolsa e rosca para registro {dn} mm x {r}",
     [(d, None, r) for d, r in ROSCA_DN.items()], "pç"),
    ("adaptador_caixa_flange_livre", "PVC soldável", "Adaptador soldável com flange livre para caixa d'água {dn} mm x {r}",
     [(d, None, r) for d, r in ROSCA_DN.items() if d <= 60], "pç"),
    ("adaptador_caixa_flanges_anel", "PVC soldável", "Adaptador soldável com flanges e anel para caixa d'água {dn} mm x {r}",
     [(d, None, r) for d, r in ROSCA_DN.items() if 25 <= d <= 110], "pç"),
    # transições com bucha de latão (peças azuis)
    ("joelho_90_bucha_latao", "PVC soldável azul c/ bucha de latão", "Joelho 90° soldável com bucha de latão {dn} mm x {r}",
     [(20, None, '1/2"'), (25, None, '3/4"'), (32, None, '1"')], "pç"),
    ("joelho_reducao_90_bucha_latao", "PVC soldável azul c/ bucha de latão", "Joelho de redução 90° soldável com bucha de latão {dn} mm x {r}",
     [(25, None, '1/2"'), (32, None, '3/4"')], "pç"),
    ("te_90_bucha_latao", "PVC soldável azul c/ bucha de latão", "Tê 90° soldável com bucha de latão na bolsa central {dn} mm x {r}",
     [(20, None, '1/2"'), (25, None, '3/4"')], "pç"),
    ("te_reducao_90_bucha_latao", "PVC soldável azul c/ bucha de latão", "Tê de redução 90° soldável com bucha de latão na bolsa central {dn} mm x {r}",
     [(25, None, '1/2"'), (32, None, '3/4"')], "pç"),
    ("luva_bucha_latao", "PVC soldável azul c/ bucha de latão", "Luva soldável com bucha de latão {dn} mm x {r}",
     [(20, None, '1/2"'), (25, None, '3/4"'), (25, None, '1/2"')], "pç"),
    ("registro_esfera_pvc", "PVC soldável", "Registro de esfera PVC soldável {dn} mm", [(d, None, None) for d in (20, 25, 32, 40, 50, 60)], "pç"),
]

# --- esgoto, PVC série normal (NBR 5688) — bitolas conforme catálogos públicos Tigre/Amanco
_ESGOTO = [
    ("tubo_esgoto", "Tubos", "Tubo PVC esgoto série normal {dn} mm (barra 6 m)", [(d, None, None) for d in DN_ESGOTO], "m"),
    ("joelho_90_esgoto", "PVC esgoto", "Joelho 90° esgoto {dn} mm", [(d, None, None) for d in DN_ESGOTO], "pç"),
    ("joelho_45_esgoto", "PVC esgoto", "Joelho 45° esgoto {dn} mm", [(d, None, None) for d in DN_ESGOTO], "pç"),
    ("curva_90_curta_esgoto", "PVC esgoto", "Curva 90° curta esgoto {dn} mm", [(d, None, None) for d in (40, 50, 75, 100)], "pç"),
    ("curva_90_longa_esgoto", "PVC esgoto", "Curva 90° longa esgoto {dn} mm", [(d, None, None) for d in (40, 50, 75, 100)], "pç"),
    ("te_esgoto", "PVC esgoto", "Tê esgoto {dn} x {dn2} mm",
     [(d, d, None) for d in (50, 75, 100, 150)] + [(75, 50, None), (100, 50, None), (100, 75, None)], "pç"),
    ("juncao_simples_esgoto", "PVC esgoto", "Junção simples esgoto {dn} x {dn2} mm",
     [(d, d, None) for d in DN_ESGOTO] + [(75, 50, None), (100, 50, None), (100, 75, None), (150, 100, None)], "pç"),
    ("reducao_excentrica_esgoto", "PVC esgoto", "Redução excêntrica esgoto {dn} x {dn2} mm",
     [(50, 40, None), (75, 50, None), (100, 50, None), (100, 75, None), (150, 100, None)], "pç"),
    ("luva_simples_esgoto", "PVC esgoto", "Luva simples esgoto {dn} mm", [(d, None, None) for d in DN_ESGOTO], "pç"),
    ("luva_correr_esgoto", "PVC esgoto", "Luva de correr esgoto {dn} mm", [(d, None, None) for d in (50, 75, 100, 150)], "pç"),
    ("cap_esgoto", "PVC esgoto", "Cap esgoto {dn} mm", [(d, None, None) for d in DN_ESGOTO], "pç"),
    ("anel_borracha_esgoto", "PVC esgoto", "Anel de borracha esgoto {dn} mm", [(d, None, None) for d in (50, 75, 100, 150)], "pç"),
    ("terminal_ventilacao", "PVC esgoto", "Terminal de ventilação {dn} mm", [(d, None, None) for d in (50, 75, 100)], "pç"),
    ("caixa_sifonada", "Caixas e ralos", "Caixa sifonada {dn} x {dn2} mm com grelha", [(100, 100, None), (150, 150, None), (150, 185, None)], "pç"),
    ("ralo_seco", "Caixas e ralos", "Ralo seco {dn} x {dn2} mm com grelha", [(100, 40, None)], "pç"),
]

# --- metais e acessórios (genéricos; fabricantes de metais variam: Deca, Docol, Fabrimar…)
_METAIS = [
    ("registro_gaveta_canopla", "Metais", "Registro de gaveta com canopla cromada {r}", [(None, None, r) for r in ('1/2"', '3/4"', '1"')], "pç"),
    ("registro_gaveta_bruto", "Metais", "Registro de gaveta bruto {r}",
     [(None, None, r) for r in ('3/4"', '1"', '1.1/4"', '1.1/2"', '2"', '2.1/2"', '3"', '4"')], "pç"),
    ("registro_pressao_canopla", "Metais", "Registro de pressão com canopla cromada {r}", [(None, None, r) for r in ('1/2"', '3/4"')], "pç"),
    ("engate_flexivel", "Acessórios", "Engate flexível {r} x 30 cm", [(None, None, '1/2"')], "pç"),
    ("torneira_boia", "Metais", "Torneira de boia {r}", [(None, None, r) for r in ('1/2"', '3/4"', '1"', '1.1/4"', '1.1/2"', '2"')], "pç"),
]


def _itens(fab: str, linha: str, tabela) -> list[dict]:
    out = []
    for familia, grupo, desc, variantes, un in tabela:
        for dn, dn2, r in variantes:
            sufixo = ".".join(str(v).replace('"', "pol").replace("/", "-") for v in (dn, dn2, r) if v is not None)
            out.append({
                "id": f"{fab.lower()}.{familia}.{sufixo}", "fabricante": fab, "linha": linha, "familia": familia,
                "grupo": grupo, "descricao": desc.format(dn=dn, dn2=dn2, r=r), "dn": dn, "dn2": dn2, "rosca": r,
                "unidade": un, "codigo": None,
            })
    return out


def catalogo() -> list[dict]:
    itens: list[dict] = []
    for fab in FABRICANTES:
        itens += _itens(fab, "Soldável", _SOLDAVEL)
        itens += _itens(fab, "Esgoto Série Normal", _ESGOTO)
    itens += _itens("Genérico", "Metais e acessórios", _METAIS)
    return itens


# Acessórios que acompanham cada ponto de utilização na lista de materiais (além da conexão de
# saída, que depende do DN calculado). Rosca da saída do ponto: padrão usual de mercado.
PONTOS = {
    "bacia_caixa_descarga": {"rosca": '1/2"', "acessorios": [{"familia": "engate_flexivel", "rosca": '1/2"', "qtd": 1}]},
    "bacia_valvula_descarga": {"rosca": '1.1/2"', "acessorios": []},
    "banheira": {"rosca": '3/4"', "acessorios": []},
    "bebedouro": {"rosca": '1/2"', "acessorios": []},
    "bide": {"rosca": '1/2"', "acessorios": [{"familia": "engate_flexivel", "rosca": '1/2"', "qtd": 1}]},
    "chuveiro": {"rosca": '1/2"', "acessorios": [{"familia": "registro_pressao_canopla", "rosca": '3/4"', "qtd": 1}]},
    "chuveiro_eletrico": {"rosca": '1/2"', "acessorios": [{"familia": "registro_pressao_canopla", "rosca": '3/4"', "qtd": 1}]},
    "lavadora": {"rosca": '3/4"', "acessorios": []},
    "lavatorio": {"rosca": '1/2"', "acessorios": [{"familia": "engate_flexivel", "rosca": '1/2"', "qtd": 1}]},
    "mictorio_valvula": {"rosca": '3/4"', "acessorios": []},
    "mictorio_caixa": {"rosca": '1/2"', "acessorios": [{"familia": "engate_flexivel", "rosca": '1/2"', "qtd": 1}]},
    "mictorio_calha": {"rosca": '1/2"', "acessorios": []},
    "pia": {"rosca": '1/2"', "acessorios": [{"familia": "engate_flexivel", "rosca": '1/2"', "qtd": 1}]},
    "pia_torneira_eletrica": {"rosca": '1/2"', "acessorios": [{"familia": "engate_flexivel", "rosca": '1/2"', "qtd": 1}]},
    "tanque": {"rosca": '3/4"', "acessorios": []},
    "torneira_jardim": {"rosca": '3/4"', "acessorios": []},
}
