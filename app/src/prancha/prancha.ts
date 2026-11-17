// Prancha em PDF (vetorial): para cada pavimento com água fria, uma folha com
//   planta do pavimento (planta de fundo + tubulação, diâmetros, pontos, registros, colunas, chamadas
//   dos detalhes), isométricos por ambiente, legenda, lista de materiais, notas e selo.
import { jsPDF } from "jspdf";
import type { Desenho } from "../dxf/carregar";
import type { ResultadoCalculo } from "../editor";
import { ehSegmento, MODELOS_CAIXA, MODELOS_REGISTRO, SIGLAS, SIGLAS_ES, aparelho, type Elemento } from "../modelo/elementos";
import { barras, PONTOS_CAT, type LinhaMaterial } from "../modelo/quantitativo";
import type { ArestaGrafo, NoGrafo, RedeMontada } from "../modelo/rede";
import type { Pavimento, Projeto } from "../projeto";

type RGB = [number, number, number];
const OCRE: RGB = [176, 112, 10];
const AZUL: RGB = [0, 84, 214], PRETO: RGB = [20, 20, 20], CINZA: RGB = [150, 150, 150], CINZA2: RGB = [205, 205, 205], ROXO: RGB = [150, 40, 170];
const FOLHAS = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297] } as const;
const ESCALAS_PLANTA = [50, 75, 100, 125, 150, 200, 250, 500];
const ESCALAS_ISO = [25, 50, 75, 100];
const PT = 2.8346; // pt por mm

export interface EntradaPrancha {
  projeto: Projeto;
  desenhos: Map<string, Desenho>;      // planta de fundo por pavimento
  resultado: ResultadoCalculo;
}

interface Detalhe { nome: string; pav: Pavimento; rede: RedeMontada; dn: Map<string, number>; nos: Set<number>; bbox: [number, number, number, number] }

const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function gerarPrancha(e: EntradaPrancha): jsPDF {
  const { projeto } = e;
  const [W, H] = FOLHAS[projeto.config.folha] ?? FOLHAS.A1;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [W, H], compress: true });
  doc.setFont("helvetica", "normal");
  doc.setLineCap("round"); doc.setLineJoin("round");
  const esc = projeto.config.escalaMetro;
  const porEl = new Map(projeto.elementos.map((x) => [x.id, x]));
  const redes = e.resultado.redes.map((r) => ({ montada: r.montada, dn: new Map<string, number>(r.resposta.resultado.trechos.map((t: any) => [t.id, t.dn])) }));
  const pavs = projeto.pavimentos.slice().reverse().filter((p) => projeto.elementos.some((x) => x.pavimentoId === p.id ||
    ((x.tipo === "coluna" || x.tipo === "tubo_queda") && x.topoId === p.id)));
  let numDetalhe = 0;
  const colunas = projeto.elementos.filter((x) => x.tipo === "coluna");
  const temEsquema = colunas.length > 0;
  const total = pavs.length + (temEsquema ? 1 : 0);
  const descidas = nomearDescidas(redes, porEl, projeto.pavimentos);

  pavs.forEach((pav, folha) => {
    if (folha > 0) doc.addPage([W, H], "landscape");
    const x0 = 25, y0 = 10, x1 = W - 10, y1 = H - 10;
    const faixa = W >= 800 ? 180 : W >= 590 ? 150 : 118;
    // moldura
    cor(doc, PRETO); doc.setLineWidth(0.7); doc.rect(x0, y0, x1 - x0, y1 - y0);
    doc.setLineWidth(0.35); doc.line(x1 - faixa, y0, x1 - faixa, y1);

    // ----- detalhes (ambientes) deste pavimento
    const detalhes: Detalhe[] = [];
    // barrilete: reservatório deste pavimento e a tubulação que sai dele no mesmo pavimento
    for (const r of redes) {
      const g = r.montada.grafo;
      const res = g.nos.find((n) => n.res && n.pav === pav.id);
      if (!res) continue;
      const filhos = new Map<number, number[]>();
      for (const [c, pa] of Object.entries(g.pai)) (filhos.get(pa) ?? filhos.set(pa, []).get(pa)!).push(Number(c));
      const nos = new Set<number>([res.i]);
      const fila = [res.i];
      while (fila.length) for (const f of filhos.get(fila.pop()!) ?? []) if (g.nos[f].pav === pav.id && !g.nos[f].ap) { nos.add(f); fila.push(f); }
      if (nos.size < 2) continue;
      const ns = [...nos].map((i) => g.nos[i]);
      const xs = ns.map((n) => n.dx), ys = ns.map((n) => n.dy), m = 1.0 / esc;
      detalhes.push({ nome: `HID-${++numDetalhe}`, pav, rede: r.montada, dn: r.dn, nos,
                      bbox: [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m] });
    }
    for (const r of redes) for (const grupo of agruparPontos(r.montada, pav.id)) {
      const nos = subarvore(r.montada, grupo);
      const ns = [...nos].map((i) => r.montada.grafo.nos[i]);
      const xs = ns.map((n) => n.dx), ys = ns.map((n) => n.dy), m = 0.5 / esc;
      detalhes.push({ nome: `HID-${++numDetalhe}`, pav, rede: r.montada, dn: r.dn, nos,
                      bbox: [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m] });
    }

    // ----- área principal: planta à esquerda, isométricos à direita
    const ax0 = x0 + 6, ay0 = y0 + 6, ax1 = x1 - faixa - 6, ay1 = y1 - 6;
    const larguraPlanta = detalhes.length ? (ax1 - ax0) * 0.5 : ax1 - ax0;
    desenharPlanta(doc, e, pav, detalhes, porEl, redes, descidas, [ax0, ay0, ax0 + larguraPlanta, ay1]);
    if (detalhes.length) {
      doc.setDrawColor(...CINZA2); doc.setLineWidth(0.2);
      doc.line(ax0 + larguraPlanta + 3, ay0, ax0 + larguraPlanta + 3, ay1);
      desenharIsometricos(doc, e, detalhes, porEl, descidas, [ax0 + larguraPlanta + 8, ay0, ax1, ay1]);
    }

    // ----- faixa direita: legenda, lista de materiais, notas, selo
    const fx0 = x1 - faixa, fx1 = x1;
    const alturaSelo = 92;
    const yNotas = y1 - alturaSelo - 38;
    let y = y0 + 4;
    y = desenharLegenda(doc, fx0 + 4, y, fx1 - fx0 - 8);
    desenharLista(doc, e.resultado.materiais.filter((l) => l.pavimentoId === pav.id), fx0 + 4, y + 4, fx1 - fx0 - 8, yNotas - 4,
                  `Lista de materiais — ${pav.nome} (${projeto.config.fabricante})`);
    desenharNotas(doc, projeto, fx0, yNotas, fx1, y1 - alturaSelo);
    desenharSelo(doc, projeto, pav, fx0, y1 - alturaSelo, fx1, y1, folha + 1, total);
  });

  if (temEsquema) {
    doc.addPage([W, H], "landscape");
    const x0 = 25, y0 = 10, x1 = W - 10, y1 = H - 10;
    const faixa = W >= 800 ? 180 : W >= 590 ? 150 : 118;
    cor(doc, PRETO); doc.setLineWidth(0.7); doc.rect(x0, y0, x1 - x0, y1 - y0);
    doc.setLineWidth(0.35); doc.line(x1 - faixa, y0, x1 - faixa, y1);
    desenharEsquemaVertical(doc, e, redes, porEl, [x0 + 6, y0 + 6, x1 - faixa - 6, y1 - 6]);
    const fx0 = x1 - faixa, alturaSelo = 92;
    let y = desenharLegenda(doc, fx0 + 4, y0 + 4, faixa - 8);
    desenharNotas(doc, projeto, fx0, y1 - alturaSelo - 38, x1, y1 - alturaSelo);
    desenharSelo(doc, projeto, { id: "", nome: "Esquema vertical", cota: 0, peDireito: 0, fundo: null, vista: null }, fx0, y1 - alturaSelo, x1, y1,
                 total, total, "Esquema vertical das colunas de água fria");
    void y;
  }
  return doc;
}

// ============================================================ agrupamento em ambientes
/** Pontos de utilização do pavimento agrupados por proximidade (até 3 m entre vizinhos). */
function agruparPontos(m: RedeMontada, pav: string): number[][] {
  const pts = m.grafo.nos.filter((n) => n.ap && n.pav === pav);
  const grupo = new Map<number, number>();
  let g = 0;
  for (const p of pts) {
    if (grupo.has(p.i)) continue;
    const fila = [p];
    grupo.set(p.i, g);
    while (fila.length) {
      const a = fila.pop()!;
      for (const b of pts) if (!grupo.has(b.i) && Math.hypot(a.x - b.x, a.y - b.y) < 3.0) { grupo.set(b.i, g); fila.push(b); }
    }
    g++;
  }
  const out: number[][] = Array.from({ length: g }, () => []);
  for (const [i, k] of grupo) out[k].push(i);
  return out;
}

/** Nós entre os pontos do grupo e o ponto onde o ramal deles se origina (+ um trecho a montante). */
function subarvore(m: RedeMontada, pontos: number[]): Set<number> {
  const pai = m.grafo.pai;
  const caminho = (n: number) => { const c = [n]; while (pai[c[c.length - 1]] !== undefined) c.push(pai[c[c.length - 1]]); return c; };
  const caminhos = pontos.map(caminho);
  const comuns = caminhos.reduce((acc, c) => acc.filter((x) => c.includes(x)), caminhos[0]);
  const lca = comuns[0];
  const nos = new Set<number>();
  for (const c of caminhos) for (const n of c) { nos.add(n); if (n === lca) break; }
  // contexto: sobe pelo ramal até a coluna (sai do pavimento) ou até ~4 m de tubo horizontal
  let n = lca, horiz = 0;
  while (pai[n] !== undefined) {
    const p = m.grafo.nos[pai[n]], a = m.grafo.nos[n];
    if (p.pav !== a.pav || p.res) break;
    horiz += Math.hypot(p.x - a.x, p.y - a.y);
    if (horiz > 4.0) break;
    n = pai[n]; nos.add(n);
  }
  return nos;
}

