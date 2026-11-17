// Editor de lançamento: ferramentas do mouse (selecionar, tubo, ponto, reservatório, coluna), snap,
// orto, desfazer/refazer e o desenho dos elementos e resultados por cima da planta.
// Toda alteração passa pelos comandos registrados em main.ts, então mouse, teclado e (no M3) o Claude
// produzem exatamente o mesmo efeito.
import { aparelho, SIGLAS, type ElAparelho, type ElColuna, type Elemento, type ElTubo } from "./modelo/elementos";
import type { RedeMontada } from "./modelo/rede";
import { novoId, type Pavimento, type Projeto } from "./projeto";
import type { Vista2D } from "./vista/vista2d";

export type NomeFerramenta = "selecionar" | "tubo" | "aparelho" | "reservatorio" | "coluna";

export interface Opcoes { alturaTubo: number; aparelho: string; alturaAparelho: number | null; alturaReservatorio: number; nivelAgua: number; colunaTopo: string | null }

interface Snap { x: number; y: number; tipo: "ponto" | "meio" | "orto" | "planta" | "livre" }

export interface ResultadoTrecho { rede: string; id: string; de: string; para: string; dn: number; ref: string; q: number; v: number; hf: number; L: number; ok: boolean }
export interface ResultadoPonto { rede: string; no: string; el: string; pd: number; pmin: number | null; ok: boolean }
export interface ResultadoCalculo {
  redes: { montada: RedeMontada; resposta: any }[];
  trechos: ResultadoTrecho[];
  pontos: ResultadoPonto[];
  alertas: string[];
  erros: { mensagem: string; elementos: string[] }[];
  avisos: { mensagem: string; elementos: string[] }[];
}

const COR = {
  tubo: "#3fb6ff", tuboOutro: "rgba(63,182,255,0.18)", ponto: "#56d39a", res: "#7fb3ff", coluna: "#c49bff",
  sel: "#ffd23f", ruim: "#ff5c5c", texto: "#e8eef6", previa: "#ffd23f", snap: "#ffd23f",
};

export class Editor {
  ferramenta: NomeFerramenta = "selecionar";
  opcoes: Opcoes = { alturaTubo: 2.6, aparelho: "lavatorio", alturaAparelho: null, alturaReservatorio: 0.5, nivelAgua: 0, colunaTopo: null };
  selecao = new Set<string>();
  orto = false;
  snapPlanta = true;
  /** Snap nas pontas de linha da planta de fundo (fornecido por main.ts). */
  pontaPlanta: (x: number, y: number, tol: number) => [number, number] | null = () => null;
  resultado: ResultadoCalculo | null = null;
  problemas = new Set<string>();

  private cadeia: [number, number] | null = null;      // último ponto da tubulação em desenho
  private cursor: Snap | null = null;
  private shift = false;
  private caixa: { x0: number; y0: number; x1: number; y1: number; px0: number; py0: number } | null = null;
  private pilhaDesfazer: string[] = [];
  private pilhaRefazer: string[] = [];

  aoMudarSelecao: () => void = () => {};
  aoMudarFerramenta: () => void = () => {};
  aoAlterar: () => void = () => {};
  mensagem: (t: string, erro?: boolean) => void = () => {};

  constructor(private vista: Vista2D, private host: HTMLElement, private projeto: () => Projeto) {
    vista.sobreposicao = (ctx) => this.desenhar(ctx);
    vista.onMover = (x, y, _px, _py, e) => this.mover(x, y, e);
    vista.onEsquerdoBaixo = (x, y, px, py, e) => this.baixo(x, y, px, py, e);
    vista.onEsquerdoCima = (x, y, px, py, e) => this.cima(x, y, px, py, e);
    vista.onDireito = () => this.encerrar();
    window.addEventListener("keydown", (e) => { if (e.key === "Shift") { this.shift = true; this.vista.redesenhar(); } });
    window.addEventListener("keyup", (e) => { if (e.key === "Shift") { this.shift = false; this.vista.redesenhar(); } });
  }

