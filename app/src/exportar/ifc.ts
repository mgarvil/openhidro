// Exportação IFC4 (ISO 10303-21, texto STEP) da água fria: projeto → terreno → edificação →
// pavimentos (IfcBuildingStorey), tubos (IfcPipeSegment), conexões (IfcPipeFitting), registros
// (IfcValve), pontos de utilização (IfcSanitaryTerminal), reservatório (IfcTank) e o sistema
// (IfcDistributionSystem DOMESTICCOLDWATER), com propriedades de cálculo em "OpenHidro_AguaFria".
// Escrito à mão (sem dependências), a partir do esquema IFC4 publicado pela buildingSMART.
import { aparelho, MODELOS_CAIXA, MODELOS_REGISTRO, SIGLAS, type Elemento } from "../modelo/elementos";
import type { RedeMontada } from "../modelo/rede";
import type { Pavimento } from "../projeto";

export interface EntradaIfc {
  nome: string;
  elementos: Elemento[];
  pavimentos: Pavimento[];
  escala: number;
  redes: { montada: RedeMontada; dn: Map<string, number> | null; trechos?: Map<string, { q: number; v: number }> }[];
  esgoto?: { montada: Pick<RedeMontada, "grafo">; dn: Map<string, number> | null; dec?: Map<string, number | null> }[];
  versao: string;
}

type V3 = [number, number, number];
const TIPO_SANITARIO: Record<string, string> = {
  bacia_caixa_descarga: "TOILETPAN", bacia_valvula_descarga: "TOILETPAN", banheira: "BATH", bide: "BIDET",
  chuveiro: "SHOWER", chuveiro_eletrico: "SHOWER", lavatorio: "WASHHANDBASIN", mictorio_valvula: "URINAL",
  mictorio_caixa: "URINAL", mictorio_calha: "URINAL", pia: "SINK", pia_torneira_eletrica: "SINK", tanque: "SINK",
};