// ============================================================ planta
function desenharPlanta(doc: jsPDF, e: EntradaPrancha, pav: Pavimento, detalhes: Detalhe[], porEl: Map<string, Elemento>,
                        redes: { montada: RedeMontada; dn: Map<string, number> }[], descidas: Descida[], area: [number, number, number, number]) {
  const { projeto } = e;
  const esc = projeto.config.escalaMetro;
  const els = projeto.elementos.filter((x) => x.pavimentoId === pav.id || ((x.tipo === "coluna" || x.tipo === "tubo_queda") && x.topoId === pav.id));
  const xs: number[] = [], ys: number[] = [];
  for (const x of els) { if (ehSegmento(x)) { xs.push(x.x1, x.x2); ys.push(x.y1, x.y2); } else { xs.push(x.x); ys.push(x.y); } }
  const m = 2.5 / esc;
  const bb = [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
  const [ax0, ay0, ax1, ay1] = area;
  const larg = ax1 - ax0, alt = ay1 - ay0 - 14;
  const den = ESCALAS_PLANTA.find((d) => ((bb[2] - bb[0]) * esc * 1000) / d <= larg && ((bb[3] - bb[1]) * esc * 1000) / d <= alt) ?? 500;
  const k = (esc * 1000) / den;                      // mm de papel por unidade do desenho
  const wv = (bb[2] - bb[0]) * k, hv = (bb[3] - bb[1]) * k;
  const ox = ax0 + (larg - wv) / 2, oy = ay0 + Math.min(8, (alt - hv) / 2);
  const P = (x: number, y: number): [number, number] => [ox + (x - bb[0]) * k, oy + (bb[3] - y) * k];

  // planta de fundo recortada
  const d = e.desenhos.get(pav.id);
  doc.saveGraphicsState();
  doc.rect(ox, oy, wv, hv, null); doc.clip(); doc.discardPath();
  if (d) {
    const ocultas = new Set(pav.fundo?.camadasOcultas ?? []);
    doc.setLineWidth(0.13); cor(doc, CINZA);
    for (const c of d.camadas.values()) {
      if (ocultas.has(c.nome)) continue;
      const s = c.segmentos;
      for (let i = 0; i < s.length; i += 4) {
        const xa = s[i], ya = s[i + 1], xb = s[i + 2], yb = s[i + 3];
        if (Math.max(xa, xb) < bb[0] || Math.min(xa, xb) > bb[2] || Math.max(ya, yb) < bb[1] || Math.min(ya, yb) > bb[3]) continue;
        const a = P(xa, ya), b = P(xb, yb);
        doc.line(a[0], a[1], b[0], b[1]);
      }
      doc.setTextColor(...CINZA);
      for (const t of c.textos) {
        const h = t.altura * k;
        if (h < 1.0 || h > 6 || t.x < bb[0] || t.x > bb[2] || t.y < bb[1] || t.y > bb[3]) continue;
        const p = P(t.x, t.y);
        doc.setFontSize(h * PT);
        doc.text(t.texto, p[0], p[1], { angle: (t.rotacao * 180) / Math.PI });
      }
    }
  }
  doc.restoreGraphicsState();

  ocupados = [];
  // tubulação
  const dnDoEl = new Map<string, number>();
  for (const r of redes) for (const t of r.montada.trechos) for (const id of t.elementos) dnDoEl.set(id, Math.max(dnDoEl.get(id) ?? 0, r.dn.get(t.id) ?? 0));
  for (const r of e.resultado.esgoto ?? []) for (const t of r.montada.trechos) {
    const d = r.resposta.resultado.trechos.find((x: any) => x.id === t.id)?.dn ?? 0;
    for (const id of t.elementos) dnDoEl.set(id, Math.max(dnDoEl.get(id) ?? 0, d));
  }
  // tubos em faixa: contorno preto e preenchimento claro (largura pelo DN, exagerada 2x)
  const segs = els.filter(ehSegmento);
  const largTubo = (x: Elemento) => Math.max(0.7, Math.min(x.tipo === "tubo" ? 1.6 : 1.9, ((dnDoEl.get(x.id) || (x.tipo === "tubo" ? 25 : 100)) * (x.tipo === "tubo" ? 2 : 1) / 1000) * (k / esc)));
  doc.setLineCap("round"); doc.setLineJoin("round");
  for (const passo of [0, 1]) for (const x of segs) {
    const a = P(x.x1, x.y1), b = P(x.x2, x.y2);
    if (passo === 0) doc.setDrawColor(0, 0, 0);
    else if (x.tipo === "tubo") doc.setDrawColor(150, 200, 250); else doc.setDrawColor(244, 214, 160);
    doc.setLineWidth(largTubo(x) + (passo === 0 ? 0.36 : 0));
    doc.line(a[0], a[1], b[0], b[1]);
  }
  for (const x of segs) if (x.tipo === "tubo_esgoto") {   // seta do escoamento
    const a = P(x.x1, x.y1), b = P(x.x2, x.y2);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L <= 8) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, h = largTubo(x) * 0.42;
    doc.setFillColor(120, 76, 8);
    doc.triangle(mx + ux * h * 1.6, my + uy * h * 1.6, mx - ux * h - uy * h, my - uy * h + ux * h, mx - ux * h + uy * h, my - uy * h - ux * h, "F");
  }
  doc.setFontSize(1.8 * PT); doc.setTextColor(...OCRE);
  for (const r of e.resultado.esgoto ?? []) {
    const alertas: string[] = r.resposta.resultado.alertas;
    for (const t of r.resposta.resultado.trechos) {
      const m = r.montada.trechos.find((x) => x.id === t.id);
      let melhor: { a: [number, number]; b: [number, number]; L: number } | null = null;
      for (const sg of m?.segmentos ?? []) {
        if (sg.vertical || sg.pavimentoId !== pav.id) continue;
        const a = P(sg.x1, sg.y1), b = P(sg.x2, sg.y2), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!melhor || L > melhor.L) melhor = { a, b, L };
      }
      if (!melhor || melhor.L < 8) continue;
      doc.setTextColor(...(alertas.some((a) => a.startsWith(`ERRO trecho ${t.id}:`)) ? ([220, 30, 30] as RGB) : OCRE));
      textoAoLongo(doc, `ø${t.dn}${t.declividade != null ? " i=" + fmt(t.declividade * 100, 1) + "%" : ""}`, melhor.a, melhor.b, -2.6);
    }
  }
  // diâmetros por trecho (no maior segmento do trecho neste pavimento)
  doc.setFontSize(1.7 * PT); doc.setTextColor(...AZUL);
  for (const r of redes) for (const t of r.montada.trechos) {
    let melhor: { a: [number, number]; b: [number, number]; L: number } | null = null;
    for (const s of t.segmentos) {
      if (s.vertical || s.pavimentoId !== pav.id) continue;
      const a = P(s.x1, s.y1), b = P(s.x2, s.y2), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!melhor || L > melhor.L) melhor = { a, b, L };
    }
    if (!melhor || melhor.L < 6) continue;
    const Lh = t.segmentos.filter((s) => !s.vertical && s.pavimentoId === pav.id).reduce((acc, s) => acc + Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 0) * esc;
    doc.setTextColor(...PRETO);
    textoAoLongo(doc, `PVC ø${r.dn.get(t.id)}`, melhor.a, melhor.b, 1.3);
    if (melhor.L > 10) textoAoLongo(doc, `L=${fmt(Lh, 1).replace(",", ".")}`, melhor.a, melhor.b, -2.6);
  }
  // balões das descidas (água fria embutida descendo do forro)
  for (const ds of descidas) {
    if (ds.pav !== pav.id) continue;
    const el = [...porEl.values()].find((x) => x.tipo === "coluna" && x.rotulo === ds.nome && x.x === ds.x && x.y === ds.y);
    if (el) continue;                                  // coluna já tem balão próprio
    const [px, py] = P(ds.x, ds.y);
    doc.setDrawColor(...PRETO); doc.setLineWidth(0.12); doc.line(px, py, px + 3.2, py - 3.2);
    balao(doc, px + 5.6, py - 5.6, ds.nome, `ø${ds.dn}`, 3.2);
  }
  // símbolos
  for (const x of els) {
    if (ehSegmento(x)) continue;
    const [px, py] = P(x.x, x.y);
    if (x.tipo === "aparelho") {
      doc.setDrawColor(...AZUL); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.3);
      doc.circle(px, py, 1.1, "FD"); doc.setFillColor(...AZUL); doc.circle(px, py, 0.45, "F");
      doc.setFontSize(1.8 * PT); doc.setTextColor(...PRETO);
      const t = `${SIGLAS[x.chave] ?? ""}${x.quantidade > 1 ? " x" + x.quantidade : ""}`, tw = doc.getTextWidth(t), th = 1.9;
      const opc: [number, number][] = [[px + 1.6, py + 3.6], [px + 1.6, py - 1.8], [px - 1.6 - tw, py + 3.6], [px - 1.6 - tw, py - 1.8], [px + 1.6, py + 6.2]];
      const livre = (q: [number, number]) => ocupados.every((o) => q[0] + tw < o[0] || q[0] > o[2] || q[1] < o[1] || q[1] - th > o[3]);
      const pos = opc.find(livre) ?? opc[0];
      doc.text(t, pos[0], pos[1]); ocupados.push([pos[0], pos[1] - th, pos[0] + tw, pos[1]]);
    } else if (x.tipo === "registro") {
      const t = els.find((u) => u.tipo === "tubo" && naReta(u, x.x, x.y, 0.02 / esc));
      const ang = t && t.tipo === "tubo" ? Math.atan2(-(t.y2 - t.y1), t.x2 - t.x1) : 0;
      gravata(doc, px, py, ang, 1.3);
      doc.setFontSize(1.6 * PT); doc.setTextColor(...PRETO);
      doc.text(MODELOS_REGISTRO[x.modelo].sigla, px + 1.6, py - 1.6);
    } else if (x.tipo === "reservatorio") {
      doc.setDrawColor(...AZUL); doc.setLineWidth(0.4); doc.rect(px - 3, py - 3, 6, 6);
      doc.line(px - 3, py, px + 3, py);
      doc.setFontSize(2 * PT); doc.setTextColor(...PRETO); doc.text(x.rotulo || "RES", px + 4, py - 3.5);
    } else if (x.tipo === "coluna") {
      const dnc = dnDoEl.get(x.id);
      balao(doc, px, py, x.rotulo || "AF", dnc ? `ø${dnc}` : "");
    } else if (x.tipo === "ponto_esgoto") {
      doc.setDrawColor(...OCRE); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.3);
      doc.rect(px - 1, py - 1, 2, 2, "FD");
      doc.setFontSize(1.8 * PT); doc.setTextColor(...OCRE);
      doc.text(SIGLAS_ES[x.chave] ?? "", px + 1.6, py - 1.4);
    } else if (x.tipo === "caixa_esgoto") {
      doc.setDrawColor(...OCRE); doc.setFillColor(255, 245, 225); doc.setLineWidth(0.35);
      const k = x.modelo === "inspecao" || x.modelo === "gordura" ? 3 : 1.8;
      if (x.modelo === "ralo") doc.circle(px, py, 1.4, "FD"); else doc.rect(px - k, py - k, 2 * k, 2 * k, "FD");
      if (x.modelo === "sifonada") doc.circle(px, py, 1, "S");
      doc.setFontSize(1.8 * PT); doc.setTextColor(...OCRE);
      doc.text(x.rotulo || MODELOS_CAIXA[x.modelo].sigla, px + k + 0.8, py - k);
    } else if (x.tipo === "tubo_queda") {
      doc.setDrawColor(...OCRE); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.4);
      doc.circle(px, py, 2.4, "FD");
      doc.setFontSize(1.7 * PT); doc.setTextColor(...OCRE);
      doc.text(x.rotulo || "TQ", px, py + 0.7, { align: "center" });
    } else if (x.tipo === "saida_esgoto") {
      doc.setFillColor(...OCRE);
      doc.triangle(px - 2, py - 2, px + 2.5, py, px - 2, py + 2, "F");
      doc.setFontSize(1.8 * PT); doc.setTextColor(...OCRE); doc.text(x.rotulo || "Saída", px + 3.5, py + 0.7);
    }
  }
  // chamadas dos detalhes
  doc.setDrawColor(...ROXO); doc.setLineWidth(0.3); doc.setLineDashPattern([1.6, 0.8], 0);
  for (const dt of detalhes) {
    const a = P(dt.bbox[0], dt.bbox[3]), b = P(dt.bbox[2], dt.bbox[1]);
    doc.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
  }
  doc.setLineDashPattern([], 0);
  doc.setFontSize(2 * PT); doc.setTextColor(...ROXO);
  for (const dt of detalhes) { const a = P(dt.bbox[0], dt.bbox[3]); doc.text(dt.nome, a[0], a[1] - 1); }

  // título
  const temEs = els.some((x) => x.tipo === "tubo_esgoto");
  const temAf = els.some((x) => x.tipo === "tubo");
  tituloVista(doc, `Planta — ${pav.nome} — ${temAf && temEs ? "Água fria e esgoto" : temEs ? "Esgoto" : "Água fria"}`, `Escala 1:${den}`, ox, Math.min(ay1 - 4, oy + hv + 10));
}