  // ---------------------------------------------------------------- dados
  private get p() { return this.projeto(); }
  get pavAtivo(): Pavimento { return this.p.pavimentos.find((x) => x.id === this.p.pavimentoAtivo) ?? this.p.pavimentos[0]; }
  elemento(id: string) { return this.p.elementos.find((e) => e.id === id); }
  get selecionados(): Elemento[] { return this.p.elementos.filter((e) => this.selecao.has(e.id)); }

  /** Elementos que aparecem no pavimento ativo (colunas aparecem em todos os que atravessam). */
  visiveis(): Elemento[] {
    const a = this.pavAtivo;
    const cota = new Map(this.p.pavimentos.map((p) => [p.id, p.cota]));
    return this.p.elementos.filter((e) => {
      if (e.tipo !== "coluna") return e.pavimentoId === a.id;
      const z0 = cota.get(e.pavimentoId) ?? 0, z1 = cota.get(e.topoId) ?? z0;
      return a.cota >= Math.min(z0, z1) - 1e-6 && a.cota <= Math.max(z0, z1) + 1e-6;
    });
  }

  private checkpoint() {
    this.pilhaDesfazer.push(JSON.stringify(this.p.elementos));
    if (this.pilhaDesfazer.length > 200) this.pilhaDesfazer.shift();
    this.pilhaRefazer = [];
  }
  private alterou() {
    if (this.resultado) { this.resultado = null; this.problemas.clear(); this.mensagem("Projeto alterado: calcule de novo (F5) para ver os diâmetros."); }
    this.aoAlterar();
    this.vista.redesenhar();
  }
  desfazer() {
    const s = this.pilhaDesfazer.pop();
    if (!s) { this.mensagem("Nada para desfazer"); return; }
    this.pilhaRefazer.push(JSON.stringify(this.p.elementos));
    this.p.elementos = JSON.parse(s);
    this.limparSelecaoInexistente();
    this.alterou();
  }
  refazer() {
    const s = this.pilhaRefazer.pop();
    if (!s) { this.mensagem("Nada para refazer"); return; }
    this.pilhaDesfazer.push(JSON.stringify(this.p.elementos));
    this.p.elementos = JSON.parse(s);
    this.limparSelecaoInexistente();
    this.alterou();
  }
  limparHistorico() { this.pilhaDesfazer = []; this.pilhaRefazer = []; this.resultado = null; this.problemas.clear(); this.selecao.clear(); this.cadeia = null; }
  private limparSelecaoInexistente() {
    const ids = new Set(this.p.elementos.map((e) => e.id));
    for (const id of [...this.selecao]) if (!ids.has(id)) this.selecao.delete(id);
    this.aoMudarSelecao();
  }

  // ------------------------------------------------- operações (usadas pelos comandos)
  inserir(dados: Partial<Elemento> & { tipo: Elemento["tipo"] }): Elemento {
    const el = { id: novoId(dados.tipo.slice(0, 2)), pavimentoId: this.pavAtivo.id, ...dados } as Elemento;
    if (!this.p.pavimentos.some((p) => p.id === el.pavimentoId)) throw new Error("Pavimento inexistente");
    if (el.tipo === "aparelho") {
      const ap = aparelho(el.chave);
      if (!ap) throw new Error(`Aparelho desconhecido: ${el.chave}`);
      el.altura ??= ap.altura_m;
      el.quantidade ??= 1;
    }
    if (el.tipo === "tubo") el.altura ??= this.opcoes.alturaTubo;
    if (el.tipo === "reservatorio") { el.altura ??= this.opcoes.alturaReservatorio; el.nivelAgua ??= this.opcoes.nivelAgua; }
    if (el.tipo === "coluna" && !el.topoId) throw new Error("Coluna sem pavimento de topo");
    this.checkpoint();
    this.p.elementos.push(el);
    this.alterou();
    return el;
  }

