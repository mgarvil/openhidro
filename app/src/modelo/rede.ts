// Monta, a partir dos elementos desenhados, as redes no formato do motor (docs/formato-rede.md).
//
// - Tubos são horizontais na altura indicada; a ligação vertical até o ponto de utilização,
//   até o reservatório e ao longo das colunas é gerada aqui (descidas/subidas).
// - Tubos que terminam no meio de outro, na mesma cota, formam um tê (o tubo é partido).
// - Cadeias sem derivação viram um único trecho; joelhos e tês são contados pela geometria.
// - Cada reservatório com sua árvore de tubos vira uma rede independente.
import type { Pavimento } from "../projeto";
import { MODELOS_REGISTRO, SIGLAS, type ElAparelho, type ElRegistro, type ElReservatorio, type Elemento, type ElTubo } from "./elementos";

const TOL = 0.005;       // m — coincidência de pontos em planta
const TOL_Z = 0.002;     // m

export interface SegmentoTrecho { el: string; pavimentoId: string; x1: number; y1: number; x2: number; y2: number; vertical: boolean }
export interface TrechoMontado { id: string; de: string; para: string; elementos: string[]; segmentos: SegmentoTrecho[] }
/** Grafo 3D da rede (metros), para lista de materiais e isométricos. */
export interface NoGrafo { i: number; x: number; y: number; z: number; dx: number; dy: number; pav: string; ap?: string; res?: string; reg?: string; nome?: string }
export interface ArestaGrafo { a: number; b: number; trecho: string; vertical: boolean; el?: string }
export interface RedeMontada {
  id: string;                         // id do reservatório
  rede: any;                          // JSON do motor
  trechos: TrechoMontado[];
  nos: Record<string, string>;        // id do nó -> id do elemento (aparelho/reservatório)
  grafo: { nos: NoGrafo[]; arestas: ArestaGrafo[]; pai: Record<number, number> };   // pai: nó -> nó a montante
}
export interface Problema { mensagem: string; elementos: string[] }
export interface ResultadoMontagem { redes: RedeMontada[]; erros: Problema[]; avisos: Problema[] }

interface NoG {
  i: number; x: number; y: number; z: number; pav: string;
  ap?: ElAparelho; res?: ElReservatorio; reg?: ElRegistro; arestas: number[];
  dx: number; dy: number;            // coordenadas de desenho (para rótulos)
}
interface ArestaG { i: number; a: number; b: number; el?: string; vertical: boolean; comp: number }