// ============================================================ isométricos
const VERDE: RGB = [0, 150, 75], VERMELHO: RGB = [215, 30, 30];
const MARROM: RGB = [163, 96, 58], MARROM_CLARO: RGB = [224, 168, 128], MARROM_ESC: RGB = [96, 52, 28];

/** Nome curto do ponto para a legenda das indicações. */
const NOMES_PONTO: Record<string, string> = {
  bacia_caixa_descarga: "Vaso sanitário com caixa acoplada", bacia_valvula_descarga: "Válvula de descarga",
  banheira: "Banheira", bebedouro: "Bebedouro", bide: "Bidê", chuveiro: "Chuveiro", chuveiro_eletrico: "Chuveiro elétrico",
  lavadora: "Máquina de lavar roupa", lavatorio: "Lavatório", mictorio_valvula: "Mictório", mictorio_caixa: "Mictório",
  mictorio_calha: "Mictório de calha", pia: "Pia", pia_torneira_eletrica: "Pia com torneira elétrica", tanque: "Tanque",
  torneira_jardim: "Torneira de jardim",
};
const ROSCA_DN: Record<number, string> = { 20: '1/2"', 25: '3/4"', 32: '1"', 40: '1.1/4"', 50: '1.1/2"', 60: '2"', 75: '2.1/2"', 85: '3"' };

/** Contorno da louça no piso (m), no referencial local: u ao longo da parede, n para dentro do ambiente. */
function formaLouca(chave: string): { tipo: "oval" | "retangulo" | "box" | "meia"; u: number; n: number } | null {
  if (chave.startsWith("bacia") || chave === "bide") return { tipo: "oval", u: 0.38, n: 0.62 };
  if (chave === "lavatorio") return { tipo: "meia", u: 0.5, n: 0.42 };
  if (chave.startsWith("chuveiro")) return { tipo: "box", u: 0.85, n: 0.85 };
  if (chave.startsWith("pia") || chave === "tanque") return { tipo: "retangulo", u: 0.6, n: 0.5 };
  if (chave === "lavadora") return { tipo: "retangulo", u: 0.6, n: 0.6 };
  if (chave === "banheira") return { tipo: "retangulo", u: 1.6, n: 0.75 };
  if (chave.startsWith("mictorio") || chave === "bebedouro") return { tipo: "meia", u: 0.4, n: 0.35 };
  return null;
}

/** Descidas e colunas de cada rede: cadeias de arestas verticais, com o nome do balão (AF-n). */
export interface Descida { rede: string; nos: number[]; topo: number; base: number; nome: string; dn: number; x: number; y: number; pav: string }
function nomearDescidas(redes: { montada: RedeMontada; dn: Map<string, number> }[], porEl: Map<string, Elemento>, pavs: Pavimento[]): Descida[] {
  const out: Descida[] = [];
  const pavimentoDe = new Map(pavs.map((p) => [p.id, p.cota]));
  const usados = new Set<number>();
  for (const el of porEl.values()) if (el.tipo === "coluna") { const m = /(\d+)\s*$/.exec(el.rotulo ?? ""); if (m) usados.add(Number(m[1])); }
  let k = 0;
  const proximo = () => { do k++; while (usados.has(k)); usados.add(k); return `AF-${k}`; };
  for (const r of redes) {
    const g = r.montada.grafo;
    const viz = new Map<number, ArestaGrafo[]>();
    for (const a of g.arestas) if (a.vertical) { (viz.get(a.a) ?? viz.set(a.a, []).get(a.a)!).push(a); (viz.get(a.b) ?? viz.set(a.b, []).get(a.b)!).push(a); }
    const visto = new Set<number>();
    for (const ini of viz.keys()) {
      if (visto.has(ini)) continue;
      const nos: number[] = [], ars: ArestaGrafo[] = [];
      const fila = [ini]; visto.add(ini);
      while (fila.length) {
        const v = fila.pop()!; nos.push(v);
        for (const a of viz.get(v) ?? []) { if (!ars.includes(a)) ars.push(a); const o = a.a === v ? a.b : a.a; if (!visto.has(o)) { visto.add(o); fila.push(o); } }
      }
      const topo = nos.reduce((a, b) => (g.nos[a].z >= g.nos[b].z ? a : b)), base = nos.reduce((a, b) => (g.nos[a].z <= g.nos[b].z ? a : b));
      const col = ars.map((a) => (a.el ? porEl.get(a.el) : undefined)).find((e) => e?.tipo === "coluna");
      const dn = Math.max(...ars.map((a) => r.dn.get(a.trecho) ?? 0));
      if (!col) {   // descida: desce do forro (topo alto, sem ponto no topo) e tem altura relevante
        const tn = g.nos[topo], bn = g.nos[base];
        const cota = (pavimentoDe.get(tn.pav) ?? 0);
        if (tn.ap || tn.z - cota < 1.9 || tn.z - bn.z < 0.5) continue;
      }
      out.push({ rede: r.montada.id, nos, topo, base, nome: col?.rotulo || "", dn, x: g.nos[topo].dx, y: g.nos[topo].dy, pav: g.nos[base].pav });
    }
  }
  // descidas (sem rótulo de coluna) numeradas na ordem de leitura da planta
  out.filter((d) => !d.nome).sort((a, b) => a.pav.localeCompare(b.pav) || b.y - a.y || a.x - b.x).forEach((d) => (d.nome = proximo()));
  return out;
}

