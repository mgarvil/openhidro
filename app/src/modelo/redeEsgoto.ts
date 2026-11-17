// Monta as redes de esgoto (NBR 8160) a partir dos elementos desenhados.
// - Pontos de esgoto ficam no piso; tubos na altura indicada (negativa = sob a laje/aterro);
//   a descida do ponto até o tubo é gerada aqui (ramal de descarga).
// - Tubos que terminam no meio de outro, na mesma cota, formam junção.
// - Tubo de queda liga os pavimentos verticalmente.
// - Cada saída (ligação à rede pública) define uma rede; o escoamento vai das pontas até a saída.
// - Trechos vão de articulação em articulação (pontos, caixas, junções, pé/topo do tubo de queda).
import type { Pavimento } from "../projeto";
import { MODELOS_CAIXA, SIGLAS_ES, type Elemento, type ElTuboEsgoto } from "./elementos";
import type { ArestaGrafo, NoGrafo, Problema, SegmentoTrecho, TrechoMontado } from "./rede";

const TOL = 0.005, TOL_Z = 0.002;

export interface RedeEsgotoMontada {
  id: string;                         // id da saída
  rede: any;                          // JSON do motor (sistema "esgoto")
  trechos: TrechoMontado[];
  nos: Record<string, string>;        // nó do motor -> elemento
  grafo: { nos: NoGrafo[]; arestas: ArestaGrafo[]; pai: Record<number, number> };
}

interface N { i: number; x: number; y: number; z: number; pav: string; dx: number; dy: number; el?: Elemento; arestas: number[] }
interface A { i: number; a: number; b: number; el?: string; vertical: boolean; tq: boolean; comp: number; dec: number | null }