export function montarRedes(elementos: Elemento[], pavimentos: Pavimento[], escala: number): ResultadoMontagem {
  const cota = new Map(pavimentos.map((p) => [p.id, p.cota]));
  const erros: Problema[] = [], avisos: Problema[] = [];
  const nos: NoG[] = [];
  const arestas: ArestaG[] = [];
  const indice = new Map<string, number>();
  const chave = (x: number, y: number, z: number) => `${Math.round(x / TOL)}|${Math.round(y / TOL)}|${Math.round(z / TOL_Z)}`;

  const no = (dx: number, dy: number, z: number, pav: string): NoG => {
    const x = dx * escala, y = dy * escala;
    const k = chave(x, y, z);
    let i = indice.get(k);
    if (i === undefined) {
      i = nos.length;
      nos.push({ i, x, y, z, pav, arestas: [], dx, dy });
      indice.set(k, i);
    }
    return nos[i];
  };
  const chavesAresta = new Set<string>();
  const ligar = (a: NoG, b: NoG, vertical: boolean, el?: string) => {
    if (a === b) return;
    const k = a.i < b.i ? `${a.i}-${b.i}` : `${b.i}-${a.i}`;
    if (chavesAresta.has(k)) return;
    chavesAresta.add(k);
    const comp = vertical ? Math.abs(a.z - b.z) : Math.hypot(a.x - b.x, a.y - b.y);
    const ar: ArestaG = { i: arestas.length, a: a.i, b: b.i, el, vertical, comp };
    arestas.push(ar);
    a.arestas.push(ar.i);
    b.arestas.push(ar.i);
  };

  const zDe = (pav: string, altura: number) => (cota.get(pav) ?? 0) + altura;
  const tubos = elementos.filter((e): e is ElTubo => e.tipo === "tubo" && cota.has(e.pavimentoId));

  // ---- tubos, partidos onde outro tubo chega no meio (tê)
  // pontos que partem um tubo: pontas de outros tubos na mesma cota e pontos/reservatórios/colunas
  // posicionados sobre ele (a ligação vertical sai do meio do tubo, formando um tê)
  const pontas: { x: number; y: number; z: number | null; pav: string | null; t: ElTubo | null }[] = tubos.flatMap((t) => [
    { x: t.x1, y: t.y1, z: zDe(t.pavimentoId, t.altura), pav: t.pavimentoId, t }, { x: t.x2, y: t.y2, z: zDe(t.pavimentoId, t.altura), pav: t.pavimentoId, t }]);
  for (const e of elementos) if (e.tipo === "aparelho" || e.tipo === "reservatorio" || e.tipo === "coluna" || e.tipo === "registro")
    pontas.push({ x: e.x, y: e.y, z: null, pav: e.tipo === "coluna" ? null : e.pavimentoId, t: null });
  // (registros também partem o tubo: o nó criado recebe o registro logo abaixo)
  for (const t of tubos) {
    const z = zDe(t.pavimentoId, t.altura);
    const L = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
    if (L * escala < TOL) { avisos.push({ mensagem: "Tubo de comprimento nulo ignorado", elementos: [t.id] }); continue; }
    const ux = (t.x2 - t.x1) / L, uy = (t.y2 - t.y1) / L;
    const cortes = new Set<number>([0, 1]);
    for (const p of pontas) {
      if (p.t === t) continue;
      if (p.z !== null ? Math.abs(p.z - z) > TOL_Z : p.pav !== null && p.pav !== t.pavimentoId) continue;
      const s = ((p.x - t.x1) * ux + (p.y - t.y1) * uy) / L;
      if (s <= 1e-6 || s >= 1 - 1e-6) continue;
      const d = Math.abs((p.x - t.x1) * uy - (p.y - t.y1) * ux) * escala;
      if (d < TOL) cortes.add(s);
    }
    const ss = [...cortes].sort((a, b) => a - b);
    for (let k = 0; k < ss.length - 1; k++) {
      const a = no(t.x1 + (t.x2 - t.x1) * ss[k], t.y1 + (t.y2 - t.y1) * ss[k], z, t.pavimentoId);
      const b = no(t.x1 + (t.x2 - t.x1) * ss[k + 1], t.y1 + (t.y2 - t.y1) * ss[k + 1], z, t.pavimentoId);
      ligar(a, b, false, t.id);
    }
  }

  // ---- ligações verticais: pontos de utilização, reservatórios e colunas
  const nosEm = (dx: number, dy: number, filtro: (n: NoG) => boolean) =>
    nos.filter((n) => Math.hypot(n.x - dx * escala, n.y - dy * escala) < TOL && filtro(n));
  const empilhar = (pilha: NoG[], el?: string) => {
    const unicos = [...new Set(pilha)].sort((a, b) => a.z - b.z);
    for (let k = 0; k < unicos.length - 1; k++) ligar(unicos[k], unicos[k + 1], true, el);
  };

  // Tudo que está na mesma vertical (mesmo x, y) de um pavimento forma uma pilha, ligada de baixo
  // para cima (descidas). As colunas formam pilhas que atravessam pavimentos.
  const pilhas: { x: number; y: number; pav: string | null; nos: Set<NoG>; coluna?: string }[] = [];
  const pilhaEm = (x: number, y: number, pav: string | null) => {
    let p = pilhas.find((q) => q.pav === pav && Math.hypot(q.x - x, q.y - y) * escala < TOL);
    if (!p) { p = { x, y, pav, nos: new Set() }; pilhas.push(p); }
    return p;
  };
  for (const e of elementos) {
    if (!cota.has(e.pavimentoId)) continue;
    if (e.tipo === "aparelho" || e.tipo === "reservatorio") {
      const p = pilhaEm(e.x, e.y, e.pavimentoId);
      for (const n of nosEm(e.x, e.y, (n) => n.pav === e.pavimentoId)) p.nos.add(n);
      const n = no(e.x, e.y, zDe(e.pavimentoId, e.altura), e.pavimentoId);
      if (e.tipo === "aparelho") n.ap = e; else n.res = e;
      p.nos.add(n);
    }
  }
  // descida/subida: pontas de tubo no mesmo x, y e pavimento, em alturas diferentes
  const pontasPorLugar = new Map<string, Set<NoG>>();
  for (const t of tubos) for (const [x, y] of [[t.x1, t.y1], [t.x2, t.y2]]) {
    const k = `${t.pavimentoId}|${Math.round(x * escala / TOL)}|${Math.round(y * escala / TOL)}`;
    const n = no(x, y, zDe(t.pavimentoId, t.altura), t.pavimentoId);
    (pontasPorLugar.get(k) ?? pontasPorLugar.set(k, new Set()).get(k)!).add(n);
  }
  for (const ns of pontasPorLugar.values()) {
    if (new Set([...ns].map((n) => Math.round(n.z / TOL_Z))).size < 2) continue;
    const a = [...ns][0];
    const p = pilhaEm(a.dx, a.dy, a.pav);
    for (const n of ns) p.nos.add(n);
  }
  // registro numa descida (com altura): vira um nó da pilha naquele ponto
  for (const e of elementos) {
    if (e.tipo !== "registro" || e.altura == null || !cota.has(e.pavimentoId)) continue;
    const p = pilhas.find((q) => q.pav === e.pavimentoId && Math.hypot(q.x - e.x, q.y - e.y) * escala < TOL);
    if (!p) { avisos.push({ mensagem: "Registro com altura fora de uma descida", elementos: [e.id] }); continue; }
    const n = no(e.x, e.y, zDe(e.pavimentoId, e.altura), e.pavimentoId);
    n.reg = e;
    p.nos.add(n);
  }
  for (const e of elementos) {
    if (e.tipo !== "coluna" || !cota.has(e.pavimentoId)) continue;
    const z0 = cota.get(e.pavimentoId)!, z1 = cota.get(e.topoId) ?? z0;
    const [lo, hi] = [Math.min(z0, z1), Math.max(z0, z1)];
    const pavsNaFaixa = new Set(pavimentos.filter((p) => p.cota >= lo - 1e-6 && p.cota <= hi + 1e-6).map((p) => p.id));
    const ligados = nosEm(e.x, e.y, (n) => pavsNaFaixa.has(n.pav));
    if (new Set(ligados.map((n) => n.pav)).size < 2)
      avisos.push({ mensagem: "Coluna sem tubos ligados em pelo menos dois pavimentos", elementos: [e.id] });
    const p = pilhaEm(e.x, e.y, null);
    p.coluna = e.id;
    for (const n of ligados) p.nos.add(n);
  }
  for (const p of pilhas) empilhar([...p.nos], p.coluna);
  for (const e of elementos) {
    if (e.tipo !== "registro" || e.altura != null || !cota.has(e.pavimentoId)) continue;
    const ns = nosEm(e.x, e.y, (n) => n.pav === e.pavimentoId && n.arestas.length > 0);
    if (!ns.length) avisos.push({ mensagem: "Registro fora de tubo", elementos: [e.id] });
    for (const n of ns) n.reg = e;
  }

  // ---- componentes
  const visto = new Uint8Array(nos.length);
  const redes: RedeMontada[] = [];
  const elsDe = (comp: NoG[]) => {
    const s = new Set<string>();
    for (const n of comp) {
      if (n.ap) s.add(n.ap.id);
      if (n.res) s.add(n.res.id);
      for (const a of n.arestas) if (arestas[a].el) s.add(arestas[a].el!);
    }
    return [...s];
  };
  const outro = (a: ArestaG, n: number) => (a.a === n ? a.b : a.a);

  for (const inicio of nos) {
    if (visto[inicio.i]) continue;
    const comp: NoG[] = [];
    const fila = [inicio.i];
    visto[inicio.i] = 1;
    while (fila.length) {
      const n = nos[fila.pop()!];
      comp.push(n);
      for (const a of n.arestas) { const o = outro(arestas[a], n.i); if (!visto[o]) { visto[o] = 1; fila.push(o); } }
    }
    const reservatorios = comp.filter((n) => n.res);
    const temAparelho = comp.some((n) => n.ap);
    if (reservatorios.length === 0) {
      if (temAparelho) erros.push({ mensagem: "Rede sem reservatório: ligue estes pontos a um reservatório", elementos: elsDe(comp) });
      else if (comp.length > 1) avisos.push({ mensagem: "Tubos soltos (sem reservatório nem pontos)", elementos: elsDe(comp) });
      continue;
    }
    if (reservatorios.length > 1) {
      erros.push({ mensagem: "Mais de um reservatório na mesma rede", elementos: reservatorios.map((n) => n.res!.id) });
      continue;
    }
    const r = montarArvore(reservatorios[0], nos, arestas, erros, avisos);
    if (r) redes.push(r);
  }
  return { redes, erros, avisos };
}