function desenharIsometricos(doc: jsPDF, e: EntradaPrancha, detalhes: Detalhe[], porEl: Map<string, Elemento>,
                             descidas: Descida[], area: [number, number, number, number]) {
  const [ax0, ay0, ax1, ay1] = area;
  const n = detalhes.length;
  const larg = ax1 - ax0, alt = ay1 - ay0;
  let cols = 1;
  while (cols < n && Math.ceil(n / cols) * (larg / cols) * 0.8 > alt) cols++;
  const linhas = Math.ceil(n / cols);
  const cw = larg / cols, ch = alt / linhas;
  const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
  const esc = e.projeto.config.escalaMetro;
  detalhes.forEach((dt, i) => {
    ocupados = [];
    const cx0 = ax0 + (i % cols) * cw, cy0 = ay0 + Math.floor(i / cols) * ch;
    const g = dt.rede.grafo;
    const nos = [...dt.nos].map((k) => g.nos[k]);
    const arestas = g.arestas.filter((a) => dt.nos.has(a.a) && dt.nos.has(a.b));
    const zp = dt.pav.cota;
    const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * c30, (x + y) * s30 + (z - zp)];
    const dnDe = (a: ArestaGrafo) => dt.dn.get(a.trecho) ?? 25;

    // colunas que chegam de fora do detalhe (vêm do forro / pavimento de cima): toco de 0,4 m para cima
    const tocos: { no: NoGrafo; dn: number; nome: string; s: number }[] = [];
    for (const a of g.arestas) {
      if (!a.vertical || dt.nos.has(a.a) === dt.nos.has(a.b)) continue;
      const dentro = dt.nos.has(a.a) ? g.nos[a.a] : g.nos[a.b], fora = dt.nos.has(a.a) ? g.nos[a.b] : g.nos[a.a];
      const d = descidas.find((x) => x.rede === dt.rede.id && x.nos.includes(dentro.i));
      tocos.push({ no: dentro, dn: dt.dn.get(a.trecho) ?? 25, nome: d?.nome ?? "AF", s: fora.z > dentro.z ? 1 : -1 });
    }
    const zToco = (t: { no: NoGrafo; s: number }) => t.no.z + t.s * 0.6;
    // reservatório (barrilete): cilindro ao lado da saída, oposto ao primeiro tubo
    const resNo = nos.find((p) => p.res);
    let cil: { cx: number; cy: number; r: number; z0: number; z1: number } | null = null;
    if (resNo) {
      const ar = arestas.find((a) => !a.vertical && (a.a === resNo.i || a.b === resNo.i)) ?? arestas.find((a) => a.a === resNo.i || a.b === resNo.i);
      const o = ar ? g.nos[ar.a === resNo.i ? ar.b : ar.a] : null;
      let dx = o ? o.x - resNo.x : 1, dy = o ? o.y - resNo.y : 0; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const r = 0.72;
      cil = { cx: resNo.x - dx * r, cy: resNo.y - dy * r, r, z0: zp, z1: Math.max(zp + 0.9, resNo.z + 0.5) };
    }

    // louças: posição no piso, orientadas para dentro do ambiente (lado oposto à parede do ramal)
    const louças: { no: NoGrafo; chave: string; poly: [number, number][]; eixo: [number, number]; u: [number, number]; nrm: [number, number] }[] = [];
    for (const p of nos) {
      const el = p.ap ? porEl.get(p.ap) : null;
      if (el?.tipo !== "aparelho") continue;
      const f = formaLouca(el.chave);
      if (!f) continue;
      // direção da parede: aresta horizontal mais próxima ligada ao ponto (subindo pelo grafo)
      let v: number | undefined = p.i, dir: [number, number] = [1, 0];
      for (let k = 0; k < 6 && v !== undefined; k++) {
        const ar = arestas.find((a) => !a.vertical && (a.a === v || a.b === v));
        if (ar) { const A = g.nos[ar.a], B = g.nos[ar.b]; const L = Math.hypot(B.x - A.x, B.y - A.y) || 1; dir = [(B.x - A.x) / L, (B.y - A.y) / L]; break; }
        v = g.pai[v];
      }
      if (Math.abs(dir[0]) >= Math.abs(dir[1])) dir = [Math.sign(dir[0]) || 1, 0]; else dir = [0, Math.sign(dir[1]) || 1];
      const nrm: [number, number] = dir[0] !== 0 ? [0, -1] : [1, 0];   // para a frente do isométrico
      const meio = f.tipo === "box" ? 0 : 0.02;
      const P = (uu: number, nn: number): [number, number] => [p.x + dir[0] * uu + nrm[0] * (nn + meio), p.y + dir[1] * uu + nrm[1] * (nn + meio)];
      let poly: [number, number][] = [];
      if (f.tipo === "oval" || f.tipo === "meia") {
        const N = 18;
        for (let k = 0; k <= N; k++) {
          const t = (f.tipo === "meia" ? Math.PI : 2 * Math.PI) * k / N;
          poly.push(f.tipo === "meia" ? P(-Math.cos(t) * f.u / 2, Math.sin(t) * f.n) : P(Math.sin(t) * f.u / 2, f.n / 2 - Math.cos(t) * f.n / 2));
        }
        if (f.tipo === "meia") poly.push(P(-f.u / 2, 0));
      } else {
        const u0 = f.tipo === "box" ? 0 : -f.u / 2, u1 = f.tipo === "box" ? f.u : f.u / 2;
        poly = [P(u0, 0), P(u1, 0), P(u1, f.n), P(u0, f.n), P(u0, 0)];
      }
      louças.push({ no: p, chave: el.chave, poly, eixo: [p.x, p.y], u: dir, nrm });
    }

    // piso: retângulo envolvente da tubulação e das louças
    const xsP = [...nos.map((p) => p.x), ...louças.flatMap((l) => l.poly.map((q) => q[0])), ...(cil ? [cil.cx - cil.r, cil.cx + cil.r] : [])];
    const ysP = [...nos.map((p) => p.y), ...louças.flatMap((l) => l.poly.map((q) => q[1])), ...(cil ? [cil.cy - cil.r, cil.cy + cil.r] : [])];
    const piso = [Math.min(...xsP) - 0.25, Math.min(...ysP) - 0.25, Math.max(...xsP) + 0.25, Math.max(...ysP) + 0.25];

    // planta de fundo (paredes) dentro do piso
    const fundo: [number, number, number, number][] = [];
    const d = e.desenhos.get(dt.pav.id);
    if (d) {
      const ocultas = new Set(dt.pav.fundo?.camadasOcultas ?? []);
      const [bx0, by0, bx1, by1] = piso.map((v) => v / esc);
      for (const c of d.camadas.values()) {
        if (ocultas.has(c.nome)) continue;
        const s = c.segmentos;
        for (let j = 0; j < s.length && fundo.length < 6000; j += 4) {
          const xa = s[j], ya = s[j + 1], xb = s[j + 2], yb = s[j + 3];
          if (xa < bx0 || xa > bx1 || xb < bx0 || xb > bx1 || ya < by0 || ya > by1 || yb < by0 || yb > by1) continue;
          fundo.push([xa * esc, ya * esc, xb * esc, yb * esc]);
        }
      }
    }
    // níveis para a cadeia de cotas verticais (piso, pontos, registros, topo)
    const zTopo = Math.max(...nos.map((p) => p.z), ...tocos.map((t) => t.no.z), cil ? cil.z1 : -1e9);
    const niveis = [zp, ...nos.filter((p) => p.ap || p.reg).map((p) => p.z), zTopo].sort((a, b) => a - b)
      .filter((z, k, arr) => k === 0 || z - arr[k - 1] > 0.02);
    // cadeia de cotas à esquerda, no alinhamento da parede dos pontos (linhas de chamada paralelas ao eixo x)
    const ysPts = nos.filter((p) => p.ap || p.reg).map((p) => p.y).sort((a, b) => a - b);
    const cotaX = piso[0] - 0.25, cotaY = ysPts.length ? ysPts[Math.floor(ysPts.length / 2)] : piso[3];

    // enquadramento
    const pts: [number, number][] = [];
    for (const p of nos) pts.push(iso(p.x, p.y, p.z));
    for (const t of tocos) pts.push(iso(t.no.x, t.no.y, zToco(t) + t.s * 0.4));
    if (cil) for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; pts.push(iso(cil.cx + cil.r * Math.cos(a), cil.cy + cil.r * Math.sin(a), cil.z1)); }
    for (const [x, y] of [[piso[0], piso[1]], [piso[2], piso[1]], [piso[2], piso[3]], [piso[0], piso[3]]]) pts.push(iso(x, y, zp));
    pts.push(iso(cotaX - 0.3, cotaY, zp), iso(cotaX, cotaY, zTopo));
    const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]);
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    const legW = Math.min(90, cw * 0.6);
    const nLeg = new Set(nos.filter((p) => p.ap || p.reg).map((p) => (p.ap ? porEl.get(p.ap) : porEl.get(p.reg!)) as any).map((x) => x?.chave ?? x?.modelo)).size;
    const topo = 8 + (nLeg + 1) * 3.4;
    const den = ESCALAS_ISO.find((dd) => ((u1 - u0) * 1000) / dd <= cw - 22 && ((v1 - v0) * 1000) / dd <= ch - 26 - topo) ?? 100;
    const k = 1000 / den;
    const ox = cx0 + 12 + (cw - 22 - (u1 - u0) * k) / 2, oy = cy0 + topo + 8;
    const yTitulo = Math.min(cy0 + ch - 6, oy + (v1 - v0) * k + 12);
    const xLeg = Math.min(cx0 + cw - legW - 2, ox + (u1 - u0) * k - legW);
    const Q = (x: number, y: number, z: number): [number, number] => { const [u, v] = iso(x, y, z); return [ox + (u - u0) * k, oy + (v1 - v) * k]; };
    const linha = (a: [number, number], b: [number, number]) => doc.line(a[0], a[1], b[0], b[1]);

    // ---- piso, paredes de fundo e louças
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.15); doc.setLineDashPattern([0.8, 0.6], 0);
    const c4 = [Q(piso[0], piso[1], zp), Q(piso[2], piso[1], zp), Q(piso[2], piso[3], zp), Q(piso[0], piso[3], zp)];
    for (let j = 0; j < 4; j++) linha(c4[j], c4[(j + 1) % 4]);
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(...CINZA); doc.setLineWidth(0.13);
    for (const f of fundo) linha(Q(f[0], f[1], zp), Q(f[2], f[3], zp));
    doc.setDrawColor(110, 110, 110); doc.setLineWidth(0.18);
    for (const l of louças) {
      if (l.chave.startsWith("chuveiro")) doc.setLineDashPattern([0.8, 0.6], 0);
      for (let j = 1; j < l.poly.length; j++) linha(Q(l.poly[j - 1][0], l.poly[j - 1][1], zp), Q(l.poly[j][0], l.poly[j][1], zp));
      doc.setLineDashPattern([], 0);
      if (l.chave.startsWith("chuveiro")) {   // ralo do box
        const c = [l.eixo[0] + l.u[0] * 0.425 + l.nrm[0] * 0.425, l.eixo[1] + l.u[1] * 0.425 + l.nrm[1] * 0.425];
        const A = Q(c[0] - 0.06, c[1] - 0.06, zp), B = Q(c[0] + 0.06, c[1] - 0.06, zp), C = Q(c[0] + 0.06, c[1] + 0.06, zp), D = Q(c[0] - 0.06, c[1] + 0.06, zp);
        linha(A, B); linha(B, C); linha(C, D); linha(D, A);
      }
    }

    // ---- cotas no piso: eixos das louças ao longo da parede (cm)
    doc.setLineWidth(0.12); cor(doc, VERMELHO); doc.setFontSize(1.7 * PT);
    for (const eixoX of [true, false]) {
      const ls = louças.filter((l) => (l.u[0] !== 0) === eixoX);
      if (!ls.length) continue;
      const pos = [...new Set([eixoX ? piso[0] + 0.25 : piso[3] - 0.25, ...ls.map((l) => (eixoX ? l.eixo[0] : l.eixo[1]))].map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
      const nrm = ls[0].nrm;
      const prof = Math.max(...ls.map((l) => Math.max(...l.poly.map((q) => (q[0] - l.eixo[0]) * nrm[0] + (q[1] - l.eixo[1]) * nrm[1]))));
      const base = ls[0].eixo;
      const linhaCota = (s: number): [number, number] => eixoX ? [s, base[1] + nrm[1] * (prof + 0.12)] : [base[0] + nrm[0] * (prof + 0.12), s];
      for (let j = 0; j < pos.length; j++) {
        const A = linhaCota(pos[j]);
        const raiz: [number, number] = eixoX ? [pos[j], base[1]] : [base[0], pos[j]];
        linha(Q(raiz[0], raiz[1], zp), Q(A[0] + nrm[0] * 0.05, A[1] + nrm[1] * 0.05, zp));
        if (j > 0) {
          const B = linhaCota(pos[j - 1]);
          const qa = Q(A[0], A[1], zp), qb = Q(B[0], B[1], zp);
          linha(qa, qb);
          for (const q of [qa, qb]) { doc.line(q[0] - 0.6, q[1] + 0.6, q[0] + 0.6, q[1] - 0.6); }
          textoAoLongo(doc, fmt((pos[j] - pos[j - 1]) * 100, 1).replace(",0", ""), qb, qa, 0.8);
        }
      }
    }

    // ---- cadeia de cotas verticais (piso → pontos → registros → topo), em cm
    if (niveis.length > 1) {
      cor(doc, VERMELHO); doc.setLineWidth(0.12); doc.setFontSize(1.8 * PT);
      const at = (z: number) => Q(cotaX, cotaY, z);
      linha(at(niveis[0]), at(niveis[niveis.length - 1]));
      for (const z of niveis) {
        const q = at(z);
        doc.line(q[0] - 0.7, q[1] + 0.7, q[0] + 0.7, q[1] - 0.7);
        // linha de chamada até o elemento mais próximo naquela altura
        const alvo = nos.filter((p) => Math.abs(p.z - z) < 0.025).sort((a, b) => (a.x - a.y) - (b.x - b.y))[0];
        doc.setLineWidth(0.08);
        if (alvo) { const m = Q(cotaX - 0.06, alvo.y, z); linha(Q(alvo.x - 0.05, alvo.y, z), m); if (Math.abs(alvo.y - cotaY) > 0.01) linha(m, Q(cotaX - 0.06, cotaY, z)); }
        else linha(Q(cotaX - 0.06, cotaY, z), Q(piso[0], cotaY, z));
        doc.setLineWidth(0.12);
      }
      for (let j = 1; j < niveis.length; j++) {
        const a = at(niveis[j - 1]), b = at(niveis[j]);
        const t = String(Math.round((niveis[j] - niveis[j - 1]) * 100));
        doc.text(t, a[0] - 1.0, (a[1] + b[1]) / 2 + doc.getTextWidth(t) / 2, { angle: 90 });
      }
    }

    // ---- reservatório (cilindro azul) — tubos passam por cima
    if (cil) {
      const anel = (z: number) => Array.from({ length: 49 }, (_, j) => { const a = (j / 48) * 2 * Math.PI; return Q(cil!.cx + cil!.r * Math.cos(a), cil!.cy + cil!.r * Math.sin(a), z); });
      const b = anel(cil.z0), t = anel(cil.z1);
      const esq = b.reduce((m, p, j) => (p[0] < b[m][0] ? j : m), 0), dir = b.reduce((m, p, j) => (p[0] > b[m][0] ? j : m), 0);
      // corpo: contorno = metade frontal da base + lado + metade traseira do topo
      const frente = (j0: number, j1: number, arr: [number, number][]) => { const o: [number, number][] = []; for (let j = j0; ; j = (j + 1) % 48) { o.push(arr[j]); if (j === j1) break; } return o; };
      const baseF = b[(esq + 12) % 48][1] > b[(esq + 36) % 48][1] ? frente(esq, dir, b) : frente(dir, esq, b).reverse();
      const corpo: [number, number][] = [...baseF, t[dir], ...frente(dir, esq, t).slice(1), b[esq]];
      doc.setFillColor(28, 86, 170); doc.setDrawColor(10, 40, 90); doc.setLineWidth(0.25);
      doc.lines(corpo.slice(1).map((p, j) => [p[0] - corpo[j][0], p[1] - corpo[j][1]]), corpo[0][0], corpo[0][1], [1, 1], "FD", true);
      doc.setFillColor(70, 130, 210);
      doc.lines(t.slice(1).map((p, j) => [p[0] - t[j][0], p[1] - t[j][1]]), t[0][0], t[0][1], [1, 1], "FD", true);
      doc.setDrawColor(150, 190, 240); doc.setLineWidth(0.12);
      const c = Q(cil.cx, cil.cy, cil.z1);
      for (let j = 0; j < 48; j += 4) doc.line(c[0], c[1], t[j][0], t[j][1]);   // nervuras da tampa
      const el = resNo?.res ? porEl.get(resNo.res) : null;
      doc.setFont("helvetica", "bold"); doc.setFontSize(2.2 * PT); doc.setTextColor(255, 255, 255);
      doc.text(el?.rotulo || "RES", c[0], c[1] + 1, { align: "center" }); doc.setFont("helvetica", "normal");
      ocupados.push([c[0] - 8, c[1] - 3, c[0] + 8, c[1] + 3]);
    }
    // ---- tubos em 3D (PVC soldável marrom): contorno, corpo e brilho
    const wTubo = (dn: number) => Math.max(0.9, Math.min(2.2, (dn * 1.6 / 1000) * k + 0.5));
    const segs3d: { A: [number, number]; B: [number, number]; dn: number }[] = arestas.map((a) => {
      const p = g.nos[a.a], q = g.nos[a.b]; return { A: Q(p.x, p.y, p.z), B: Q(q.x, q.y, q.z), dn: dnDe(a) };
    });
    for (const t of tocos) segs3d.push({ A: Q(t.no.x, t.no.y, t.no.z), B: Q(t.no.x, t.no.y, zToco(t)), dn: t.dn });
    doc.setLineCap("round"); doc.setLineJoin("round");
    for (const passo of [0, 1, 2]) for (const s of segs3d) {
      const w = wTubo(s.dn);
      if (passo === 0) { doc.setDrawColor(...MARROM_ESC); doc.setLineWidth(w + 0.35); linha(s.A, s.B); }
      else if (passo === 1) { doc.setDrawColor(...MARROM); doc.setLineWidth(w); linha(s.A, s.B); }
      else {
        const L = Math.hypot(s.B[0] - s.A[0], s.B[1] - s.A[1]) || 1, nx = -(s.B[1] - s.A[1]) / L, ny = (s.B[0] - s.A[0]) / L, o = w * 0.22;
        doc.setDrawColor(...MARROM_CLARO); doc.setLineWidth(w * 0.28);
        doc.line(s.A[0] + nx * o, s.A[1] + ny * o, s.B[0] + nx * o, s.B[1] + ny * o);
      }
    }
    // conexões: bolsas (anel mais largo) em joelhos e tês
    const incid = new Map<number, { o: number; d: number }[]>();
    for (const a of arestas) {
      (incid.get(a.a) ?? incid.set(a.a, []).get(a.a)!).push({ o: a.b, d: dnDe(a) });
      (incid.get(a.b) ?? incid.set(a.b, []).get(a.b)!).push({ o: a.a, d: dnDe(a) });
    }
    for (const t of tocos) (incid.get(t.no.i) ?? incid.set(t.no.i, []).get(t.no.i)!).push({ o: t.s > 0 ? -1 : -2, d: t.dn });
    for (const [ni, es] of incid) {
      const no = g.nos[ni];
      if (no.reg || es.length < 2) continue;
      const C = Q(no.x, no.y, no.z);
      const dirs = es.map((x) => { const B = x.o < 0 ? Q(no.x, no.y, no.z + (x.o === -1 ? 1 : -1)) : Q(g.nos[x.o].x, g.nos[x.o].y, g.nos[x.o].z); const L = Math.hypot(B[0] - C[0], B[1] - C[1]) || 1; return [(B[0] - C[0]) / L, (B[1] - C[1]) / L]; });
      const reta = es.length === 2 && dirs[0][0] * dirs[1][0] + dirs[0][1] * dirs[1][1] < -0.98 && es[0].d === es[1].d;
      if (reta) continue;
      doc.setLineCap("butt");
      for (const passo of [0, 1]) es.forEach((x, j) => {
        const w = wTubo(x.d) * 1.35, L = Math.max(1.0, w * 1.1);
        doc.setDrawColor(...(passo === 0 ? MARROM_ESC : ([186, 116, 74] as RGB))); doc.setLineWidth(w + (passo === 0 ? 0.3 : 0));
        doc.line(C[0], C[1], C[0] + dirs[j][0] * L, C[1] + dirs[j][1] * L);
      });
      doc.setLineCap("round");
    }

    // ---- diâmetros e comprimentos por trecho
    doc.setFontSize(1.8 * PT);
    for (const a of arestas) {
      const p = g.nos[a.a], q = g.nos[a.b];
      const A = Q(p.x, p.y, p.z), B = Q(q.x, q.y, q.z);
      const Lp = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (Lp < 6) continue;
      const L = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      cor(doc, PRETO);
      if (a.vertical) {
        const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, t = `ø${dnDe(a)}`;
        doc.text(t, mx - wTubo(dnDe(a)) / 2 - 0.8, my + doc.getTextWidth(t) / 2, { angle: 90 });
      } else {
        textoAoLongo(doc, `ø${dnDe(a)}`, A, B, wTubo(dnDe(a)) / 2 + 0.7);
        if (Lp > 9) textoAoLongo(doc, `L=${fmt(L, 1).replace(",", ".")}`, A, B, -(wTubo(dnDe(a)) / 2 + 2.3));
      }
      // marcador azul de identificação da água fria no meio do trecho
      doc.setDrawColor(...AZUL); doc.setLineWidth(0.6);
      const ux = (B[0] - A[0]) / Lp, uy = (B[1] - A[1]) / Lp, mx = (A[0] + B[0]) / 2 + ux * (a.vertical ? 4 : 0), my = (A[1] + B[1]) / 2 + uy * (a.vertical ? 4 : 0);
      doc.line(mx - ux * 0.5, my - uy * 0.5, mx + ux * 0.5, my + uy * 0.5);
    }

    // ---- balões das colunas/descidas no topo
    for (const t of tocos) {
      const A = Q(t.no.x, t.no.y, zToco(t)), sy = t.s > 0 ? -1 : 1;
      doc.setDrawColor(...PRETO); doc.setLineWidth(0.12); doc.line(A[0], A[1], A[0], A[1] + sy * 2.5);
      balao(doc, A[0], A[1] + sy * 6, t.nome, `ø${t.dn}`, 3.6); ocupados.push([A[0] - 4, A[1] + sy * 6 - 4, A[0] + 4, A[1] + sy * 6 + 4]);
    }
    for (const ds of descidas) {
      if (ds.rede !== dt.rede.id || !dt.nos.has(ds.topo) || tocos.some((t) => ds.nos.includes(t.no.i))) continue;
      const tn = g.nos[ds.topo];
      if (tn.z - zp < 1.9) continue;
      const A = Q(tn.x, tn.y, tn.z);
      doc.setDrawColor(...PRETO); doc.setLineWidth(0.12); doc.line(A[0], A[1] - 1, A[0] + 3, A[1] - 6);
      balao(doc, A[0] + 3, A[1] - 9.5, ds.nome, `ø${ds.dn}`, 3.6); ocupados.push([A[0] - 1, A[1] - 14, A[0] + 7, A[1] - 5]);
    }

    // ---- pontos e registros
    const legenda: [string, string][] = [];
    for (const p of nos) {
      const A = Q(p.x, p.y, p.z);
      if (p.ap) {
        const el = porEl.get(p.ap);
        if (el?.tipo !== "aparelho") continue;
        const ars = arestas.filter((a) => a.a === p.i || a.b === p.i);
        const dnp = ars.length ? Math.min(...ars.map(dnDe)) : 20;
        const r = PONTOS_CAT[el.chave]?.rosca ?? '1/2"';
        const sig = SIGLAS[el.chave] ?? "";
        doc.setFillColor(40, 170, 230); doc.setDrawColor(...PRETO); doc.setLineWidth(0.15); doc.circle(A[0], A[1], 0.75, "FD");
        chamada(doc, A, [sig, `${dnp} mm - ${r}`]);
        const desc = `${NOMES_PONTO[el.chave] ?? aparelho(el.chave)?.descricao ?? el.chave} - ${dnp} mm x ${r}`;
        if (!legenda.some((l) => l[0] === sig && l[1] === desc)) legenda.push([sig, desc]);
      } else if (p.reg) {
        const el = porEl.get(p.reg);
        const viz = arestas.find((a) => a.a === p.i || a.b === p.i);
        let ang = 0;
        if (viz) { const o = g.nos[viz.a === p.i ? viz.b : viz.a]; const B = Q(o.x, o.y, o.z); ang = Math.atan2(-(B[1] - A[1]), B[0] - A[0]); }
        registro3d(doc, A[0], A[1], ang, 1.9);
        if (el?.tipo === "registro") {
          const dnr = viz ? dnDe(viz) : 25, r = ROSCA_DN[dnr] ?? "";
          const sig = MODELOS_REGISTRO[el.modelo].sigla;
          chamada(doc, A, [sig, r]);
          const desc = `${MODELOS_REGISTRO[el.modelo].nome}${el.modelo === "gaveta" ? " c/ canopla cromada" : el.modelo === "pressao" ? " c/ canopla cromada" : ""} - ${r}`;
          if (!legenda.some((l) => l[0] === sig && l[1] === desc)) legenda.push([sig, desc]);
        }
      }
    }
    // ---- legenda das indicações (canto superior direito do detalhe)
    legenda.sort((a, b) => a[0].localeCompare(b[0]));
    tabela(doc, "Legenda das indicações", legenda, Math.max(cx0 + 2, xLeg), cy0 + 2, legW);

    // ---- título
    tituloDetalhe(doc, `DETALHE ${dt.nome}`, `1:${den}`, ox, yTitulo);
  });
}

