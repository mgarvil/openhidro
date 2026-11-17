// Prancha em PDF (vetorial): para cada pavimento com água fria, uma folha com
//   planta do pavimento (planta de fundo + tubulação, diâmetros, pontos, registros, colunas, chamadas
//   dos detalhes), isométricos por ambiente, legenda, lista de materiais, notas e selo.
import { jsPDF } from "jspdf";
import type { Desenho } from "../dxf/carregar";
import type { ResultadoCalculo } from "../editor";
import { ehSegmento, MODELOS_CAIXA, MODELOS_REGISTRO, SIGLAS, SIGLAS_ES, aparelho, type Elemento } from "../modelo/elementos";
import { barras, PONTOS_CAT, type LinhaMaterial } from "../modelo/quantitativo";
import type { NoGrafo, RedeMontada } from "../modelo/rede";
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

  pavs.forEach((pav, folha) => {
    if (folha > 0) doc.addPage([W, H], "landscape");
    const x0 = 25, y0 = 10, x1 = W - 10, y1 = H - 10;
    const faixa = W >= 800 ? 180 : W >= 590 ? 150 : 118;
    // moldura
    cor(doc, PRETO); doc.setLineWidth(0.7); doc.rect(x0, y0, x1 - x0, y1 - y0);
    doc.setLineWidth(0.35); doc.line(x1 - faixa, y0, x1 - faixa, y1);

    // ----- detalhes (ambientes) deste pavimento
    const detalhes: Detalhe[] = [];
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
    desenharPlanta(doc, e, pav, detalhes, porEl, redes, [ax0, ay0, ax0 + larguraPlanta, ay1]);
    if (detalhes.length) {
      doc.setDrawColor(...CINZA2); doc.setLineWidth(0.2);
      doc.line(ax0 + larguraPlanta + 3, ay0, ax0 + larguraPlanta + 3, ay1);
      desenharIsometricos(doc, e, detalhes, porEl, [ax0 + larguraPlanta + 8, ay0, ax1, ay1]);
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
  // contexto: sobe até encontrar um trecho horizontal ou a coluna (no máximo 2 nós)
  let n = lca;
  for (let k = 0; k < 2 && pai[n] !== undefined; k++) { n = pai[n]; nos.add(n); }
  return nos;
}

// ============================================================ planta
function desenharPlanta(doc: jsPDF, e: EntradaPrancha, pav: Pavimento, detalhes: Detalhe[], porEl: Map<string, Elemento>,
                        redes: { montada: RedeMontada; dn: Map<string, number> }[], area: [number, number, number, number]) {
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
  const ox = ax0 + (larg - wv) / 2, oy = ay0 + (alt - hv) / 2;
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
  doc.setFontSize(1.8 * PT); doc.setTextColor(...AZUL);
  for (const r of redes) for (const t of r.montada.trechos) {
    let melhor: { a: [number, number]; b: [number, number]; L: number } | null = null;
    for (const s of t.segmentos) {
      if (s.vertical || s.pavimentoId !== pav.id) continue;
      const a = P(s.x1, s.y1), b = P(s.x2, s.y2), L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!melhor || L > melhor.L) melhor = { a, b, L };
    }
    if (!melhor || melhor.L < 6) continue;
    textoAoLongo(doc, `ø${r.dn.get(t.id)}`, melhor.a, melhor.b, 1.0);
  }
  // símbolos
  for (const x of els) {
    if (ehSegmento(x)) continue;
    const [px, py] = P(x.x, x.y);
    if (x.tipo === "aparelho") {
      doc.setDrawColor(...AZUL); doc.setFillColor(255, 255, 255); doc.setLineWidth(0.3);
      doc.circle(px, py, 1.1, "FD"); doc.setFillColor(...AZUL); doc.circle(px, py, 0.45, "F");
      doc.setFontSize(1.8 * PT); doc.setTextColor(...PRETO);
      doc.text(`${SIGLAS[x.chave] ?? ""}${x.quantidade > 1 ? " x" + x.quantidade : ""}`, px + 1.6, py + 2.6);
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
  tituloVista(doc, `Planta — ${pav.nome} — ${temAf && temEs ? "Água fria e esgoto" : temEs ? "Esgoto" : "Água fria"}`, `Escala 1:${den}`, ax0 + 2, ay1 - 4);
}

// ============================================================ isométricos
function desenharIsometricos(doc: jsPDF, e: EntradaPrancha, detalhes: Detalhe[], porEl: Map<string, Elemento>, area: [number, number, number, number]) {
  const [ax0, ay0, ax1, ay1] = area;
  const n = detalhes.length;
  const larg = ax1 - ax0, alt = ay1 - ay0;
  let cols = 1;
  while (cols < n && Math.ceil(n / cols) * (larg / cols) * 0.8 > alt) cols++;
  const linhas = Math.ceil(n / cols);
  const cw = larg / cols, ch = alt / linhas;
  const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
  detalhes.forEach((dt, i) => {
    ocupados = [];
    const cx0 = ax0 + (i % cols) * cw, cy0 = ay0 + Math.floor(i / cols) * ch;
    const g = dt.rede.grafo;
    const nos = [...dt.nos].map((k) => g.nos[k]);
    const arestas = g.arestas.filter((a) => dt.nos.has(a.a) && dt.nos.has(a.b));
    const zp = dt.pav.cota;
    const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * c30, (x + y) * s30 + (z - zp)];
    // contorno da planta no piso (contexto), recortado ao redor do ambiente
    const esc = e.projeto.config.escalaMetro;
    const fundo: [number, number, number, number][] = [];
    const d = e.desenhos.get(dt.pav.id);
    if (d) {
      const ocultas = new Set(dt.pav.fundo?.camadasOcultas ?? []);
      const [bx0, by0, bx1, by1] = dt.bbox;
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
    const pts = nos.map((p) => iso(p.x, p.y, p.z));
    for (const f of fundo) pts.push(iso(f[0], f[1], zp), iso(f[2], f[3], zp));
    const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]);
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    const den = ESCALAS_ISO.find((dd) => ((u1 - u0) * 1000) / dd <= cw - 30 && ((v1 - v0) * 1000) / dd <= ch - 22) ?? 100;
    const k = 1000 / den;
    const ox = cx0 + (cw - (u1 - u0) * k) / 2, oy = cy0 + 6 + (ch - 16 - (v1 - v0) * k) / 2;
    const Q = (x: number, y: number, z: number): [number, number] => { const [u, v] = iso(x, y, z); return [ox + (u - u0) * k, oy + (v1 - v) * k]; };

    doc.setDrawColor(...CINZA2); doc.setLineWidth(0.12);
    for (const f of fundo) { const a = Q(f[0], f[1], zp), b = Q(f[2], f[3], zp); doc.line(a[0], a[1], b[0], b[1]); }
    // projeção da tubulação no piso, tracejada, para leitura da profundidade
    doc.setDrawColor(...CINZA); doc.setLineDashPattern([0.6, 0.6], 0); doc.setLineWidth(0.12);
    for (const a of arestas) if (!a.vertical) { const p = g.nos[a.a], q = g.nos[a.b]; const A = Q(p.x, p.y, zp), B = Q(q.x, q.y, zp); doc.line(A[0], A[1], B[0], B[1]); }
    doc.setLineDashPattern([], 0);
    // paredes onde a tubulação corre embutida (trechos horizontais abaixo de 2 m): plano vertical claro
    const pe = Math.min(dt.pav.peDireito || 2.8, 2.8);
    for (const a of arestas) {
      if (a.vertical) continue;
      const p = g.nos[a.a], q = g.nos[a.b];
      if (p.z - zp > 2.0) continue;
      const c1 = Q(p.x, p.y, zp), c2 = Q(q.x, q.y, zp), c3 = Q(q.x, q.y, zp + pe), c4 = Q(p.x, p.y, zp + pe);
      doc.setFillColor(238, 240, 243); doc.setDrawColor(200, 204, 210); doc.setLineWidth(0.1);
      doc.lines([[c2[0] - c1[0], c2[1] - c1[1]], [c3[0] - c2[0], c3[1] - c2[1]], [c4[0] - c3[0], c4[1] - c3[1]]], c1[0], c1[1], [1, 1], "FD", true);
    }
    // tubos em faixa (bifilar): contorno preto e preenchimento claro
    const wTubo = (d: number) => Math.max(0.6, Math.min(1.8, (d * 2 / 1000) * k));
    doc.setLineCap("round"); doc.setLineJoin("round");
    for (const passo of [0, 1]) for (const a of arestas) {
      const p = g.nos[a.a], q = g.nos[a.b]; const A = Q(p.x, p.y, p.z), B = Q(q.x, q.y, q.z);
      const d = dt.dn.get(a.trecho) ?? 25;
      if (passo === 0) doc.setDrawColor(0, 0, 0); else doc.setDrawColor(150, 200, 250);
      doc.setLineWidth(wTubo(d) + (passo === 0 ? 0.32 : 0));
      doc.line(A[0], A[1], B[0], B[1]);
    }
    // conexões: bolsas nas saídas de cada joelho, tê, bucha (marca mais larga, contornada)
    const incid = new Map<number, { o: number; d: number }[]>();
    for (const a of arestas) {
      const d = dt.dn.get(a.trecho) ?? 25;
      (incid.get(a.a) ?? incid.set(a.a, []).get(a.a)!).push({ o: a.b, d });
      (incid.get(a.b) ?? incid.set(a.b, []).get(a.b)!).push({ o: a.a, d });
    }
    for (const [ni, es] of incid) {
      const no = g.nos[ni];
      if (no.reg) continue;
      const C = Q(no.x, no.y, no.z);
      const dirs = es.map((x) => { const o = g.nos[x.o]; const B = Q(o.x, o.y, o.z); const L = Math.hypot(B[0] - C[0], B[1] - C[1]) || 1; return [(B[0] - C[0]) / L, (B[1] - C[1]) / L]; });
      const reta = es.length === 2 && dirs[0][0] * dirs[1][0] + dirs[0][1] * dirs[1][1] < -0.98 && es[0].d === es[1].d;
      if (reta || (es.length === 1 && !no.ap)) continue;
      const azul = !!no.ap;
      for (const passo of [0, 1]) es.forEach((x, i) => {
        const w = wTubo(x.d) * 1.55, L = Math.max(1.4, w * 1.5);
        if (passo === 0) doc.setDrawColor(0, 0, 0); else if (azul) doc.setDrawColor(70, 120, 220); else doc.setDrawColor(120, 175, 235);
        doc.setLineWidth(w + (passo === 0 ? 0.3 : 0)); doc.setLineCap("butt");
        doc.line(C[0], C[1], C[0] + dirs[i][0] * L, C[1] + dirs[i][1] * L);
      });
      if (azul) { doc.setFillColor(201, 162, 58); doc.circle(C[0], C[1], 0.45, "F"); }   // bucha de latão
      doc.setLineCap("round");
    }
    // diâmetros e cotas verticais
    doc.setFontSize(2.0 * PT);
    for (const a of arestas) {
      const p = g.nos[a.a], q = g.nos[a.b];
      const A = Q(p.x, p.y, p.z), B = Q(q.x, q.y, q.z);
      if (Math.hypot(B[0] - A[0], B[1] - A[1]) < 5) continue;
      if (a.vertical) {
        doc.setTextColor(...PRETO);
        const cm = Math.round(Math.abs(p.z - q.z) * 100);
        const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
        doc.text(String(cm), mx - 1.0, my + doc.getTextWidth(String(cm)) / 2, { angle: 90 });
        doc.setTextColor(...AZUL);
        const t = `ø${dt.dn.get(a.trecho)}`;
        doc.text(t, mx + 2.6, my + doc.getTextWidth(t) / 2, { angle: 90 });
      } else {
        doc.setTextColor(...AZUL);
        textoAoLongo(doc, `ø${dt.dn.get(a.trecho)}`, A, B, 0.9);
      }
    }
    // cotas de altura dos pontos (linha de chamada até o piso)
    for (const p of nos) {
      if (!p.ap && !p.reg) continue;
      const A = Q(p.x, p.y, p.z), F = Q(p.x, p.y, zp);
      if (p.ap) {
        doc.setDrawColor(...PRETO); doc.setLineWidth(0.1); doc.setLineDashPattern([0.4, 0.5], 0);
        doc.line(A[0], A[1], F[0], F[1]); doc.setLineDashPattern([], 0);
        doc.setFillColor(...AZUL); doc.circle(A[0], A[1], 0.55, "F");
        const el = porEl.get(p.ap);
        if (el?.tipo === "aparelho") {
          const desc = `${SIGLAS[el.chave] ?? ""} — ${aparelho(el.chave)?.descricao.split(/[(—,]/)[0].trim().split(" ").slice(0, 2).join(" ") ?? ""}`;
          const ar = arestas.find((a) => a.a === p.i || a.b === p.i);
          const dnp = ar ? dt.dn.get(ar.trecho) : null;
          const r = PONTOS_CAT[el.chave]?.rosca ?? '1/2"';
          chamada(doc, A, [desc, `${dnp ? dnp + " mm x " : ""}${r} · h = ${Math.round((p.z - zp) * 100)} cm`]);
        }
      } else if (p.reg) {
        const el = porEl.get(p.reg);
        const viz = arestas.find((a) => a.a === p.i || a.b === p.i);
        let ang = 0;
        if (viz) { const o = g.nos[viz.a === p.i ? viz.b : viz.a]; const B = Q(o.x, o.y, o.z); ang = Math.atan2(-(B[1] - A[1]), B[0] - A[0]); }
        gravata(doc, A[0], A[1], ang, 1.7);
        if (el?.tipo === "registro") {
          const ar = arestas.find((a) => a.a === p.i || a.b === p.i);
          const d = ar ? dt.dn.get(ar.trecho) : null;
          const r = d ? ({ 20: '1/2"', 25: '3/4"', 32: '1"', 40: '1.1/4"', 50: '1.1/2"', 60: '2"' } as Record<number, string>)[d] ?? "" : "";
          chamada(doc, A, [`${MODELOS_REGISTRO[el.modelo].sigla} — ${MODELOS_REGISTRO[el.modelo].nome} ${r}`, el.altura != null ? `h = ${Math.round(el.altura * 100)} cm` : "na horizontal"]);
        }
      }
    }
    tituloVista(doc, `Detalhe ${dt.nome} — Isométrico`, `${dt.pav.nome} · Escala 1:${den}`, cx0 + 2, cy0 + ch - 5);
  });
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

function desenharLista(doc: jsPDF, linhas: LinhaMaterial[], x: number, y: number, w: number, yMax: number, titulo: string) {
  cabecalho(doc, titulo, x, y, w);
  y += 5.5;
  const hl = 3.1;
  doc.setFontSize(1.75 * PT);
  const grupos = [...new Set(linhas.map((l) => l.grupo))];
  const cQtd = x + w - 22, cUn = x + w - 12, cBar = x + w - 1;
  doc.setTextColor(...CINZA);
  doc.text("Descrição", x + 1, y); doc.text("Qtd.", cQtd, y, { align: "right" }); doc.text("Un.", cUn, y); doc.text("Barras", cBar, y, { align: "right" });
  y += hl;
  let n = 0;
  const total = linhas.length + grupos.length;
  for (const g of grupos) {
    if (y > yMax - hl * 2) break;
    doc.setFont("helvetica", "bold"); doc.setTextColor(...PRETO); doc.text(g, x + 1, y); doc.setFont("helvetica", "normal");
    y += hl; n++;
    for (const l of linhas.filter((z) => z.grupo === g)) {
      if (y > yMax - hl) break;
      const desc = doc.splitTextToSize(l.descricao, cQtd - x - 12)[0];
      doc.setTextColor(...(l.foraCatalogo ? ([170, 110, 0] as RGB) : PRETO));
      doc.text(desc, x + 3, y);
      doc.text(l.unidade === "m" ? fmt(l.qtd) : String(l.qtd), cQtd, y, { align: "right" });
      doc.text(l.unidade, cUn, y);
      if (l.unidade === "m") doc.text(String(barras(l.qtd)), cBar, y, { align: "right" });
      doc.setDrawColor(...CINZA2); doc.setLineWidth(0.08); doc.line(x, y + 0.9, x + w, y + 0.9);
      y += hl; n++;
    }
  }
  if (n < total) { doc.setTextColor(...CINZA); doc.text("(lista completa no arquivo CSV de materiais)", x + 1, y + 1); }
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