// ---------------------------------------------------------------------------------------------
function montarArvore(raiz: NoG, nos: NoG[], arestas: ArestaG[], erros: Problema[], avisos: Problema[]): RedeMontada | null {
  const outro = (a: ArestaG, n: number) => (a.a === n ? a.b : a.a);
  const pai = new Map<number, number>();   // nó -> aresta de chegada
  const ordem: number[] = [raiz.i];
  const visto = new Set([raiz.i]);
  for (let k = 0; k < ordem.length; k++) {
    const n = ordem[k];
    for (const ai of nos[n].arestas) {
      if (ai === pai.get(n)) continue;
      const o = outro(arestas[ai], n);
      if (visto.has(o)) {
        if (pai.get(o) !== ai) {
          erros.push({ mensagem: "A rede forma um anel; o cálculo exige uma rede em árvore (retire um tubo do anel)",
                       elementos: [arestas[ai].el].filter(Boolean) as string[] });
          return null;
        }
        continue;
      }
      visto.add(o);
      pai.set(o, ai);
      ordem.push(o);
    }
  }

  const grau = (n: NoG) => n.arestas.length;
  // conexões que não existem no mercado: derivação em 3 direções sem par alinhado ("tê de canto")
  for (const k of ordem) {
    const n = nos[k];
    if (grau(n) < 3) continue;
    const ds = n.arestas.map((ai) => { const o = nos[outro(arestas[ai], n.i)]; const v = [o.x - n.x, o.y - n.y, o.z - n.z]; const m = Math.hypot(v[0], v[1], v[2]) || 1; return v.map((c) => c / m); });
    let pares = 0;
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++)
      if (ds[i][0] * ds[j][0] + ds[i][1] * ds[j][1] + ds[i][2] * ds[j][2] < -0.98) pares++;
    if (pares * 2 + 1 < ds.length || (ds.length === 3 && pares === 0))
      erros.push({ mensagem: `Derivação em ${ds.length} direções sem saídas alinhadas (tê de canto): essa peça não existe. Afaste a derivação do ponto de descida (tê + joelho)`,
                   elementos: [...new Set(n.arestas.map((ai) => arestas[ai].el).filter(Boolean) as string[])] });
  }
  const articulacao = (n: NoG) => n === raiz || !!n.ap || grau(n) !== 2;
  const dir = (de: NoG, para: NoG) => {
    const v = [para.x - de.x, para.y - de.y, para.z - de.z];
    const m = Math.hypot(v[0], v[1], v[2]) || 1;
    return v.map((c) => c / m);
  };
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // nomes dos nós de cálculo
  const nomes = new Map<number, string>();
  const cont: Record<string, number> = {};
  const nomear = (n: NoG) => {
    if (nomes.has(n.i)) return nomes.get(n.i)!;
    let nome: string;
    if (n.res) nome = n.res.rotulo || "RES";
    else if (n.ap) { const s = SIGLAS[n.ap.chave] ?? "P"; cont[s] = (cont[s] ?? 0) + 1; nome = n.ap.rotulo || `${s}${cont[s]}`; }
    else { cont.N = (cont.N ?? 0) + 1; nome = `N${cont.N}`; }
    while ([...nomes.values()].includes(nome)) nome += "'";
    nomes.set(n.i, nome);
    return nome;
  };

  const redeNos: any[] = [];
  const redeTrechos: any[] = [];
  const trechos: TrechoMontado[] = [];
  const mapaNos: Record<string, string> = {};
  const addNo = (n: NoG) => {
    const id = nomear(n);
    if (redeNos.some((x) => x.id === id)) return id;
    const d: any = { id, x: +n.x.toFixed(4), y: +n.y.toFixed(4), z: +n.z.toFixed(4), tipo: n.res ? "reservatorio" : n.ap ? "ponto" : "juncao" };
    if (n.ap) { d.aparelho = n.ap.chave; d.quantidade = n.ap.quantidade ?? 1; mapaNos[id] = n.ap.id; }
    if (n.res) mapaNos[id] = n.res.id;
    redeNos.push(d);
    return id;
  };
  addNo(raiz);

  // percorre a árvore de articulação em articulação
  const pilha: { no: number; aresta: number; chegada: number[] | null }[] = [];
  const empilharSaidas = (n: number, chegada: number[] | null) => {
    for (const ai of nos[n].arestas) if (ai !== pai.get(n)) pilha.push({ no: n, aresta: ai, chegada });
  };
  empilharSaidas(raiz.i, null);
  let nt = 0;
  const arestaTrecho = new Map<number, string>();
  const nosRede = new Set<number>([raiz.i]);
  while (pilha.length) {
    const { no: ini, aresta: a0, chegada } = pilha.shift()!;
    const conexoes: Record<string, number> = {};
    const soma = (k: string) => (conexoes[k] = (conexoes[k] ?? 0) + 1);
    const segs: SegmentoTrecho[] = [];
    const els = new Set<string>();
    let comp = 0;
    let atual = ini, ai = a0;
    const n0 = nos[ini];
    const prim = outro(arestas[a0], ini);
    const dSaida = dir(n0, nos[prim]);
    if (n0 === raiz) { soma("entrada_normal"); soma("registro_gaveta"); }
    else if (chegada && grau(n0) >= 3) soma(dot(chegada, dSaida) > 0.98 ? "te_passagem_direta" : "te_saida_lateral");
    let dAnterior: number[] | null = null;
    for (;;) {
      const ar = arestas[ai];
      const prox = outro(ar, atual);
      const d = dir(nos[atual], nos[prox]);
      if (dAnterior) {
        const c = dot(dAnterior, d);
        if (c < 0.98) soma(c > 0.6 ? "joelho_45" : "joelho_90");
      }
      comp += ar.comp;
      if (ar.el) {
        els.add(ar.el);
        segs.push({ el: ar.el, pavimentoId: nos[atual].pav, x1: nos[atual].dx, y1: nos[atual].dy, x2: nos[prox].dx, y2: nos[prox].dy, vertical: ar.vertical });
      }
      dAnterior = d;
      atual = prox;
      nosRede.add(atual);
      arestaTrecho.set(ai, `T${nt + 1}`);
      if (nos[atual].reg) soma(MODELOS_REGISTRO[nos[atual].reg!.modelo].perda);
      if (articulacao(nos[atual])) break;
      ai = nos[atual].arestas.find((x) => x !== ai)!;
    }
    const de = addNo(n0), para = addNo(nos[atual]);
    const id = `T${++nt}`;
    const t: any = { id, de, para, comprimento: +comp.toFixed(4), conexoes };
    redeTrechos.push(t);
    trechos.push({ id, de, para, elementos: [...els], segmentos: segs });
    empilharSaidas(atual, dAnterior);
  }

  if (!redeTrechos.length) {
    avisos.push({ mensagem: "Reservatório sem tubos ligados", elementos: [raiz.res!.id] });
    return null;
  }
  const rede = {
    sistema: "agua_fria", nome: raiz.res!.rotulo || "Água fria",
    parametros: { nivel_agua_m: raiz.res!.nivelAgua ?? 0 },
    nos: redeNos, trechos: redeTrechos,
  };
  const idx = new Map<number, number>();
  const gNos: NoGrafo[] = [...nosRede].map((n, k) => {
    idx.set(n, k);
    const o = nos[n];
    return { i: k, x: o.x, y: o.y, z: o.z, dx: o.dx, dy: o.dy, pav: o.pav, ap: o.ap?.id, res: o.res?.id, reg: o.reg?.id, nome: nomes.get(n) };
  });
  const gArestas: ArestaGrafo[] = [...arestaTrecho].map(([ai, t]) => ({
    a: idx.get(arestas[ai].a)!, b: idx.get(arestas[ai].b)!, trecho: t, vertical: arestas[ai].vertical, el: arestas[ai].el }));
  const gPai: Record<number, number> = {};
  for (const [n, ai] of pai) if (idx.has(n)) gPai[idx.get(n)!] = idx.get(outro(arestas[ai], n))!;
  return { id: raiz.res!.id, rede, trechos, nos: mapaNos, grafo: { nos: gNos, arestas: gArestas, pai: gPai } };
}

/** DN imposto pelo projetista: se todos os tubos do trecho têm o mesmo DN fixado, vale para o trecho. */
export function aplicarDnImposto(m: RedeMontada, elementos: Elemento[]) {
  const porId = new Map(elementos.map((e) => [e.id, e]));
  for (const t of m.trechos) {
    const dns = t.elementos.map((id) => porId.get(id)).filter((e): e is ElTubo => e?.tipo === "tubo").map((e) => e.dn ?? null);
    if (dns.length && dns.every((d) => d != null && d === dns[0])) {
      const rt = m.rede.trechos.find((x: any) => x.id === t.id);
      rt.dn = dns[0];
    }
  }
}
