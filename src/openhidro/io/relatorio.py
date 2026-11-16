"""Relatórios: memorial de cálculo em Markdown, tabelas CSV e JSON."""
from __future__ import annotations

import csv
import io
import json
from dataclasses import asdict

from ..calculo.agua_fria import ResultadoAguaFria
from ..calculo.esgoto import ResultadoEsgoto
from ..normas import nbr5626 as N
from ..normas import nbr8160 as E


def _f(v, nd=2):
    if v is None:
        return "—"
    return f"{v:,.{nd}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def resultado_json(res) -> str:
    return json.dumps(asdict(res) | {"ok": res.ok}, ensure_ascii=False, indent=2)


def csv_trechos(res) -> str:
    buf = io.StringIO()
    linhas = [asdict(t) for t in res.trechos]
    if linhas:
        w = csv.DictWriter(buf, fieldnames=list(linhas[0]), delimiter=";")
        w.writeheader()
        w.writerows(linhas)
    return buf.getvalue()


def memorial_agua_fria(res: ResultadoAguaFria) -> str:
    p = res.parametros
    s = [f"# Memorial de cálculo — Água fria{(' — ' + res.rede) if res.rede else ''}", ""]
    s += ["## Critérios", "",
          "- Norma: ABNT NBR 5626 — método da soma dos pesos, Q = 0,3·√ΣP (L/s)",
          f"- Material: {p['material'].upper()} — perda de carga por "
          f"{'Fair-Whipple-Hsiao' if p['formula_perda'] == 'fwh' else 'Darcy-Weisbach (Swamee-Jain)'}",
          f"- Velocidade máxima: {_f(p['velocidade_max_ms'])} m/s",
          f"- Pressão dinâmica mínima: {_f(p['pressao_min_ponto_kpa'], 0)} kPa nos pontos de utilização "
          f"(caixa de descarga: 5 kPa); {_f(p['pressao_min_rede_kpa'], 0)} kPa em qualquer ponto da rede",
          f"- Pressão estática máxima: {_f(p['pressao_max_estatica_kpa'], 0)} kPa",
          f"- Lâmina d'água considerada no reservatório: {_f(p['nivel_agua_m'])} m", ""]
    s += ["## Dimensionamento dos trechos", "",
          "| Trecho | De → Para | ΣP | Q (L/s) | DN | Ref. | v (m/s) | J (m/m) | L (m) | Leq (m) | hf (m) |",
          "|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|"]
    for t in res.trechos:
        s.append(f"| {t.id}{'*' if t.imposto else ''} | {t.de} → {t.para} | {_f(t.soma_pesos, 1)} | "
                 f"{_f(t.vazao_ls)} | {t.dn} | {t.referencia} | {_f(t.velocidade_ms)} | "
                 f"{_f(t.perda_unitaria, 4)} | {_f(t.comprimento_m)} | {_f(t.comprimento_equiv_m)} | "
                 f"{_f(t.perda_carga_m, 3)} |")
    s += ["", "\\* DN imposto pelo projetista.", "", "## Pressões nos nós", "",
          "| Nó | Aparelho | z (m) | P. dinâmica (kPa) | P. estática (kPa) | Mínimo (kPa) | Situação |",
          "|---|---|---:|---:|---:|---:|---|"]
    for n in res.nos:
        ap = N.APARELHOS_AF[n.aparelho].descricao if n.aparelho in N.APARELHOS_AF else (n.aparelho or "—")
        s.append(f"| {n.id} | {ap} | {_f(n.z)} | {_f(n.pressao_dinamica_kpa, 1)} | {_f(n.pressao_estatica_kpa, 1)} "
                 f"| {_f(n.pressao_min_kpa, 0)} | {'OK' if n.ok else 'NÃO ATENDE'} |")
    s += ["", "## Alertas", ""] + ([f"- {a}" for a in res.alertas] or ["- Nenhum."])
    s += ["", "> Resultado gerado pelo OpenHidro. Cálculo preliminar: a responsabilidade técnica é do "
          "projetista, que deve conferir os critérios e tabelas com a norma vigente."]
    return "\n".join(s) + "\n"


def memorial_esgoto(res: ResultadoEsgoto) -> str:
    s = [f"# Memorial de cálculo — Esgoto sanitário{(' — ' + res.rede) if res.rede else ''}", ""]
    s += ["## Critérios", "",
          "- Norma: ABNT NBR 8160 — método das Unidades de Hunter de Contribuição (UHC)",
          "- Ramais de descarga: Tabela 3; ramais de esgoto: Tabela 5; tubos de queda: Tabela 6; "
          "subcoletores e coletor predial: Tabela 7; ramais de ventilação: Tabela 8",
          "- Declividade mínima: 2 % para DN ≤ 75; 1 % para DN ≥ 100", ""]
    s += ["## Dimensionamento dos trechos", "",
          "| Trecho | De → Para | Tipo | UHC | DN | L (m) | Decl. | Decl. mín. | Recebe bacia |",
          "|---|---|---|---:|---:|---:|---:|---:|---|"]
    for t in res.trechos:
        dec = f"{t.declividade:.1%}".replace(".", ",") if t.declividade is not None else "—"
        dmin = f"{t.declividade_min:.0%}" if t.declividade_min is not None else "—"
        s.append(f"| {t.id}{'*' if t.imposto else ''} | {t.de} → {t.para} | {t.tipo.replace('_', ' ')} | "
                 f"{_f(t.uhc, 1)} | {t.dn} | {_f(t.comprimento_m)} | {dec} | {dmin} | "
                 f"{'sim' if t.recebe_bacia else 'não'} |")
    if res.ventilacao:
        s += ["", "## Ramais de ventilação sugeridos (Tabela 8)", "",
              "| Ramal de esgoto | UHC | Com bacia | DN ventilação |", "|---|---:|---|---:|"]
        for v in res.ventilacao:
            s.append(f"| {v['trecho']} | {_f(v['uhc'], 1)} | {'sim' if v['com_bacia'] else 'não'} | "
                     f"{v['dn_ventilacao']} |")
    s += ["", "## Alertas", ""] + ([f"- {a}" for a in res.alertas] or ["- Nenhum."])
    s += ["", "> Resultado gerado pelo OpenHidro. Cálculo preliminar: a responsabilidade técnica é do "
          "projetista, que deve conferir os critérios e tabelas com a norma vigente."]
    return "\n".join(s) + "\n"


def tabela_aparelhos() -> str:
    s = ["## Água fria (NBR 5626)", "", "| chave | aparelho | peso | vazão (L/s) |", "|---|---|---:|---:|"]
    for a in N.APARELHOS_AF.values():
        s.append(f"| `{a.chave}` | {a.descricao} | {_f(a.peso, 1)} | {_f(a.vazao_ls)} |")
    s += ["", "## Esgoto (NBR 8160)", "", "| chave | aparelho | UHC | DN mín. ramal |", "|---|---|---:|---:|"]
    for a in E.APARELHOS_ES.values():
        s.append(f"| `{a.chave}` | {a.descricao} | {_f(a.uhc, 1)} | {a.dn_min_ramal_descarga} |")
    return "\n".join(s) + "\n"