export function gerarIfc(e: EntradaIfc): string {
  const linhas: string[] = [];
  let n = 0;
  const add = (s: string) => { linhas.push(`#${++n}=${s};`); return `#${n}`; };
  const cache = new Map<string, string>();
  const unico = (s: string) => { let r = cache.get(s); if (!r) { r = add(s); cache.set(s, r); } return r; };
  const P = (p: V3) => unico(`IFCCARTESIANPOINT((${p.map(num).join(",")}))`);
  const D = (d: V3) => unico(`IFCDIRECTION((${d.map(num).join(",")}))`);
  const A3 = (o: V3, z?: V3, x?: V3) => add(`IFCAXIS2PLACEMENT3D(${P(o)},${z ? D(z) : "$"},${x ? D(x) : "$"})`);
  const LP = (rel: string | null, o: V3, z?: V3, x?: V3) => add(`IFCLOCALPLACEMENT(${rel ?? "$"},${A3(o, z, x)})`);

  // contexto, unidades, projeto
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${A3([0, 0, 0])},$)`);
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const unidades = add(`IFCUNITASSIGNMENT((${add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")},${add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)")},${add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)")}))`);
  const projeto = add(`IFCPROJECT('${guid()}',$,${str(e.nome)},${str("Gerado pelo OpenHidro " + e.versao)},$,$,$,(${ctx}),${unidades})`);
  const plSite = LP(null, [0, 0, 0]);
  const site = add(`IFCSITE('${guid()}',$,'Terreno',$,$,${plSite},$,$,.ELEMENT.,$,$,$,$,$)`);
  const plEd = LP(plSite, [0, 0, 0]);
  const edificacao = add(`IFCBUILDING('${guid()}',$,${str(e.nome)},$,$,${plEd},$,$,.ELEMENT.,$,$,$)`);
  add(`IFCRELAGGREGATES('${guid()}',$,$,$,${projeto},(${site}))`);
  add(`IFCRELAGGREGATES('${guid()}',$,$,$,${site},(${edificacao}))`);
  const pavs = e.pavimentos.slice().sort((a, b) => a.cota - b.cota);
  const andar = new Map<string, { ref: string; pl: string; cota: number; itens: string[] }>();
  for (const p of pavs) {
    const pl = LP(plEd, [0, 0, p.cota]);
    const ref = add(`IFCBUILDINGSTOREY('${guid()}',$,${str(p.nome)},$,$,${pl},$,$,.ELEMENT.,${num(p.cota)})`);
    andar.set(p.id, { ref, pl, cota: p.cota, itens: [] });
  }
  add(`IFCRELAGGREGATES('${guid()}',$,$,$,${edificacao},(${pavs.map((p) => andar.get(p.id)!.ref).join(",")}))`);
  const sistema: string[] = [];
  const andarDe = (pav: string) => andar.get(pav) ?? andar.get(pavs[0].id)!;
  const perfil = (r: number) => unico(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${num(r)})`);
  const forma = (itens: string[]) => add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${itens.join(",")}))`)}))`);
  /** cilindro de raio r de a até b, em coordenadas locais do elemento (origem no próprio elemento) */
  const cil = (a: V3, b: V3, r: number) => {
    const d = sub(b, a), L = len(d);
    return add(`IFCEXTRUDEDAREASOLID(${perfil(r)},${A3(a, norm(d), perp(norm(d)))},${D([0, 0, 1])},${num(Math.max(L, 1e-4))})`);
  };
  const props = (alvo: string, nome: string, valores: [string, string][]) => {
    const ps = valores.map(([k, v]) => add(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${v},$)`));
    const set = add(`IFCPROPERTYSET('${guid()}',$,${str(nome)},$,(${ps.join(",")}))`);
    add(`IFCRELDEFINESBYPROPERTIES('${guid()}',$,$,$,(${alvo}),${set})`);
  };
  const objeto = (entidade: string, nome: string, pav: string, origem: V3, itens: string[] | null, tipo: string, tag = "$") => {
    const a = andarDe(pav);
    const pl = LP(a.pl, [origem[0], origem[1], origem[2] - a.cota]);
    const ref = add(`${entidade}('${guid()}',$,${str(nome)},$,$,${pl},${itens?.length ? forma(itens) : "$"},${tag},.${tipo}.)`);
    a.itens.push(ref);
    sistema.push(ref);
    return ref;
  };

  const porEl = new Map(e.elementos.map((x) => [x.id, x]));
  const usados = new Set<string>();
  for (const { montada, dn, trechos } of e.redes) {
    const G = montada.grafo;
    const dnA = (a: { trecho: string; el?: string }) => {
      const t = a.el ? porEl.get(a.el) : null;
      return dn?.get(a.trecho) ?? (t?.tipo === "tubo" && t.dn ? t.dn : 25);
    };
    const inc = new Map<number, { o: number; dn: number }[]>();
    for (const a of G.arestas) {
      if (a.el) usados.add(a.el);
      const p = G.nos[a.a], q = G.nos[a.b], d = dnA(a);
      const A: V3 = [p.x, p.y, p.z], B: V3 = [q.x, q.y, q.z];
      const ref = objeto("IFCPIPESEGMENT", `Tubo PVC soldável ${d} mm`, p.z <= q.z ? p.pav : q.pav, A, [cil([0, 0, 0], sub(B, A), d / 2000)], "RIGIDSEGMENT", str(a.trecho));
      const r = trechos?.get(a.trecho);
      props(ref, "OpenHidro_AguaFria", [["Trecho", `IFCLABEL(${str(a.trecho)})`], ["DN", `IFCPOSITIVELENGTHMEASURE(${num(d / 1000)})`],
        ["Comprimento", `IFCPOSITIVELENGTHMEASURE(${num(Math.max(len(sub(B, A)), 1e-4))})`], ["Material", "IFCLABEL('PVC rígido soldável (NBR 5648)')"],
        ...(r ? [["Vazao_Ls", `IFCREAL(${num(r.q)})`], ["Velocidade_ms", `IFCREAL(${num(r.v)})`]] as [string, string][] : [])]);
      (inc.get(a.a) ?? inc.set(a.a, []).get(a.a)!).push({ o: a.b, dn: d });
      (inc.get(a.b) ?? inc.set(a.b, []).get(a.b)!).push({ o: a.a, dn: d });
    }
    for (const no of G.nos) {
      const es = inc.get(no.i) ?? [];
      const c: V3 = [no.x, no.y, no.z];
      const dirs = es.map((x) => norm(sub([G.nos[x.o].x, G.nos[x.o].y, G.nos[x.o].z], c)));
      const reta = es.length === 2 && dot(dirs[0], dirs[1]) < -0.98;
      const max = es.length ? Math.max(...es.map((x) => x.dn)) : 25;
      if (no.res) {
        const el = porEl.get(no.res);
        const ref = objeto("IFCTANK", el?.rotulo || "Reservatório", no.pav, c, [cil([0, 0, 0], [0, 0, 0.78], 0.62)], "STORAGE");
        props(ref, "OpenHidro_AguaFria", [["Capacidade_L", "IFCREAL(1000.)"], ["Observacao", "IFCLABEL('Geometria genérica de caixa d''água cilíndrica')"]]);
        continue;
      }
      if (no.reg && es.length) {
        const el = porEl.get(no.reg);
        const modelo = el?.tipo === "registro" ? el.modelo : "gaveta";
        const r = max / 2000, d0 = dirs[0];
        const up: V3 = Math.abs(d0[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
        const ref = objeto("IFCVALVE", `${MODELOS_REGISTRO[modelo].nome} ${max} mm`, no.pav, c,
          [cil(scale(d0, -r * 2.2), scale(d0, r * 2.2), r * 1.45), cil([0, 0, 0], scale(up, r * 4.2), r * 0.45)],
          modelo === "pressao" ? "REGULATING" : "ISOLATING");
        props(ref, "OpenHidro_AguaFria", [["DN", `IFCPOSITIVELENGTHMEASURE(${num(max / 1000)})`], ["Sigla", `IFCLABEL(${str(MODELOS_REGISTRO[modelo].sigla)})`]]);
        if (reta) continue;
      }
      if (no.ap) {
        const el = porEl.get(no.ap);
        if (el?.tipo === "aparelho") {
          const ref = objeto("IFCSANITARYTERMINAL", `${SIGLAS[el.chave] ?? ""} — ${aparelho(el.chave)?.descricao ?? el.chave}`, no.pav, c, null,
            TIPO_SANITARIO[el.chave] ?? "USERDEFINED", str(no.nome ?? ""));
          props(ref, "OpenHidro_AguaFria", [["Aparelho", `IFCLABEL(${str(el.chave)})`], ["Quantidade", `IFCREAL(${num(el.quantidade || 1)})`],
            ["AlturaPonto", `IFCLENGTHMEASURE(${num(el.altura)})`]]);
        }
      }
      if (!es.length || (reta && es[0].dn === es[1].dn)) continue;
      const tipo = es.length >= 3 ? "JUNCTION" : reta ? "TRANSITION" : es.length === 2 ? "BEND" : "CONNECTOR";
      const nome = no.ap ? `Joelho com bucha de latão ${es[0].dn} mm` : `${es.length >= 3 ? "Tê" : reta ? "Bucha de redução" : "Joelho"} ${max} mm`;
      const itens = dirs.map((d, i) => { const r = es[i].dn / 2000; return cil([0, 0, 0], scale(d, Math.max(r * 2.6, 0.022)), r * 1.28); });
      objeto("IFCPIPEFITTING", nome, no.pav, c, itens, tipo);
    }
  }
  // esgoto (sistema separado)
  const sisAF = sistema.splice(0);
  for (const { montada, dn, dec } of e.esgoto ?? []) {
    const G = montada.grafo;
    const inc = new Map<number, { o: number; dn: number }[]>();
    for (const a of G.arestas) {
      if (a.el) usados.add(a.el);
      const p = G.nos[a.a], q = G.nos[a.b], d = dn?.get(a.trecho) ?? 100;
      const A: V3 = [p.x, p.y, p.z], B: V3 = [q.x, q.y, q.z];
      const ref = objeto("IFCPIPESEGMENT", `Tubo PVC esgoto ${d} mm`, p.z <= q.z ? p.pav : q.pav, A, [cil([0, 0, 0], sub(B, A), d / 2000)], "RIGIDSEGMENT", str(a.trecho));
      const i = dec?.get(a.trecho);
      props(ref, "OpenHidro_Esgoto", [["Trecho", `IFCLABEL(${str(a.trecho)})`], ["DN", `IFCPOSITIVELENGTHMEASURE(${num(d / 1000)})`],
        ["Material", "IFCLABEL('PVC esgoto série normal (NBR 5688)')"], ...(i != null ? [["Declividade", `IFCREAL(${num(i)})`]] as [string, string][] : [])]);
      (inc.get(a.a) ?? inc.set(a.a, []).get(a.a)!).push({ o: a.b, dn: d });
      (inc.get(a.b) ?? inc.set(a.b, []).get(a.b)!).push({ o: a.a, dn: d });
    }
    for (const no of G.nos) {
      const es = inc.get(no.i) ?? [];
      const c: V3 = [no.x, no.y, no.z];
      const el = no.res ? porEl.get(no.res) : null;
      if (el?.tipo === "caixa_esgoto") {
        if (el.modelo === "inspecao" || el.modelo === "gordura")
          objeto("IFCDISTRIBUTIONCHAMBERELEMENT", MODELOS_CAIXA[el.modelo].nome, no.pav, c, [cil([0, 0, -0.6], [0, 0, 0], 0.3)], el.modelo === "inspecao" ? "INSPECTIONCHAMBER" : "SUMP");
        else objeto("IFCWASTETERMINAL", MODELOS_CAIXA[el.modelo].nome, no.pav, c, [cil([0, 0, -0.2], [0, 0, 0.05], el.modelo === "ralo" ? 0.05 : 0.075)], "FLOORTRAP");
        continue;
      }
      if (el?.tipo === "saida_esgoto" || es.length < 2) continue;
      const dirs = es.map((x) => norm(sub([G.nos[x.o].x, G.nos[x.o].y, G.nos[x.o].z], c)));
      const reta = es.length === 2 && dot(dirs[0], dirs[1]) < -0.98;
      if (reta && es[0].dn === es[1].dn) continue;
      const max = Math.max(...es.map((x) => x.dn));
      const tipo = es.length >= 3 ? "JUNCTION" : reta ? "TRANSITION" : "BEND";
      const itens = dirs.map((d, i) => { const r = es[i].dn / 2000; return cil([0, 0, 0], scale(d, Math.max(r * 2, 0.04)), r * 1.15); });
      objeto("IFCPIPEFITTING", `${es.length >= 3 ? "Junção" : reta ? "Redução" : "Joelho"} esgoto ${max} mm`, no.pav, c, itens, tipo);
    }
  }
  const sisES = sistema.splice(0);
  sistema.push(...sisAF);
  if (sisES.length) {
    const s2 = add(`IFCDISTRIBUTIONSYSTEM('${guid()}',$,'Esgoto sanitário',$,$,$,.SEWAGE.)`);
    add(`IFCRELASSIGNSTOGROUP('${guid()}',$,$,$,(${sisES.join(",")}),$,${s2})`);
    add(`IFCRELSERVICESBUILDINGS('${guid()}',$,$,$,${s2},(${edificacao}))`);
  }

  for (const el of e.elementos) {
    if (el.tipo !== "tubo" || usados.has(el.id) || !andar.has(el.pavimentoId)) continue;
    const z = andar.get(el.pavimentoId)!.cota + el.altura, d = el.dn ?? 25;
    const A: V3 = [el.x1 * e.escala, el.y1 * e.escala, z], B: V3 = [el.x2 * e.escala, el.y2 * e.escala, z];
    objeto("IFCPIPESEGMENT", `Tubo PVC soldável ${d} mm (fora de rede)`, el.pavimentoId, A, [cil([0, 0, 0], sub(B, A), d / 2000)], "RIGIDSEGMENT");
  }

  for (const a of andar.values()) if (a.itens.length)
    add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',$,$,$,(${a.itens.join(",")}),${a.ref})`);
  if (sistema.length) {
    const sis = add(`IFCDISTRIBUTIONSYSTEM('${guid()}',$,'Água fria',$,$,$,.DOMESTICCOLDWATER.)`);
    add(`IFCRELASSIGNSTOGROUP('${guid()}',$,$,$,(${sistema.join(",")}),$,${sis})`);
    add(`IFCRELSERVICESBUILDINGS('${guid()}',$,$,$,${sis},(${edificacao}))`);
  }

  const agora = new Date().toISOString().slice(0, 19);
  return ["ISO-10303-21;", "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView_V1.2]'),'2;1');",
    `FILE_NAME(${str(e.nome + ".ifc")},'${agora}',(''),(''),'OpenHidro ${e.versao}','OpenHidro','');`,
    "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;", ...linhas, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
}

// ---------------------------------------------------------------- utilidades
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function perp(d: V3): V3 {
  const ref: V3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const c: V3 = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]];
  return norm(c);
}