export function montarRedesEsgoto(elementos: Elemento[], pavimentos: Pavimento[], escala: number):
    { redes: RedeEsgotoMontada[]; erros: Problema[]; avisos: Problema[] } {
  const cota = new Map(pavimentos.map((p) => [p.id, p.cota]));
  const erros: Problema[] = [], avisos: Problema[] = [];
  const nos: N[] = [], arestas: A[] = [];
  const indice = new Map<string, number>();
  const no = (dx: number, dy: number, z: number, pav: string): N => {
    const x = dx * escala, y = dy * escala;
    const k = `${Math.round(x / TOL)}|${Math.round(y / TOL)}|${Math.round(z / TOL_Z)}`;
    let i = indice.get(k);
    if (i === undefined) { i = nos.length; nos.push({ i, x, y, z, pav, dx, dy, arestas: [] }); indice.set(k, i); }
    return nos[i];
  };
  const chaves = new Set<string>();
  const ligar = (a: N, b: N, vertical: boolean, el?: string, tq = false, dec: number | null = null) => {
    if (a === b) return;
    const k = a.i < b.i ? `${a.i}-${b.i}` : `${b.i}-${a.i}`;
    if (chaves.has(k)) return;
    chaves.add(k);
    const ar: A = { i: arestas.length, a: a.i, b: b.i, el, vertical, tq, comp: vertical ? Math.abs(a.z - b.z) : Math.hypot(a.x - b.x, a.y - b.y), dec };
    arestas.push(ar); a.arestas.push(ar.i); b.arestas.push(ar.i);
  };
  const zDe = (pav: string, h: number) => (cota.get(pav) ?? 0) + h;
  const tubos = elementos.filter((e): e is ElTuboEsgoto => e.tipo === "tubo_esgoto" && cota.has(e.pavimentoId));

  // tubos (partidos onde outro tubo, ponto ou caixa chega no meio)
  const pontas: { x: number; y: number; z: number | null; pav: string | null; t: ElTuboEsgoto | null }[] = tubos.flatMap((t) => [
    { x: t.x1, y: t.y1, z: zDe(t.pavimentoId, t.altura), pav: t.pavimentoId, t }, { x: t.x2, y: t.y2, z: zDe(t.pavimentoId, t.altura), pav: t.pavimentoId, t }]);
  for (const e of elementos) if (e.tipo === "ponto_esgoto" || e.tipo === "caixa_esgoto" || e.tipo === "tubo_queda" || e.tipo === "saida_esgoto")
    pontas.push({ x: e.x, y: e.y, z: null, pav: e.tipo === "tubo_queda" ? null : e.pavimentoId, t: null });
  for (const t of tubos) {
    const z = zDe(t.pavimentoId, t.altura);
    const L = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
    if (L * escala < TOL) continue;
    const ux = (t.x2 - t.x1) / L, uy = (t.y2 - t.y1) / L;
    const cortes = new Set<number>([0, 1]);
    for (const p of pontas) {
      if (p.t === t) continue;
      if (p.z !== null ? Math.abs(p.z - z) > TOL_Z : p.pav !== null && p.pav !== t.pavimentoId) continue;
      const s = ((p.x - t.x1) * ux + (p.y - t.y1) * uy) / L;
      if (s <= 1e-6 || s >= 1 - 1e-6) continue;
      if (Math.abs((p.x - t.x1) * uy - (p.y - t.y1) * ux) * escala < TOL) cortes.add(s);
    }
    const ss = [...cortes].sort((a, b) => a - b);
    for (let k = 0; k < ss.length - 1; k++)
      ligar(no(t.x1 + (t.x2 - t.x1) * ss[k], t.y1 + (t.y2 - t.y1) * ss[k], z, t.pavimentoId),
            no(t.x1 + (t.x2 - t.x1) * ss[k + 1], t.y1 + (t.y2 - t.y1) * ss[k + 1], z, t.pavimentoId), false, t.id, false, t.declividade);
  }

  // pilhas verticais: ponto (piso) / caixa / saída até os tubos na mesma vertical; tubo de queda entre pavimentos
  const nosEm = (dx: number, dy: number, f: (n: N) => boolean) => nos.filter((n) => Math.hypot(n.x - dx * escala, n.y - dy * escala) < TOL && f(n));
  const pilhas: { x: number; y: number; nos: Set<N>; tq?: string }[] = [];
  const pilhaEm = (x: number, y: number) => {
    let p = pilhas.find((q) => Math.hypot(q.x - x, q.y - y) * escala < TOL);
    if (!p) { p = { x, y, nos: new Set() }; pilhas.push(p); }
    return p;
  };
  for (const e of elementos) {
    if (!cota.has(e.pavimentoId)) continue;
    if (e.tipo === "ponto_esgoto" || e.tipo === "caixa_esgoto" || e.tipo === "saida_esgoto") {
      const p = pilhaEm(e.x, e.y);
      for (const n of nosEm(e.x, e.y, (n) => n.pav === e.pavimentoId)) p.nos.add(n);
      const n = no(e.x, e.y, zDe(e.pavimentoId, e.tipo === "ponto_esgoto" ? 0 : e.altura), e.pavimentoId);
      n.el = e;
      p.nos.add(n);
    }
  }
  for (const e of elementos) {
    if (e.tipo !== "tubo_queda" || !cota.has(e.pavimentoId)) continue;
    const z0 = cota.get(e.pavimentoId)!, z1 = cota.get(e.topoId) ?? z0;
    const [lo, hi] = [Math.min(z0, z1), Math.max(z0, z1)];
    const pavs = new Set(pavimentos.filter((p) => p.cota >= lo - 1e-6 && p.cota <= hi + 1e-6).map((p) => p.id));
    const ligados = nosEm(e.x, e.y, (n) => pavs.has(n.pav));
    if (new Set(ligados.map((n) => n.pav)).size < 2) avisos.push({ mensagem: "Tubo de queda sem tubos ligados em pelo menos dois pavimentos", elementos: [e.id] });
    const p = pilhaEm(e.x, e.y);
    p.tq = e.id;
    for (const n of ligados) p.nos.add(n);
  }
  for (const p of pilhas) {
    const u = [...p.nos].sort((a, b) => a.z - b.z);
    for (let k = 0; k < u.length - 1; k++) {
      const tq = !!p.tq && u[k].pav !== u[k + 1].pav;
      ligar(u[k], u[k + 1], true, tq ? p.tq : undefined, tq);
    }
  }

  // componentes e árvores a partir das saídas
  const outro = (a: A, n: number) => (a.a === n ? a.b : a.a);
  const visto = new Uint8Array(nos.length);
  const redes: RedeEsgotoMontada[] = [];
  for (const ini of nos) {
    if (visto[ini.i]) continue;
    const comp: N[] = [];
    const fila = [ini.i]; visto[ini.i] = 1;
    while (fila.length) {
      const n = nos[fila.pop()!]; comp.push(n);
      for (const ai of n.arestas) { const o = outro(arestas[ai], n.i); if (!visto[o]) { visto[o] = 1; fila.push(o); } }
    }
    const saidas = comp.filter((n) => n.el?.tipo === "saida_esgoto");
    const els = [...new Set(comp.flatMap((n) => [n.el?.id, ...n.arestas.map((a) => arestas[a].el)]).filter(Boolean) as string[])];
    if (!saidas.length) {
      if (comp.some((n) => n.el?.tipo === "ponto_esgoto")) erros.push({ mensagem: "Rede de esgoto sem saída: lance a ligação à rede pública (Saída)", elementos: els });
      continue;
    }
    if (saidas.length > 1) { erros.push({ mensagem: "Mais de uma saída na mesma rede de esgoto", elementos: saidas.map((n) => n.el!.id) }); continue; }
    const r = arvore(saidas[0], nos, arestas, erros, pavimentos.length);
    if (r) redes.push(r);
  }
  return { redes, erros, avisos };
}