  excluir(ids: string[]) {
    const set = new Set(ids);
    if (!this.p.elementos.some((e) => set.has(e.id))) return 0;
    this.checkpoint();
    const antes = this.p.elementos.length;
    this.p.elementos = this.p.elementos.filter((e) => !set.has(e.id));
    for (const id of ids) this.selecao.delete(id);
    this.aoMudarSelecao();
    this.alterou();
    return antes - this.p.elementos.length;
  }

  alterar(ids: string[], dados: Record<string, unknown>) {
    const alvo = this.p.elementos.filter((e) => ids.includes(e.id));
    if (!alvo.length) return;
    this.checkpoint();
    for (const e of alvo) for (const [k, v] of Object.entries(dados)) if (k !== "id" && k !== "tipo") (e as any)[k] = v;
    this.alterou();
    this.aoMudarSelecao();
  }

  selecionar(ids: string[], somar = false) {
    if (!somar) this.selecao.clear();
    for (const id of ids) this.selecao.add(id);
    this.aoMudarSelecao();
    this.vista.redesenhar();
  }

  definirFerramenta(f: NomeFerramenta) {
    if (f === "coluna" && this.p.pavimentos.length < 2) {
      this.mensagem("A coluna liga dois pavimentos: crie outro pavimento primeiro.", true);
      return;
    }
    this.ferramenta = f;
    this.cadeia = null;
    this.caixa = null;
    if (f !== "selecionar") this.selecao.clear();
    this.host.style.cursor = f === "selecionar" ? "" : "crosshair";
    this.aoMudarFerramenta();
    this.aoMudarSelecao();
    this.vista.redesenhar();
    const dica: Record<NomeFerramenta, string> = {
      selecionar: "",
      tubo: "Tubo: clique os pontos; snap nas pontas, pontos e no meio dos tubos (tê). F8 ou Shift = orto. Botão direito ou Esc encerra.",
      aparelho: "Ponto de utilização: clique para inserir. Esc encerra.",
      reservatorio: "Reservatório: clique onde fica a saída de água.",
      coluna: "Coluna: clique onde a tubulação sobe/desce entre os pavimentos.",
    };
    if (dica[f]) this.mensagem(dica[f]);
  }

  /** Esc: encerra a tubulação em curso; se não houver, volta para Selecionar. */
  esc() {
    if (this.cadeia) { this.cadeia = null; this.vista.redesenhar(); return; }
    if (this.ferramenta !== "selecionar") this.definirFerramenta("selecionar");
    else if (this.selecao.size) this.selecionar([]);
  }
  private encerrar() {
    if (this.cadeia) { this.cadeia = null; this.vista.redesenhar(); }
    else if (this.ferramenta !== "selecionar") this.definirFerramenta("selecionar");
  }
  alternarSnapPlanta() { this.snapPlanta = !this.snapPlanta; this.mensagem(`Snap na planta ${this.snapPlanta ? "ligado" : "desligado"} (F3)`); }
  alternarOrto() { this.orto = !this.orto; this.mensagem(`Orto ${this.orto ? "ligado" : "desligado"} (F8)`); this.vista.redesenhar(); }

  // ---------------------------------------------------------------- snap
  private colunasTopoPadrao(): string | null {
    const ps = this.p.pavimentos, a = this.pavAtivo;
    const i = ps.indexOf(a);
    if (this.opcoes.colunaTopo && ps.some((p) => p.id === this.opcoes.colunaTopo && p.id !== a.id)) return this.opcoes.colunaTopo;
    return (ps[i + 1] ?? ps[i - 1])?.id ?? null;
  }