/** Registro em vista isométrica: corpo, castelo e volante. */
function registro3d(doc: jsPDF, x: number, y: number, ang: number, r: number) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const R = (u: number, v: number): [number, number] => [x + u * c + v * s, y - u * s + v * c];
  doc.setFillColor(205, 205, 210); doc.setDrawColor(70, 70, 70); doc.setLineWidth(0.15);
  const p = [R(-r, -r * 0.55), R(r, -r * 0.55), R(r, r * 0.55), R(-r, r * 0.55)];
  doc.lines([[p[1][0] - p[0][0], p[1][1] - p[0][1]], [p[2][0] - p[1][0], p[2][1] - p[1][1]], [p[3][0] - p[2][0], p[3][1] - p[2][1]]], p[0][0], p[0][1], [1, 1], "FD", true);
  const h1 = R(0, -r * 0.55), h2 = R(0, -r * 1.5);
  doc.setLineWidth(0.35); doc.line(h1[0], h1[1], h2[0], h2[1]);
  doc.setFillColor(...AZUL); doc.circle(h2[0], h2[1], r * 0.45, "FD");
}

function tabela(doc: jsPDF, titulo: string, linhas: [string, string][], x: number, y: number, w: number) {
  if (!linhas.length) return y;
  const h = 3.4;
  doc.setFillColor(205, 205, 205); doc.setDrawColor(...PRETO); doc.setLineWidth(0.15);
  doc.rect(x, y, w, h, "FD");
  doc.setFontSize(1.8 * PT); doc.setTextColor(...PRETO);
  doc.text(titulo, x + w / 2, y + 2.45, { align: "center" });
  y += h;
  for (const [a, b] of linhas) {
    doc.rect(x, y, w, h);
    doc.text(a, x + 1, y + 2.45);
    doc.text(doc.splitTextToSize(b, w - 12)[0], x + 10, y + 2.45);
    y += h;
  }
  return y;
}