/** Número no formato STEP (sempre com ponto decimal). */
export function num(v: number): string {
  if (!isFinite(v)) v = 0;
  const r = Math.round(v * 1e6) / 1e6;
  if (Object.is(r, -0) || r === 0) return "0.";
  let s = String(r);
  if (s.includes("e")) { const [m, ex] = s.split("e"); s = (m.includes(".") ? m : m + ".") + "E" + ex; }
  else if (!s.includes(".")) s += ".";
  return s;
}

/** Texto STEP: aspas simples duplicadas, caracteres fora do ASCII como \X2\hhhh\X0\. */
export function str(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "'") out += "''";
    else if (ch === "\\") out += "\\\\";
    else if (c >= 32 && c < 127) out += ch;
    else {
      const u = c > 0xffff ? String.fromCodePoint(c) : ch;
      out += "\\X2\\" + [...u].map((x) => { let h = ""; for (let i = 0; i < x.length; i++) h += x.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0"); return h; }).join("") + "\\X0\\";
    }
  }
  return `'${out}'`;
}

const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
/** GlobalId IFC: 128 bits aleatórios codificados em 22 caracteres. */
export function guid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let v = 0n;
  for (const x of b) v = (v << 8n) | BigInt(x);
  let s = "";
  for (let i = 0; i < 22; i++) { s = B64[Number(v & 63n)] + s; v >>= 6n; }
  return s;
}