  private snap(x: number, y: number): Snap {
    const tol = 12 / this.vista.pxPorUnidade;
    const pts: [number, number][] = [];
    const segs: ElTubo[] = [];
    for (const e of this.visiveis()) {
      if (e.tipo === "tubo") { pts.push([e.x1, e.y1], [e.x2, e.y2]); segs.push(e); }
      else pts.push([e.x, e.y]);
    }
    let melhor: Snap | null = null, dmin = tol;
    for (const [px, py] of pts) {
      const d = Math.hypot(px - x, py - y);
      if (d < dmin) { dmin = d; melhor = { x: px, y: py, tipo: "ponto" }; }
    }
    if (melhor) return melhor;
    const ortoAtivo = this.cadeia && (this.orto !== this.shift);
    if (ortoAtivo && this.cadeia) {
      const [ax, ay] = this.cadeia;
      return Math.abs(x - ax) >= Math.abs(y - ay) ? { x, y: ay, tipo: "orto" } : { x: ax, y, tipo: "orto" };
    }
    for (const t of segs) {
      const L2 = (t.x2 - t.x1) ** 2 + (t.y2 - t.y1) ** 2;
      if (!L2) continue;
      const s = Math.max(0, Math.min(1, ((x - t.x1) * (t.x2 - t.x1) + (y - t.y1) * (t.y2 - t.y1)) / L2));
      const qx = t.x1 + s * (t.x2 - t.x1), qy = t.y1 + s * (t.y2 - t.y1);
      const d = Math.hypot(qx - x, qy - y);
      if (d < dmin) { dmin = d; melhor = { x: qx, y: qy, tipo: "meio" }; }
    }
    if (melhor) return melhor;
    if (this.snapPlanta) {
      const q = this.pontaPlanta(x, y, tol * 0.8);
      if (q) return { x: q[0], y: q[1], tipo: "planta" };
    }
    return { x, y, tipo: "livre" };
  }

  // -------------------------------------------------------------- mouse
  private mover(x: number, y: number, e: PointerEvent) {
    if (this.caixa) {
      this.caixa.x1 = x; this.caixa.y1 = y;
      this.vista.redesenhar();
      return;
    }
    this.shift = e.shiftKey;
    this.cursor = this.ferramenta === "selecionar" ? null : this.snap(x, y);
    if (this.ferramenta !== "selecionar") this.vista.redesenhar();
  }

  private baixo(x: number, y: number, px: number, py: number, e: PointerEvent) {
    if (this.ferramenta === "selecionar") {
      this.caixa = { x0: x, y0: y, x1: x, y1: y, px0: px, py0: py };
      return;
    }
    const s = this.snap(x, y);
    try {
      if (this.ferramenta === "tubo") {
        if (!this.cadeia) { this.cadeia = [s.x, s.y]; this.vista.redesenhar(); return; }
        const [ax, ay] = this.cadeia;
        if (Math.hypot(s.x - ax, s.y - ay) * this.vista.pxPorUnidade < 2) return;
        this.inserir({ tipo: "tubo", x1: ax, y1: ay, x2: s.x, y2: s.y, altura: this.opcoes.alturaTubo, dn: null });
        // chegou num ponto de utilização ou reservatório: encerra a tubulação
        const alvo = this.visiveis().find((el) => (el.tipo === "aparelho" || el.tipo === "reservatorio") && el.x === s.x && el.y === s.y);
        this.cadeia = alvo ? null : [s.x, s.y];
      } else if (this.ferramenta === "aparelho") {
        this.inserir({ tipo: "aparelho", chave: this.opcoes.aparelho, x: s.x, y: s.y,
                       altura: this.opcoes.alturaAparelho ?? aparelho(this.opcoes.aparelho)?.altura_m ?? 0.6, quantidade: 1 } as Partial<ElAparelho> & { tipo: "aparelho" });
      } else if (this.ferramenta === "reservatorio") {
        this.inserir({ tipo: "reservatorio", x: s.x, y: s.y, altura: this.opcoes.alturaReservatorio, nivelAgua: this.opcoes.nivelAgua, rotulo: this.proximoRotulo("RES") });
        this.definirFerramenta("selecionar");
      } else if (this.ferramenta === "coluna") {
        const topo = this.colunasTopoPadrao();
        if (!topo) throw new Error("Crie outro pavimento para a coluna chegar");
        this.inserir({ tipo: "coluna", x: s.x, y: s.y, topoId: topo, rotulo: this.proximoRotulo("AF-") } as Partial<ElColuna> & { tipo: "coluna" });
      }
    } catch (err: any) {
      this.mensagem(err?.message ?? String(err), true);
    }
    void e;
  }