function tituloDetalhe(doc: jsPDF, titulo: string, escala: string, x: number, y: number) {
  doc.setFillColor(...VERDE);
  doc.triangle(x, y + 1.2, x + 3, y - 4.2, x + 5.4, y + 1.2, "F");
  doc.setFillColor(150, 150, 150); doc.triangle(x + 3.6, y + 1.2, x + 6.4, y - 2.2, x + 7.2, y + 1.2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(3.0 * PT); doc.setTextColor(...VERDE);
  doc.text(titulo, x + 9, y - 0.8);
  doc.setFont("helvetica", "normal"); doc.setFontSize(1.8 * PT); doc.setTextColor(...PRETO);
  doc.text(escala, x + 9, y + 2.4);
}

// ============================================================ esquema vertical
/** Corte esquemático de cada coluna: escala vertical real, horizontal esquemática. */
function desenharEsquemaVertical(doc: jsPDF, e: EntradaPrancha, redes: { montada: RedeMontada; dn: Map<string, number> }[],
                                 porEl: Map<string, Elemento>, area: [number, number, number, number]) {
  const [ax0, ay0, ax1, ay1] = area;
  const paineis: { rede: RedeMontada; dn: Map<string, number>; coluna: Elemento; nos: number[] }[] = [];
  for (const r of redes) {
    const col = new Map<string, Set<number>>();
    for (const a of r.montada.grafo.arestas) if (a.el && porEl.get(a.el)?.tipo === "coluna") {
      const s = col.get(a.el) ?? col.set(a.el, new Set()).get(a.el)!;
      s.add(a.a); s.add(a.b);
    }
    for (const [id, ns] of col) paineis.push({ rede: r.montada, dn: r.dn, coluna: porEl.get(id)!, nos: [...ns] });
  }
  if (!paineis.length) return;
  const pavs = e.projeto.pavimentos.slice().sort((a, b) => a.cota - b.cota);
  const zmin = Math.min(...pavs.map((p) => p.cota)) - 0.3;
  const zmax = Math.max(...pavs.map((p) => p.cota + p.peDireito), ...paineis.flatMap((p) => p.nos.map((i) => p.rede.grafo.nos[i].z))) + 0.8;
  const den = [25, 50, 75, 100, 125, 150, 200].find((d) => ((zmax - zmin) * 1000) / d <= ay1 - ay0 - 24) ?? 200;
  const k = 1000 / den;
  const yDe = (z: number) => ay1 - 16 - (z - zmin) * k;
  const larg = Math.min(220, (ax1 - ax0 - 40) / paineis.length);
  // níveis dos pavimentos
  doc.setLineDashPattern([3, 1.5], 0); doc.setDrawColor(...CINZA); doc.setLineWidth(0.2);
  for (const p of pavs) {
    const y = yDe(p.cota);
    doc.line(ax0 + 30, y, ax1, y);
    doc.setFillColor(...PRETO); doc.triangle(ax0 + 31, y - 2.2, ax0 + 35, y - 2.2, ax0 + 33, y, "F");
    doc.setFontSize(2.1 * PT); doc.setTextColor(...PRETO);
    doc.text(`${p.nome}`, ax0, y - 0.8);
    doc.setTextColor(...CINZA); doc.setFontSize(1.8 * PT);
    doc.text(`${p.cota >= 0 ? "+" : ""}${fmt(p.cota)} m`, ax0, y + 2.6);
  }
  doc.setLineDashPattern([], 0);

  paineis.forEach((pn, i) => {
    const G = pn.rede.grafo;
    const filhos = new Map<number, number[]>();
    for (const [c, p] of Object.entries(G.pai)) (filhos.get(p) ?? filhos.set(p, []).get(p)!).push(Number(c));
    const aresta = (a: number, b: number) => G.arestas.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    const xc = ax0 + 45 + i * larg + larg / 2;
    const zs = pn.nos.map((n) => G.nos[n].z);
    // coluna
    doc.setDrawColor(...AZUL); doc.setLineWidth(0.6);
    doc.line(xc, yDe(Math.min(...zs)), xc, yDe(Math.max(...zs)));
    const dnCol = Math.max(...G.arestas.filter((a) => a.el === pn.coluna.id).map((a) => pn.dn.get(a.trecho) ?? 0));
    // ligação ao reservatório (barrilete), se a coluna é alimentada por cima
    const topo = pn.nos.reduce((a, b) => (G.nos[a].z >= G.nos[b].z ? a : b));
    let v: number | undefined = topo, achou: NoGrafo | null = null;
    for (let k2 = 0; k2 < 50 && v !== undefined; k2++) { if (G.nos[v].res) { achou = G.nos[v]; break; } v = G.pai[v]; }
    if (achou) {
      const yr = yDe(achou.z), yt = yDe(G.nos[topo].z);
      doc.setDrawColor(...AZUL); doc.setLineWidth(0.6);
      doc.line(xc, yt, xc - 12, yt); doc.line(xc - 12, yt, xc - 12, yr);
      doc.setDrawColor(...PRETO); doc.setLineWidth(0.3); doc.setFillColor(225, 235, 250);
      doc.rect(xc - 22, yr - 12, 20, 12, "FD");
      doc.setFontSize(2 * PT); doc.setTextColor(...PRETO);
      const el = achou.res ? porEl.get(achou.res) : null;
      doc.text(el?.rotulo || "RES", xc - 12, yr - 5, { align: "center" });
    }
    balao(doc, xc + 6, yDe(Math.max(...zs)) + 6, pn.coluna.rotulo || "AF", dnCol ? `ø${dnCol}` : "");
    // derivações em cada nó da coluna
    for (const n of pn.nos) {
      let lado = 0;
      for (const f of filhos.get(n) ?? []) {
        const ar = aresta(n, f);
        if (!ar || ar.el === pn.coluna.id) continue;
        const sentido = lado++ % 2 === 0 ? 1 : -1;      // ramais alternam à direita e à esquerda da coluna
        let x = 0;
        const yb = yDe(G.nos[n].z);
        const pontos: { x: number; no: NoGrafo; dn: number }[] = [];
        const registros: { x: number; dn: number }[] = [];
        // percorre o ramal (profundidade) espaçando os pontos e registros
        const pilha: number[] = [f];
        while (pilha.length) {
          const v = pilha.pop()!;
          const nv = G.nos[v];
          const a = aresta(G.pai[v], v)!;
          const d = pn.dn.get(a.trecho) ?? 0;
          if (nv.reg) { x += 8; registros.push({ x: xc + sentido * x, dn: d }); }
          if (nv.ap) { x += 13; pontos.push({ x: xc + sentido * x, no: nv, dn: d }); }
          for (const c of (filhos.get(v) ?? []).slice().reverse()) pilha.push(c);
        }
        const xf = xc + sentido * Math.max(x, 10);
        doc.setDrawColor(...AZUL); doc.setLineWidth(0.45);
        doc.line(xc, yb, xf, yb);
        doc.setFontSize(2.1 * PT); doc.setTextColor(...AZUL);
        doc.text(`ø${pn.dn.get(ar.trecho) ?? ""}`, xc + sentido * 3, yb - 1.2, { align: sentido > 0 ? "left" : "right" });
        for (const r of registros) gravata(doc, r.x, yb, 0, 1.2);
        for (const p of pontos) {
          const yp = yDe(p.no.z);
          doc.setDrawColor(...AZUL); doc.setLineWidth(0.4); doc.line(p.x, yb, p.x, yp);
          doc.setFillColor(...AZUL); doc.circle(p.x, yp, 0.6, "F");
          const el = p.no.ap ? porEl.get(p.no.ap) : null;
          doc.setFontSize(2.1 * PT); doc.setTextColor(...PRETO);
          doc.text(el?.tipo === "aparelho" ? (SIGLAS[el.chave] ?? "") : "", p.x, yp + 3.6, { align: "center" });
          doc.setTextColor(...AZUL);
          doc.text(`ø${p.dn}`, p.x + 1, (yb + yp) / 2, { angle: 90 });
          doc.setTextColor(...CINZA);
          doc.text(`${Math.round((p.no.z - (e.projeto.pavimentos.find((q) => q.id === p.no.pav)?.cota ?? 0)) * 100)}`, p.x - 1.2, yp - 1.5, { angle: 90 });
        }
      }
    }
  });
  tituloVista(doc, "Esquema vertical — colunas de água fria", `Escala vertical 1:${den} · horizontal sem escala · alturas dos pontos em cm`, ax0 + 2, ay1 - 2);
}

// ============================================================ faixa direita
function desenharLegenda(doc: jsPDF, x: number, y: number, w: number): number {
  cabecalho(doc, "Legenda", x, y, w);
  y += 6;
  const itens: [(px: number, py: number) => void, string][] = [
    [(px, py) => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(1.3); doc.line(px - 4, py, px + 4, py); doc.setDrawColor(150, 200, 250); doc.setLineWidth(1.0); doc.line(px - 4, py, px + 4, py); }, "Tubulação de água fria — PVC soldável"],
    [(px, py) => { doc.setDrawColor(...AZUL); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.3); doc.circle(px, py, 1.1, "FD"); doc.setFillColor(...AZUL); doc.circle(px, py, 0.45, "F"); }, "Ponto de utilização"],
    [(px, py) => gravata(doc, px, py, 0, 1.2), "Registro (RG gaveta · RP pressão · RE esfera)"],
    [(px, py) => balao(doc, px, py, "AF", "", 2.6), "Coluna de água fria"],
    [(px, py) => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(1.9); doc.line(px - 4, py, px + 4, py); doc.setDrawColor(244, 214, 160); doc.setLineWidth(1.55); doc.line(px - 4, py, px + 4, py); doc.setFillColor(120, 76, 8); doc.triangle(px + 1.2, py, px - 0.8, py - 0.7, px - 0.8, py + 0.7, "F"); }, "Tubulação de esgoto — PVC série normal (seta = escoamento)"],
    [(px, py) => { doc.setDrawColor(...OCRE); doc.setFillColor(255, 245, 225); doc.setLineWidth(0.35); doc.rect(px - 1.8, py - 1.8, 3.6, 3.6, "FD"); doc.circle(px, py, 1, "S"); }, "Caixa sifonada (CS) · caixa de inspeção (CI) · ralo (RS)"],
    [(px, py) => { doc.setDrawColor(...OCRE); doc.setFillColor(255, 255, 255); doc.circle(px, py, 2.2, "FD"); doc.setFontSize(1.5 * PT); doc.setTextColor(...OCRE); doc.text("TQ", px, py + 0.6, { align: "center" }); }, "Tubo de queda"],
    [(px, py) => { doc.setDrawColor(...ROXO); doc.setLineDashPattern([1.2, 0.6], 0); doc.setLineWidth(0.3); doc.rect(px - 4, py - 1.5, 8, 3); doc.setLineDashPattern([], 0); }, "Área de detalhe (isométrico)"],
  ];
  doc.setFontSize(2 * PT);
  for (const [simbolo, texto] of itens) { simbolo(x + 6, y); doc.setTextColor(...PRETO); doc.text(texto, x + 14, y + 0.8); y += 5.5; }
  doc.setTextColor(...CINZA); doc.setFontSize(1.7 * PT);
  doc.text("ø = diâmetro externo (mm) · cotas verticais em cm · h = altura do ponto acima do piso", x, y + 0.5);
  return y + 3;
}

