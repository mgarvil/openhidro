// Lista de materiais a partir da rede calculada: tubos por DN, conexões em cada nó (joelhos, tês,
// tês de redução, buchas, peças azuis com bucha de latão nos pontos), registros e acessórios.
// As peças vêm do catálogo do fabricante escolhido (src/dados/catalogo.json, gerado do motor).
import catalogo from "../dados/catalogo.json";
import { SIGLAS, aparelho as apCat, type Elemento } from "./elementos";
import type { RedeMontada } from "./rede";

export interface ItemCatalogo {
  id: string; fabricante: string; linha: string; familia: string; grupo: string; descricao: string;
  dn: number | null; dn2: number | null; rosca: string | null; unidade: string; codigo: string | null;
}
export const ITENS = catalogo.itens as ItemCatalogo[];
export const PONTOS_CAT = catalogo.pontos as Record<string, { rosca: string; acessorios: { familia: string; rosca: string; qtd: number }[] }>;
const PONTOS = catalogo.pontos as Record<string, { rosca: string; acessorios: { familia: string; rosca: string; qtd: number }[] }>;
const ROSCA_DN = catalogo.rosca_dn as Record<string, string>;
export const FABRICANTES = [...new Set(ITENS.map((i) => i.fabricante).filter((f) => f !== "Genérico"))];

export interface LinhaMaterial {
  pavimentoId: string; grupo: string; descricao: string; unidade: string; qtd: number;
  codigo: string | null; familia: string; dn: number | null; dn2: number | null; rosca: string | null;
  foraCatalogo?: boolean;
}

const NOMES_FAMILIA: Record<string, string> = {
  joelho_90: "Joelho 90° soldável", joelho_45: "Joelho 45° soldável", te_90: "Tê 90° soldável",
  bucha_reducao_curta: "Bucha de redução soldável", adaptador_curto: "Adaptador soldável curto c/ bolsa e rosca",
};

/** Ordem de polegadas para comparar roscas. */
const POL: Record<string, number> = { '1/2"': 0.5, '3/4"': 0.75, '1"': 1, '1.1/4"': 1.25, '1.1/2"': 1.5, '2"': 2, '2.1/2"': 2.5, '3"': 3, '4"': 4 };

