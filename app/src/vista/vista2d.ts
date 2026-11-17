// Vista 2D da planta: Three.js (câmera ortográfica) para a geometria e um canvas 2D por cima para
// os textos. As coordenadas do desenho são deslocadas por uma origem local para manter precisão
// em float32 (desenhos georreferenciados têm coordenadas enormes).
import * as THREE from "three";
import type { CamadaDesenho, Desenho, Texto } from "../dxf/carregar";

export interface EstadoVista { cx: number; cy: number; escala: number } // escala = px por unidade

export class Vista2D {
  readonly renderer: THREE.WebGLRenderer;
  readonly cena = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private origem = { x: 0, y: 0 };
  private desenho: Desenho | null = null;
  private objetos = new Map<string, THREE.LineSegments>();
  private visiveis = new Set<string>();
  private cx = 0; // centro da vista em coordenadas locais
  private cy = 0;
  private escala = 1;
  private largura = 1;
  private altura = 1;
  private pendente = false;
  onCursor: (x: number, y: number) => void = () => {};
  onMudouVista: () => void = () => {};
  /** Ferramentas de lançamento: coordenadas do desenho e da tela (px). */
  onEsquerdoBaixo: (x: number, y: number, px: number, py: number, e: PointerEvent) => void = () => {};
  onEsquerdoCima: (x: number, y: number, px: number, py: number, e: PointerEvent) => void = () => {};
  onMover: (x: number, y: number, px: number, py: number, e: PointerEvent) => void = () => {};
  onDireito: (x: number, y: number) => void = () => {};
  /** Desenha os elementos do projeto por cima da planta (canvas 2D). */
  sobreposicao: ((ctx: CanvasRenderingContext2D) => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x15191f);
    host.appendChild(this.renderer.domElement);
    this.overlay = document.createElement("canvas");
    this.overlay.className = "overlay";
    host.appendChild(this.overlay);
    this.ctx = this.overlay.getContext("2d")!;
    new ResizeObserver(() => this.redimensionar()).observe(host);
    this.instalarControles();
    this.redimensionar();
  }

  // ------------------------------------------------------------------ dados
  definirDesenho(d: Desenho | null) {
    for (const o of this.objetos.values()) {
      this.cena.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.objetos.clear();
    this.desenho = d;
    if (!d) { this.agendar(); return; }
    const e = d.extensaoPrincipal;
    this.origem = { x: (e.xmin + e.xmax) / 2, y: (e.ymin + e.ymax) / 2 };
    for (const c of d.camadas.values()) {
      if (!c.segmentos.length) continue;
      const pos = new Float32Array((c.segmentos.length / 2) * 3);
      for (let i = 0, j = 0; i < c.segmentos.length; i += 2, j += 3) {
        pos[j] = c.segmentos[i] - this.origem.x;
        pos[j + 1] = c.segmentos[i + 1] - this.origem.y;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: corLegivel(c.cor) }));
      obj.frustumCulled = false;
      this.objetos.set(c.nome, obj);
      this.cena.add(obj);
    }
    this.visiveis = new Set(d.camadas.keys());
    this.zoomExtensao();
  }

  definirVisivel(camada: string, visivel: boolean) {
    const o = this.objetos.get(camada);
    if (o) o.visible = visivel;
    if (visivel) this.visiveis.add(camada); else this.visiveis.delete(camada);
    this.agendar();
  }

  // --------------------------------------------------------------- câmera
  zoomExtensao() {
    if (!this.desenho) return;
    const e = this.desenho.extensaoPrincipal;
    const w = Math.max(e.xmax - e.xmin, 1e-6), h = Math.max(e.ymax - e.ymin, 1e-6);
    this.cx = (e.xmin + e.xmax) / 2 - this.origem.x;
    this.cy = (e.ymin + e.ymax) / 2 - this.origem.y;
    this.escala = 0.92 * Math.min(this.largura / w, this.altura / h);
    this.agendar();
  }

  get estado(): EstadoVista {
    return { cx: this.cx + this.origem.x, cy: this.cy + this.origem.y, escala: this.escala };
  }

  restaurar(v: EstadoVista) {
    this.cx = v.cx - this.origem.x;
    this.cy = v.cy - this.origem.y;
    this.escala = v.escala;
    this.agendar();
  }

  paraTela(x: number, y: number): [number, number] {
    return [(x - this.origem.x - this.cx) * this.escala + this.largura / 2,
            -(y - this.origem.y - this.cy) * this.escala + this.altura / 2];
  }

  /** pixels por unidade do desenho */
  get pxPorUnidade() { return this.escala; }
  get tamanho() { return { largura: this.largura, altura: this.altura }; }
  redesenhar() { this.agendar(); }

  /** Enquadra um retângulo (coordenadas do desenho). */
  enquadrar(xmin: number, ymin: number, xmax: number, ymax: number, margem = 1.3) {
    const w = Math.max(xmax - xmin, 1e-6), h = Math.max(ymax - ymin, 1e-6);
    this.cx = (xmin + xmax) / 2 - this.origem.x;
    this.cy = (ymin + ymax) / 2 - this.origem.y;
    this.escala = Math.min(this.largura / (w * margem), this.altura / (h * margem));
    this.agendar();
  }

  telaParaDesenho(px: number, py: number): [number, number] {
    const x = this.cx + (px - this.largura / 2) / this.escala;
    const y = this.cy - (py - this.altura / 2) / this.escala;
    return [x + this.origem.x, y + this.origem.y];
  }

  private redimensionar() {
    const r = this.host.getBoundingClientRect();
    this.largura = Math.max(1, r.width);
    this.altura = Math.max(1, r.height);
    this.renderer.setSize(this.largura, this.altura);
    const dpr = window.devicePixelRatio;
    this.overlay.width = this.largura * dpr;
    this.overlay.height = this.altura * dpr;
    this.overlay.style.width = `${this.largura}px`;
    this.overlay.style.height = `${this.altura}px`;
    this.agendar();
  }

  private instalarControles() {
    const el = this.host;
    let arrastando = false;
    let ultimo = { x: 0, y: 0 };
    let espaco = false;
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) { espaco = true; el.style.cursor = "grab"; e.preventDefault(); }
    });
    window.addEventListener("keyup", (e) => { if (e.code === "Space") { espaco = false; el.style.cursor = ""; } });

    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const [ax, ay] = this.telaParaDesenho(px, py);
      const f = Math.exp(-e.deltaY * 0.0015);
      this.escala = Math.min(1e7, Math.max(1e-7, this.escala * f));
      // mantém o ponto sob o cursor fixo
      this.cx = ax - this.origem.x - (px - this.largura / 2) / this.escala;
      this.cy = ay - this.origem.y + (py - this.altura / 2) / this.escala;
      this.agendar();
    }, { passive: false });

    let inicioDireito: { x: number; y: number } | null = null;
    let movido = 0;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const [x, y] = this.telaParaDesenho(px, py);
      return { x, y, px, py };
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button === 0 && !espaco) {
        const l = local(e);
        el.setPointerCapture(e.pointerId);
        this.onEsquerdoBaixo(l.x, l.y, l.px, l.py, e);
        return;
      }
      if (e.button === 1 || e.button === 2 || (e.button === 0 && espaco)) {
        arrastando = true;
        movido = 0;
        inicioDireito = e.button === 2 ? { x: e.clientX, y: e.clientY } : null;
        ultimo = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
        el.style.cursor = "grabbing";
        e.preventDefault();
      }
    });
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const [x, y] = this.telaParaDesenho(e.clientX - r.left, e.clientY - r.top);
      this.onCursor(x, y);
      if (!arrastando) { this.onMover(x, y, e.clientX - r.left, e.clientY - r.top, e); return; }
      movido += Math.abs(e.clientX - ultimo.x) + Math.abs(e.clientY - ultimo.y);
      this.cx -= (e.clientX - ultimo.x) / this.escala;
      this.cy += (e.clientY - ultimo.y) / this.escala;
      ultimo = { x: e.clientX, y: e.clientY };
      this.agendar();
    });
    const soltar = (e: PointerEvent) => {
      if (e.button === 0 && !arrastando) {
        const l = local(e);
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        this.onEsquerdoCima(l.x, l.y, l.px, l.py, e);
        return;
      }
      if (!arrastando) return;
      arrastando = false;
      if (inicioDireito && movido < 5) { const l = local(e); this.onDireito(l.x, l.y); }
      inicioDireito = null;
      el.releasePointerCapture(e.pointerId);
      el.style.cursor = espaco ? "grab" : "";
    };
    el.addEventListener("pointerup", soltar);
    el.addEventListener("pointercancel", soltar);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    // duplo clique no botão do meio = zoom extensão (hábito do AutoCAD)
    let ultimoMeio = 0;
    el.addEventListener("mousedown", (e) => {
      if (e.button !== 1) return;
      const t = performance.now();
      if (t - ultimoMeio < 350) this.zoomExtensao();
      ultimoMeio = t;
    });
  }

  // ------------------------------------------------------------- desenho
  private agendar() {
    if (this.pendente) return;
    this.pendente = true;
    requestAnimationFrame(() => { this.pendente = false; this.render(); });
  }

  private render() {
    const w2 = this.largura / 2 / this.escala, h2 = this.altura / 2 / this.escala;
    this.camera.left = this.cx - w2;
    this.camera.right = this.cx + w2;
    this.camera.top = this.cy + h2;
    this.camera.bottom = this.cy - h2;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.cena, this.camera);
    this.desenharTextos();
    if (this.sobreposicao) {
      const dpr = window.devicePixelRatio;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.save();
      this.sobreposicao(this.ctx);
      this.ctx.restore();
    }
    this.onMudouVista();
  }

  private desenharTextos() {
    const ctx = this.ctx, dpr = window.devicePixelRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.largura, this.altura);
    if (!this.desenho) return;
    const [x0, y1] = this.telaParaDesenho(0, 0);
    const [x1, y0] = this.telaParaDesenho(this.largura, this.altura);
    let n = 0;
    ctx.textBaseline = "alphabetic";
    for (const c of this.desenho.camadas.values()) {
      if (!this.visiveis.has(c.nome) || !c.textos.length) continue;
      ctx.fillStyle = "#" + corLegivel(c.cor).toString(16).padStart(6, "0");
      for (const t of c.textos) {
        const hpx = t.altura * this.escala;
        if (hpx < 3.5) continue;
        if (t.x < x0 - t.altura * 40 || t.x > x1 || t.y < y0 - t.altura * 2 || t.y > y1 + t.altura * 40) continue;
        if (++n > 4000) return;
        this.texto(t, hpx);
      }
    }
  }

  private texto(t: Texto, hpx: number) {
    const ctx = this.ctx;
    const px = (t.x - this.origem.x - this.cx) * this.escala + this.largura / 2;
    const py = -(t.y - this.origem.y - this.cy) * this.escala + this.altura / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-t.rotacao);
    ctx.font = `${hpx.toFixed(1)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(t.texto, 0, 0);
    ctx.restore();
  }

  camadasDoDesenho(): CamadaDesenho[] {
    return this.desenho ? [...this.desenho.camadas.values()] : [];
  }
}

// Cores muito escuras ficam invisíveis no fundo escuro: clareia.
function corLegivel(cor: number): number {
  const r = (cor >> 16) & 255, g = (cor >> 8) & 255, b = cor & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum >= 70) return cor;
  const f = 70 / Math.max(lum, 1);
  const c = (v: number) => Math.min(255, Math.round(v * f + 40));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}