/** Separa a descrição do catálogo em família ("Joelho 90° soldável") e medida ("25 mm", "25 x 20 mm", '3/4"'). */
export function partirDescricao(d: string): [string, string] {
  const limpo = d.replace(/\s*\(barra[^)]*\)/, "").trim();
  const m = /^(.*?)\s+((?:\d+(?:\s*x\s*\d+)?\s*mm(?:\s*x\s*[\d./]+")?)|(?:\d[\d./]*"(?:\s*x\s*.+)?)|(?:\d+\s*L))$/.exec(limpo);
  return m ? [m[1], m[2]] : [limpo, ""];
}
const SISTEMA = (l: LinhaMaterial) => (/esgoto|caixas e ralos/i.test(l.grupo) ? "Esgoto" : "Água fria");

function desenharLista(doc: jsPDF, linhas: LinhaMaterial[], x: number, y: number, w: number, yMax: number, titulo: string) {
  cabecalho(doc, titulo, x, y, w);
  y += 5.5;
  const hl = 2.9;
  doc.setFontSize(1.7 * PT);
  const cQtd = x + w - 8;
  let cortou = false;
  const linhaTxt = (t: string, recuo: number, qtd: string | null, negrito = false, corT: RGB = PRETO) => {
    if (y > yMax - hl) { cortou = true; return; }
    doc.setFont("helvetica", negrito ? "bold" : "normal"); doc.setTextColor(...corT);
    doc.text(doc.splitTextToSize(t, cQtd - x - recuo - 12)[0], x + recuo, y);
    if (qtd) doc.text(qtd, cQtd + 7, y, { align: "right" });
    doc.setDrawColor(...CINZA2); doc.setLineWidth(0.06); doc.line(x + recuo, y + 0.8, x + w, y + 0.8);
    y += hl;
  };
  for (const sis of ["Água fria", "Esgoto"]) {
    const ls = linhas.filter((l) => SISTEMA(l) === sis);
    if (!ls.length) continue;
    linhaTxt(sis, 0.5, null, true);
    for (const grupo of [...new Set(ls.map((l) => l.grupo))]) {
      linhaTxt(grupo, 2.5, null, true, [60, 60, 60]);
      const familias = new Map<string, LinhaMaterial[]>();
      for (const l of ls.filter((z) => z.grupo === grupo)) {
        const [fam] = l.familia === "aparelho" ? [l.descricao] : partirDescricao(l.descricao);
        (familias.get(fam) ?? familias.set(fam, []).get(fam)!).push(l);
      }
      for (const [fam, itens] of familias) {
        if (itens.length === 1 && itens[0].familia === "aparelho") {
          linhaTxt(fam, 5, `${itens[0].qtd} pç`); continue;
        }
        linhaTxt(fam, 5, null);
        for (const l of itens) {
          const [, med] = partirDescricao(l.descricao);
          linhaTxt(med || "—", 8, l.unidade === "m" ? `${fmt(l.qtd)} m` : `${l.qtd} ${l.unidade}`, false, l.foraCatalogo ? [170, 110, 0] : PRETO);
        }
      }
    }
  }
  doc.setFont("helvetica", "normal");
  if (cortou) { doc.setTextColor(...CINZA); doc.text("(lista completa no arquivo CSV de materiais)", x + 1, yMax); }
}