export function listaDeMateriais(redes: { montada: RedeMontada; dn: Map<string, number> }[], elementos: Elemento[],
                                 fabricante: string): LinhaMaterial[] {
  const porEl = new Map(elementos.map((e) => [e.id, e]));
  const acc = new Map<string, LinhaMaterial>();
  const achar = (familia: string, dn: number | null, dn2: number | null = null, rosca: string | null = null) =>
    ITENS.find((i) => (i.fabricante === fabricante || i.fabricante === "Genérico") && i.familia === familia &&
      (dn == null || i.dn === dn) && (dn2 == null || i.dn2 === dn2) && (rosca == null || i.rosca === rosca));
  const somar = (pav: string, familia: string, qtd: number, dn: number | null, dn2: number | null = null, rosca: string | null = null) => {
    const it = achar(familia, dn, dn2, rosca);
    const descricao = it?.descricao ?? `${NOMES_FAMILIA[familia] ?? familia.replace(/_/g, " ")} ${[dn, dn2].filter(Boolean).join(" x ")}${dn ? " mm" : ""}${rosca ? " x " + rosca : ""}`;
    const k = `${pav}|${descricao}`;
    const l = acc.get(k);
    if (l) { l.qtd += qtd; return; }
    acc.set(k, { pavimentoId: pav, grupo: it?.grupo ?? "Outros", descricao, unidade: it?.unidade ?? "pç", qtd, codigo: it?.codigo ?? null,
                 familia, dn, dn2, rosca, foraCatalogo: !it });
  };
  const bucha = (pav: string, maior: number, menor: number) => {
    if (maior === menor) return;
    if (achar("bucha_reducao_curta", maior, menor)) somar(pav, "bucha_reducao_curta", 1, maior, menor);
    else if (achar("bucha_reducao_longa", maior, menor)) somar(pav, "bucha_reducao_longa", 1, maior, menor);
    else somar(pav, "bucha_reducao_curta", 1, maior, menor);
  };
  const rosca = (dn: number) => ROSCA_DN[String(dn)] ?? '3/4"';
  const registroInline = (pav: string, familia: string, dn: number) => {
    const r = rosca(dn);
    const fam = familia === "registro_gaveta_canopla" && POL[r] > 1 ? "registro_gaveta_bruto" : familia;
    somar(pav, fam, 1, null, null, r);
    somar(pav, "adaptador_curto", 2, dn, null, r);
  };

  for (const { montada, dn } of redes) {
    const g = montada.grafo;
    const inc = new Map<number, { o: number; dn: number; vertical: boolean }[]>();
    for (const a of g.arestas) {
      const d = dn.get(a.trecho) ?? 20;
      (inc.get(a.a) ?? inc.set(a.a, []).get(a.a)!).push({ o: a.b, dn: d, vertical: a.vertical });
      (inc.get(a.b) ?? inc.set(a.b, []).get(a.b)!).push({ o: a.a, dn: d, vertical: a.vertical });
      // tubos
      const na = g.nos[a.a], nb = g.nos[a.b];
      const L = a.vertical ? Math.abs(na.z - nb.z) : Math.hypot(na.x - nb.x, na.y - nb.y);
      somar(na.z <= nb.z ? na.pav : nb.pav, "tubo_soldavel", L, d);
    }
    for (const n of g.nos) {
      const es = inc.get(n.i) ?? [];
      if (!es.length) continue;
      const dir = (o: number) => {
        const p = g.nos[o];
        const v = [p.x - n.x, p.y - n.y, p.z - n.z], m = Math.hypot(v[0], v[1], v[2]) || 1;
        return v.map((c) => c / m);
      };
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const dns = es.map((e) => e.dn);
      const max = Math.max(...dns);

      if (n.res) {
        const d = es[0].dn;
        somar(n.pav, d <= 60 ? "adaptador_caixa_flange_livre" : "adaptador_caixa_flanges_anel", 1, d, null, rosca(d));
        registroInline(n.pav, "registro_gaveta_bruto", d);
        continue;
      }
      if (n.ap) {
        const el = porEl.get(n.ap);
        const chave = el?.tipo === "aparelho" ? el.chave : "";
        const qtdAp = el?.tipo === "aparelho" ? el.quantidade || 1 : 1;
        const info = PONTOS[chave];
        const r = info?.rosca ?? '1/2"';
        const d = es.length === 1 ? es[0].dn : Math.min(...dns);
        if (es.length === 1) {
          if (r === rosca(d) && achar("joelho_90_bucha_latao", d, null, r)) somar(n.pav, "joelho_90_bucha_latao", 1, d, null, r);
          else if (POL[r] < POL[rosca(d)] && achar("joelho_reducao_90_bucha_latao", d, null, r)) somar(n.pav, "joelho_reducao_90_bucha_latao", 1, d, null, r);
          else somar(n.pav, "adaptador_curto", 1, d, null, rosca(d));
        } else {
          const fam = r === rosca(max) ? "te_90_bucha_latao" : "te_reducao_90_bucha_latao";
          somar(n.pav, achar(fam, max, null, r) ? fam : "te_90", 1, max, null, achar(fam, max, null, r) ? r : null);
        }
        for (const a of info?.acessorios ?? []) {
          if (a.familia.startsWith("registro_")) registroInline(n.pav, a.familia, d);
          else somar(n.pav, a.familia, a.qtd * qtdAp, null, null, a.rosca);
        }
        continue;
      }
      if (n.reg) {
        const el = porEl.get(n.reg);
        const modelo = el?.tipo === "registro" ? el.modelo : "gaveta";
        if (modelo === "esfera") somar(n.pav, "registro_esfera_pvc", 1, max);
        else registroInline(n.pav, modelo === "pressao" ? "registro_pressao_canopla" : "registro_gaveta_canopla", max);
        if (es.length === 2 && dot(dir(es[0].o), dir(es[1].o)) > -0.98) somar(n.pav, "joelho_90", 1, max);
        continue;
      }
      if (es.length === 2) {
        const c = dot(dir(es[0].o), dir(es[1].o));
        const min = Math.min(...dns);
        if (c > -0.98) {
          const dev = Math.acos(Math.max(-1, Math.min(1, -c))) * 180 / Math.PI;   // desvio em relação à reta
          if (dev < 60) { somar(n.pav, "joelho_45", 1, max); bucha(n.pav, max, min); }
          else if (max !== min && achar("joelho_reducao_90", max, min)) somar(n.pav, "joelho_reducao_90", 1, max, min);
          else { somar(n.pav, "joelho_90", 1, max); bucha(n.pav, max, min); }
        } else bucha(n.pav, max, min);
        continue;
      }
      if (es.length >= 3) {
        // corrida = par de ramos alinhados; derivação = o outro
        let corrida: [number, number] | null = null;
        for (let i = 0; i < es.length && !corrida; i++)
          for (let j = i + 1; j < es.length; j++) if (dot(dir(es[i].o), dir(es[j].o)) < -0.98) { corrida = [i, j]; break; }
        const tes = es.length - 2;
        if (corrida && es.length === 3) {
          const rmax = Math.max(es[corrida[0]].dn, es[corrida[1]].dn), rmin = Math.min(es[corrida[0]].dn, es[corrida[1]].dn);
          const der = es.find((_, k) => k !== corrida![0] && k !== corrida![1])!.dn;
          if (der < rmax && achar("te_reducao_90", rmax, der)) somar(n.pav, "te_reducao_90", 1, rmax, der);
          else { somar(n.pav, "te_90", 1, Math.max(rmax, der)); bucha(n.pav, Math.max(rmax, der), der); }
          bucha(n.pav, rmax, rmin);
        } else {
          somar(n.pav, "te_90", tes, max);
          for (const d of dns) if (d < max) bucha(n.pav, max, d);
        }
      }
    }
    // pontos de utilização (contagem por aparelho)
    for (const n of g.nos) {
      const el = n.ap ? porEl.get(n.ap) : null;
      if (el?.tipo !== "aparelho") continue;
      const desc = apCat(el.chave)?.descricao ?? el.chave;
      const k = `${n.pav}|ap|${desc}`;
      const l = acc.get(k);
      if (l) l.qtd += el.quantidade || 1;
      else acc.set(k, { pavimentoId: n.pav, grupo: "Pontos de utilização", descricao: `${SIGLAS[el.chave] ?? ""} — ${desc}`, unidade: "pç",
                        qtd: el.quantidade || 1, codigo: null, familia: "aparelho", dn: null, dn2: null, rosca: PONTOS[el.chave]?.rosca ?? null });
    }
  }
  const ordemGrupo = ["Pontos de utilização", "Tubos", "PVC soldável", "PVC soldável azul c/ bucha de latão", "Metais", "Acessórios", "Outros"];
  return [...acc.values()]
    .map((l) => (l.unidade === "m" ? { ...l, qtd: Math.round(l.qtd * 100) / 100 } : l))
    .sort((a, b) => ordemGrupo.indexOf(a.grupo) - ordemGrupo.indexOf(b.grupo) || (a.dn ?? 0) - (b.dn ?? 0) || a.descricao.localeCompare(b.descricao));
}

/** Barras de 6 m para um comprimento (com perda de corte). */
export const barras = (m: number, perda = 0.1) => Math.ceil((m * (1 + perda)) / 6);

export function csvMateriais(linhas: LinhaMaterial[], nomePav: (id: string) => string): string {
  const cab = "Pavimento;Grupo;Descrição;Código;Unidade;Quantidade;Barras 6 m";
  const f = (v: number) => String(v).replace(".", ",");
  return [cab, ...linhas.map((l) => [nomePav(l.pavimentoId), l.grupo, l.descricao, l.codigo ?? "", l.unidade, f(l.qtd),
    l.unidade === "m" ? barras(l.qtd) : ""].join(";"))].join("\r\n") + "\r\n";
}