function arvore(raiz: N, nos: N[], arestas: A[], erros: Problema[], npav: number): RedeEsgotoMontada | null {
  const outro = (a: A, n: number) => (a.a === n ? a.b : a.a);
  const pai = new Map<number, number>();
  const ordem = [raiz.i];
  const vis = new Set([raiz.i]);
  for (let k = 0; k < ordem.length; k++) {
    const n = ordem[k];
    for (const ai of nos[n].arestas) {
      if (ai === pai.get(n)) continue;
      const o = outro(arestas[ai], n);
      if (vis.has(o)) { erros.push({ mensagem: "A rede de esgoto forma um anel", elementos: [arestas[ai].el].filter(Boolean) as string[] }); return null; }
      vis.add(o); pai.set(o, ai); ordem.push(o);
    }
  }
  // ramal secundário chegando a 90° no horizontal: deve entrar por junção a 45°
  for (const k of ordem) {
    const n = nos[k];
    if (n.el || n.arestas.length < 3 || k === raiz.i) continue;
    const ap = pai.get(k)!;
    if (arestas[ap].vertical) continue;
    const dir = (ai: number) => { const o = nos[outro(arestas[ai], k)]; const v = [o.x - n.x, o.y - n.y]; const m = Math.hypot(v[0], v[1]) || 1; return [v[0] / m, v[1] / m]; };
    const f = dir(ap);   // sentido do escoamento (para jusante)
    for (const ai of n.arestas) {
      if (ai === ap || arestas[ai].vertical) continue;
      const u = dir(ai);
      const entrada = -(u[0] * f[0] + u[1] * f[1]);   // cosseno entre a chegada e a saída
      if (entrada < 0.5) {
        erros.push({ mensagem: "Ramal de esgoto chegando a 90° no horizontal: use junção a 45° (desenhe a chegada inclinada no sentido do escoamento)",
                     elementos: [arestas[ai].el, arestas[ap].el].filter(Boolean) as string[] });
      }
    }
  }
  const articulacao = (n: N) => n === raiz || !!n.el || n.arestas.length !== 2 ||
    new Set(n.arestas.map((a) => arestas[a].tq)).size > 1;

  const nomes = new Map<number, string>();
  const cont: Record<string, number> = {};
  const nomear = (n: N) => {
    if (nomes.has(n.i)) return nomes.get(n.i)!;
    let s = "J";
    const e = n.el;
    if (e?.tipo === "saida_esgoto") s = "SAIDA";
    else if (e?.tipo === "ponto_esgoto") s = SIGLAS_ES[e.chave] ?? "P";
    else if (e?.tipo === "caixa_esgoto") s = MODELOS_CAIXA[e.modelo].sigla;
    cont[s] = (cont[s] ?? 0) + 1;
    const nome = e?.rotulo || (s === "SAIDA" ? "SAIDA" : `${s}${cont[s]}`);
    nomes.set(n.i, nome);
    return nome;
  };
  const rNos: any[] = [], rTrechos: any[] = [], trechos: TrechoMontado[] = [];
  const mapa: Record<string, string> = {};
  const addNo = (n: N) => {
    const id = nomear(n);
    if (rNos.some((x) => x.id === id)) return id;
    const e = n.el;
    const d: any = { id, x: +n.x.toFixed(4), y: +n.y.toFixed(4), z: +n.z.toFixed(4),
      tipo: e?.tipo === "saida_esgoto" ? "saida" : e?.tipo === "ponto_esgoto" ? "ponto" :
            e?.tipo === "caixa_esgoto" ? (e.modelo === "sifonada" ? "caixa_sifonada" : "caixa_inspecao") : "juncao" };
    if (e?.tipo === "ponto_esgoto") { d.aparelho = e.chave; d.quantidade = e.quantidade || 1; }
    if (e) mapa[id] = e.id;
    rNos.push(d);
    return id;
  };
  addNo(raiz);
  const arestaTrecho = new Map<number, string>();
  const nosRede = new Set([raiz.i]);
  // percorre da saída para montante; cada trecho é escrito no sentido do escoamento (ponta -> saída)
  const pilha: { no: number; aresta: number }[] = [];
  const saidas = (n: number) => { for (const ai of nos[n].arestas) if (ai !== pai.get(n)) pilha.push({ no: n, aresta: ai }); };
  saidas(raiz.i);
  let nt = 0;
  while (pilha.length) {
    const { no: jus, aresta: a0 } = pilha.shift()!;
    const id = `E${++nt}`;
    let atual = jus, ai = a0, comp = 0;
    const decs: number[] = [];
    const els = new Set<string>();
    const segs: SegmentoTrecho[] = [];
    let soVertical = true;
    for (;;) {
      const ar = arestas[ai];
      const prox = outro(ar, atual);
      comp += ar.comp;
      if (!ar.vertical) { soVertical = false; if (ar.dec != null) decs.push(ar.dec); }
      if (ar.el) {
        els.add(ar.el);
        segs.push({ el: ar.el, pavimentoId: nos[prox].pav, x1: nos[prox].dx, y1: nos[prox].dy, x2: nos[atual].dx, y2: nos[atual].dy, vertical: ar.vertical });
      }
      arestaTrecho.set(ai, id);
      atual = prox;
      nosRede.add(atual);
      if (articulacao(nos[atual])) break;
      ai = nos[atual].arestas.find((x) => x !== ai)!;
    }
    const para = addNo(nos[jus]), de = addNo(nos[atual]);
    const t: any = { id, de, para, comprimento: +comp.toFixed(4) };
    t.declividade = soVertical ? null : decs.length ? Math.min(...decs) : null;
    rTrechos.push(t);
    trechos.push({ id, de, para, elementos: [...els], segmentos: segs });
    saidas(atual);
  }
  if (!rTrechos.length) return null;
  const idx = new Map<number, number>();
  const gNos: NoGrafo[] = [...nosRede].map((n, k) => {
    idx.set(n, k);
    const o = nos[n];
    return { i: k, x: o.x, y: o.y, z: o.z, dx: o.dx, dy: o.dy, pav: o.pav, ap: o.el?.tipo === "ponto_esgoto" ? o.el.id : undefined,
             res: o.el && o.el.tipo !== "ponto_esgoto" ? o.el.id : undefined, nome: nomes.get(n) };
  });
  const gArestas: ArestaGrafo[] = [...arestaTrecho].map(([ai, t]) => ({ a: idx.get(arestas[ai].a)!, b: idx.get(arestas[ai].b)!, trecho: t, vertical: arestas[ai].vertical, el: arestas[ai].el }));
  const gPai: Record<number, number> = {};
  for (const [n, ai] of pai) if (idx.has(n)) gPai[idx.get(n)!] = idx.get(outro(arestas[ai], n))!;
  const s = raiz.el!;
  const rede = { sistema: "esgoto", nome: s.rotulo || "Esgoto", parametros: { pavimentos: Math.max(1, npav), declividade_padrao: 0.02 },
                 nos: rNos, trechos: rTrechos };
  return { id: s.id, rede, trechos, nos: mapa, grafo: { nos: gNos, arestas: gArestas, pai: gPai } };
}