function desenharNotas(doc: jsPDF, p: Projeto, x0: number, y0: number, x1: number, y1: number) {
  doc.setDrawColor(...PRETO); doc.setLineWidth(0.3); doc.line(x0, y0, x1, y0);
  cabecalho(doc, "Notas", x0 + 4, y0 + 3, x1 - x0 - 8);
  doc.setFontSize(1.8 * PT); doc.setTextColor(...PRETO);
  const linhas = doc.splitTextToSize(p.config.selo.notas + "\nResultado gerado pelo OpenHidro. A responsabilidade técnica é do profissional que assina este projeto.", x1 - x0 - 10);
  doc.text(linhas.slice(0, Math.floor((y1 - y0 - 10) / 2.9)), x0 + 5, y0 + 9.5, { lineHeightFactor: 1.45 });
}

function desenharSelo(doc: jsPDF, p: Projeto, pav: Pavimento, x0: number, y0: number, x1: number, y1: number, folha: number, total: number,
                      conteudo = "Planta, isométricos e lista de materiais") {
  const s = p.config.selo, w = x1 - x0;
  doc.setDrawColor(...PRETO); doc.setLineWidth(0.5); doc.line(x0, y0, x1, y0);
  doc.setLineWidth(0.2);
  const campo = (rot: string, val: string, cx: number, cy: number, cw: number, ch: number, tam = 2.4, negrito = false) => {
    doc.rect(cx, cy, cw, ch);
    doc.setFontSize(1.5 * PT); doc.setTextColor(...CINZA); doc.text(rot.toUpperCase(), cx + 1.2, cy + 2.4);
    doc.setFontSize(tam * PT); doc.setTextColor(...PRETO); doc.setFont("helvetica", negrito ? "bold" : "normal");
    doc.text(doc.splitTextToSize(val || " ", cw - 2.4).slice(0, 2), cx + 1.2, cy + 2.6 + tam * 0.95, { lineHeightFactor: 1.15 });
    doc.setFont("helvetica", "normal");
  };
  let y = y0;
  campo("Empresa / projetista", [s.empresa, s.contato].filter(Boolean).join(" · "), x0, y, w, 11, 2.6, true); y += 11;
  campo("Obra", s.obra || p.nome, x0, y, w, 13, 3.6, true); y += 13;
  campo("Endereço", s.endereco, x0, y, w, 8, 2.1); y += 8;
  campo("Proprietário", s.proprietario, x0, y, w / 2, 9, 2.1);
  campo("Responsável técnico", [s.responsavel, s.registro].filter(Boolean).join(" — "), x0 + w / 2, y, w / 2, 9, 2.1); y += 9;
  campo("Disciplina", s.disciplina, x0, y, w, 8, 2.2); y += 8;
  const hFinal = y1 - y;
  campo("Conteúdo", `${pav.nome}\n${conteudo}`, x0, y, w * 0.62, hFinal * 0.62, 3.2, true);
  campo("Prancha", `${String(folha).padStart(2, "0")}/${String(total).padStart(2, "0")}`, x0 + w * 0.62, y, w * 0.38, hFinal * 0.62, 6, true);
  const y2 = y + hFinal * 0.62, h2 = y1 - y2;
  campo("Revisão", s.revisao, x0, y2, w * 0.4, h2, 2);
  campo("Data", s.data, x0 + w * 0.4, y2, w * 0.3, h2, 2);
  campo("Escala", "Indicada", x0 + w * 0.7, y2, w * 0.3, h2, 2);
}

// ============================================================ utilidades
function cor(doc: jsPDF, c: RGB) { doc.setDrawColor(...c); doc.setTextColor(...c); }

function cabecalho(doc: jsPDF, t: string, x: number, y: number, w: number) {
  doc.setFillColor(232, 236, 242); doc.setDrawColor(...PRETO); doc.setLineWidth(0.2);
  doc.rect(x, y, w, 4.2, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(2.1 * PT); doc.setTextColor(...PRETO);
  doc.text(t, x + w / 2, y + 3, { align: "center" });
  doc.setFont("helvetica", "normal");
}

function tituloVista(doc: jsPDF, titulo: string, sub: string, x: number, y: number) {
  doc.setFillColor(...AZUL); doc.triangle(x, y, x + 3.2, y - 4.4, x + 6.4, y, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(3.2 * PT); doc.setTextColor(...AZUL);
  doc.text(titulo.toUpperCase(), x + 8.5, y - 1);
  const w = doc.getTextWidth(titulo.toUpperCase());
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.35); doc.line(x + 8.5, y + 0.3, x + 8.5 + w, y + 0.3);
  doc.setFont("helvetica", "normal"); doc.setFontSize(2 * PT); doc.setTextColor(...PRETO);
  doc.text(sub, x + 8.5, y + 3.4);
}

function textoAoLongo(doc: jsPDF, t: string, a: [number, number], b: [number, number], afast: number) {
  let ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const w = doc.getTextWidth(t);
  // centralizado, um pouco acima da linha
  const nx = -Math.sin(ang), ny = -Math.cos(ang);
  const px = mx - (Math.cos(ang) * w) / 2 + nx * afast, py = my + (Math.sin(ang) * w) / 2 + ny * afast;
  doc.text(t, px, py, { angle: (ang * 180) / Math.PI });
  // caixa ocupada (aproximada) para evitar chamadas por cima
  const hT = doc.getFontSize() / PT, ex = px + Math.cos(ang) * w, ey = py - Math.sin(ang) * w;
  const qx = [px, ex, px - Math.sin(ang) * hT, ex - Math.sin(ang) * hT], qy = [py, ey, py - Math.cos(ang) * hT, ey - Math.cos(ang) * hT];
  ocupados.push([Math.min(...qx), Math.min(...qy), Math.max(...qx), Math.max(...qy)]);
}

function gravata(doc: jsPDF, x: number, y: number, ang: number, r: number) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const R = (u: number, v: number): [number, number] => [x + u * c + v * s, y - u * s + v * c];
  const p = [R(-r, -r * 0.7), R(r, r * 0.7), R(r, -r * 0.7), R(-r, r * 0.7)];
  doc.setFillColor(...AZUL); doc.setDrawColor(...AZUL); doc.setLineWidth(0.15);
  doc.triangle(p[0][0], p[0][1], p[3][0], p[3][1], x, y, "FD");
  doc.triangle(p[1][0], p[1][1], p[2][0], p[2][1], x, y, "FD");
  const h1 = R(0, 0), h2 = R(0, -r * 1.3), h3 = R(-r * 0.6, -r * 1.3), h4 = R(r * 0.6, -r * 1.3);
  doc.line(h1[0], h1[1], h2[0], h2[1]); doc.line(h3[0], h3[1], h4[0], h4[1]);
}

function balao(doc: jsPDF, x: number, y: number, t1: string, t2: string, r = 3.4) {
  doc.setDrawColor(...PRETO); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.25);
  doc.circle(x, y, r, "FD");
  doc.setFontSize((t2 ? 1.7 : 1.9) * PT); doc.setTextColor(...PRETO);
  if (t2) { doc.line(x - r, y, x + r, y); doc.text(t1, x, y - 0.8, { align: "center" }); doc.text(t2, x, y + 2.3, { align: "center" }); }
  else doc.text(t1, x, y + 0.7, { align: "center" });
}

/** Retângulos já ocupados por chamadas na vista atual (evita sobreposição de textos). */
let ocupados: [number, number, number, number][] = [];
function chamada(doc: jsPDF, a: [number, number], linhas: string[]) {
  doc.setFontSize(2.0 * PT); doc.setTextColor(...PRETO);
  const w = Math.max(...linhas.map((l) => doc.getTextWidth(l)));
  const livre = (bx: number, by: number) => {
    const r: [number, number, number, number] = [bx - 0.5, by - 3.4, bx + w + 1.5, by + 3.8];
    return ocupados.every((o) => r[2] < o[0] || r[0] > o[2] || r[3] < o[1] || r[1] > o[3]) ? r : null;
  };
  let bx = a[0] + 4, by = a[1] - 5, r = livre(bx, by);
  const tentativas: [number, number][] = [];
  for (let k = 1; k <= 8; k++) tentativas.push([4, -5 - 7.5 * k], [4, -5 + 7.5 * k], [-w - 5, -5 - 7.5 * (k - 1)]);
  for (const [dx, dy] of tentativas) { if (r) break; bx = a[0] + dx; by = a[1] + dy; r = livre(bx, by); }
  if (!r) { bx = a[0] + 4; by = a[1] - 5; r = [bx, by - 3.4, bx + w + 1, by + 3.8]; }
  ocupados.push(r);
  doc.setDrawColor(...PRETO); doc.setLineWidth(0.12);
  doc.line(a[0], a[1], bx < a[0] ? bx + w + 1 : bx, by);
  doc.line(bx, by, bx + w + 1, by);
  linhas.forEach((l, i) => doc.text(l, bx + 0.5, i ? by + 2.8 : by - 0.9));
}

function naReta(t: Elemento, x: number, y: number, tol: number) {
  if (!ehSegmento(t)) return false;
  const L2 = (t.x2 - t.x1) ** 2 + (t.y2 - t.y1) ** 2 || 1;
  const s = Math.max(0, Math.min(1, ((x - t.x1) * (t.x2 - t.x1) + (y - t.y1) * (t.y2 - t.y1)) / L2));
  return Math.hypot(t.x1 + s * (t.x2 - t.x1) - x, t.y1 + s * (t.y2 - t.y1) - y) < tol;
}

export type { NoGrafo };