  private cima(x: number, y: number, px: number, py: number, e: PointerEvent) {
    if (!this.caixa) return;
    const c = this.caixa;
    this.caixa = null;
    const somar = e.shiftKey || e.ctrlKey;
    if (Math.hypot(px - c.px0, py - c.py0) < 5) {
      const id = this.acertar(x, y);
      if (id && somar && this.selecao.has(id)) { this.selecao.delete(id); this.aoMudarSelecao(); this.vista.redesenhar(); }
      else this.selecionar(id ? [id] : [], somar);
      return;
    }
    const [xa, xb] = [Math.min(c.x0, x), Math.max(c.x0, x)], [ya, yb] = [Math.min(c.y0, y), Math.max(c.y0, y)];
    const dentro = (px: number, py: number) => px >= xa && px <= xb && py >= ya && py <= yb;
    const ids = this.visiveis().filter((el) => el.tipo === "tubo" ? dentro(el.x1, el.y1) && dentro(el.x2, el.y2) : dentro(el.x, el.y)).map((el) => el.id);
    this.selecionar(ids, somar);
  }

  /** Elemento sob o cursor (pontos têm prioridade sobre tubos). */
  acertar(x: number, y: number): string | null {
    const tol = 8 / this.vista.pxPorUnidade;
    let melhor: string | null = null, dmin = tol;
    const vis = this.visiveis();
    for (const e of vis) {
      if (e.tipo === "tubo") continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < dmin * 1.4) { dmin = d / 1.4; melhor = e.id; }
    }
    if (melhor) return melhor;
    for (const e of vis) {
      if (e.tipo !== "tubo") continue;
      const L2 = (e.x2 - e.x1) ** 2 + (e.y2 - e.y1) ** 2 || 1;
      const s = Math.max(0, Math.min(1, ((x - e.x1) * (e.x2 - e.x1) + (y - e.y1) * (e.y2 - e.y1)) / L2));
      const d = Math.hypot(e.x1 + s * (e.x2 - e.x1) - x, e.y1 + s * (e.y2 - e.y1) - y);
      if (d < dmin) { dmin = d; melhor = e.id; }
    }
    return melhor;
  }

  proximoRotulo(prefixo: string) {
    const usados = new Set(this.p.elementos.map((e) => e.rotulo));
    for (let i = 1; ; i++) if (!usados.has(`${prefixo}${i}`)) return `${prefixo}${i}`;
  }

  /** Enquadra os elementos indicados (troca de pavimento se for preciso é feita por quem chama). */
  enquadrarElementos(ids: string[]) {
    const els = this.p.elementos.filter((e) => ids.includes(e.id));
    if (!els.length) return;
    const xs: number[] = [], ys: number[] = [];
    for (const e of els) {
      if (e.tipo === "tubo") { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); } else { xs.push(e.x); ys.push(e.y); }
    }
    const m = 1.5 / this.p.config.escalaMetro; // pelo menos 1,5 m de folga
    this.vista.enquadrar(Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m, 1.1);
  }

  // -------------------------------------------------------------- desenho
  private desenhar(ctx: CanvasRenderingContext2D) {
    const v = this.vista;
    const T = (x: number, y: number) => v.paraTela(x, y);
    const esc = v.pxPorUnidade * (1 / this.p.config.escalaMetro); // px por metro
    const raio = Math.max(5, Math.min(13, 0.12 * esc));
    const vis = this.visiveis();
    const res = this.resultado;
    const tuboRuim = new Set<string>();
    if (res) for (const t of res.trechos) if (!t.ok) {
      const m = res.redes.find((r) => r.montada.id === t.rede)?.montada.trechos.find((x) => x.id === t.id);
      m?.elementos.forEach((id) => tuboRuim.add(id));
    }
    const fonte = (px: number, peso = 500) => `${peso} ${px}px "Segoe UI", Arial, sans-serif`;
    ctx.lineCap = "round";

    // tubos de outros pavimentos, bem apagados, como referência
    ctx.strokeStyle = COR.tuboOutro;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const e of this.p.elementos) {
      if (e.tipo !== "tubo" || e.pavimentoId === this.pavAtivo.id) continue;
      const [a, b] = [T(e.x1, e.y1), T(e.x2, e.y2)];
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();

    // tubos
    for (const e of vis) {
      if (e.tipo !== "tubo") continue;
      const [a, b] = [T(e.x1, e.y1), T(e.x2, e.y2)];
      const sel = this.selecao.has(e.id), prob = this.problemas.has(e.id) || tuboRuim.has(e.id);
      if (sel || prob) {
        ctx.strokeStyle = sel ? COR.sel : COR.ruim;
        ctx.globalAlpha = 0.35; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = prob ? COR.ruim : COR.tubo;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }

    // pontos, reservatórios, colunas
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    for (const e of vis) {
      if (e.tipo === "tubo") continue;
      const [x, y] = T(e.x, e.y);
      const sel = this.selecao.has(e.id);
      let prob = this.problemas.has(e.id);
      const pr = res?.pontos.find((p) => p.el === e.id);
      if (pr && !pr.ok) prob = true;
      if (sel || prob) {
        ctx.fillStyle = sel ? COR.sel : COR.ruim; ctx.globalAlpha = 0.3;
        ctx.beginPath(); ctx.arc(x, y, raio + 6, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.lineWidth = 2;
      let rot = e.rotulo ?? "";
      if (e.tipo === "aparelho") {
        ctx.strokeStyle = prob ? COR.ruim : COR.ponto;
        ctx.fillStyle = "#15191f";
        ctx.beginPath(); ctx.arc(x, y, raio, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = prob ? COR.ruim : COR.ponto;
        ctx.beginPath(); ctx.arc(x, y, raio * 0.35, 0, Math.PI * 2); ctx.fill();
        rot = e.rotulo || SIGLAS[e.chave] || "P";
        if (e.quantidade > 1) rot += ` ×${e.quantidade}`;
      } else if (e.tipo === "reservatorio") {
        const r = raio * 1.6;
        ctx.strokeStyle = COR.res; ctx.fillStyle = "rgba(127,179,255,0.15)";
        ctx.beginPath(); ctx.rect(x - r, y - r, 2 * r, 2 * r); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
        rot = e.rotulo || "RES";
      } else if (e.tipo === "coluna") {
        ctx.strokeStyle = COR.coluna; ctx.fillStyle = "#15191f";
        ctx.beginPath(); ctx.arc(x, y, raio * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const k = raio * 0.62;
        ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x - k, y + k); ctx.lineTo(x + k, y - k); ctx.stroke();
        const topo = this.p.pavimentos.find((p) => p.id === e.topoId);
        const sobe = topo && topo.cota > this.pavAtivo.cota, desce = e.pavimentoId !== this.pavAtivo.id;
        rot = `${e.rotulo || "AF"} ${sobe && desce ? "↕" : sobe ? "↑" : "↓"}`;
      }
      if (pr && !e.rotulo) rot = pr.no + (e.tipo === "aparelho" && e.quantidade > 1 ? ` ×${e.quantidade}` : "");
      // rótulo abaixo do símbolo (os diâmetros ficam acima dos tubos)
      ctx.textAlign = "center";
      const yr = y + (e.tipo === "reservatorio" ? raio * 1.6 : raio) + 9;
      ctx.font = fonte(11, 600);
      ctx.fillStyle = prob ? COR.ruim : COR.texto;
      ctx.lineWidth = 3.5; ctx.strokeStyle = "rgba(15,18,22,0.92)"; ctx.lineJoin = "round";
      ctx.strokeText(rot, x, yr);
      ctx.fillText(rot, x, yr);
      if (pr) {
        const tp = `${pr.pd.toFixed(1).replace(".", ",")} kPa`;
        ctx.font = fonte(10.5);
        ctx.fillStyle = pr.ok ? "#b5c3d3" : COR.ruim;
        ctx.strokeText(tp, x, yr + 13);
        ctx.fillText(tp, x, yr + 13);
      }
      ctx.textAlign = "left";
    }

    // diâmetros calculados
    if (res) {
      ctx.textAlign = "center";
      for (const t of res.trechos) {
        const m = res.redes.find((r) => r.montada.id === t.rede)?.montada.trechos.find((x) => x.id === t.id);
        if (!m) continue;
        let maior: { a: [number, number]; b: [number, number]; L: number } | null = null;
        for (const s of m.segmentos) {
          if (s.vertical || s.pavimentoId !== this.pavAtivo.id) continue;
          const a = T(s.x1, s.y1), b = T(s.x2, s.y2);
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (!maior || L > maior.L) maior = { a, b, L };
        }
        if (!maior || maior.L < 18) continue;
        const cx = (maior.a[0] + maior.b[0]) / 2, cy = (maior.a[1] + maior.b[1]) / 2;
        let ang = Math.atan2(maior.b[1] - maior.a[1], maior.b[0] - maior.a[0]);
        if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
        const txt = `Ø${t.dn}`;
        ctx.save();
        ctx.translate(cx, cy); ctx.rotate(ang);
        ctx.font = fonte(11, 700);
        const w = ctx.measureText(txt).width + 6;
        ctx.fillStyle = "rgba(21,25,31,0.85)";
        ctx.fillRect(-w / 2, -16, w, 13);
        ctx.fillStyle = t.ok ? "#ffffff" : COR.ruim;
        ctx.fillText(txt, 0, -9.5);
        ctx.restore();
      }
    }

    // prévia da ferramenta
    const c = this.cursor;
    if (this.ferramenta !== "selecionar" && c) {
      const [x, y] = T(c.x, c.y);
      if (this.ferramenta === "tubo" && this.cadeia) {
        const a = T(this.cadeia[0], this.cadeia[1]);
        ctx.setLineDash([6, 4]); ctx.strokeStyle = COR.previa; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
        const L = Math.hypot(c.x - this.cadeia[0], c.y - this.cadeia[1]) * this.p.config.escalaMetro;
        ctx.font = fonte(11, 600); ctx.fillStyle = COR.previa; ctx.textAlign = "left";
        ctx.fillText(`${L.toFixed(2).replace(".", ",")} m`, x + 14, y + 14);
      }
      ctx.strokeStyle = COR.snap; ctx.lineWidth = 1.5;
      if (c.tipo === "ponto") { ctx.strokeRect(x - 6, y - 6, 12, 12); }
      else if (c.tipo === "meio") { ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x - 6, y + 6); ctx.lineTo(x + 6, y - 6); ctx.stroke(); }
      else if (c.tipo === "planta") { ctx.strokeStyle = "#ff9f43"; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); ctx.closePath(); ctx.stroke(); }
      else if (c.tipo === "orto") { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke(); }
    }

    // caixa de seleção
    if (this.caixa) {
      const a = T(this.caixa.x0, this.caixa.y0), b = T(this.caixa.x1, this.caixa.y1);
      ctx.fillStyle = "rgba(47,155,255,0.10)"; ctx.strokeStyle = "#2f9bff"; ctx.lineWidth = 1;
      ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    }
  }
}
