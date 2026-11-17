// Painel de camadas: lista com visibilidade, cor e filtro.
import type { CamadaDesenho } from "../dxf/carregar";

const OLHO = `<svg class="olho" viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>`;

export class PainelCamadas {
  private ocultas = new Set<string>();
  private camadas: CamadaDesenho[] = [];
  onMudou: (camada: string, visivel: boolean) => void = () => {};

  constructor(private lista: HTMLUListElement, private filtro: HTMLInputElement,
              private contador: HTMLElement, todasOn: HTMLButtonElement, todasOff: HTMLButtonElement) {
    filtro.addEventListener("input", () => this.render());
    todasOn.addEventListener("click", () => this.definirTodas(true));
    todasOff.addEventListener("click", () => this.definirTodas(false));
    lista.addEventListener("click", (e) => {
      const li = (e.target as HTMLElement).closest("li");
      if (!li) return;
      const nome = li.dataset.nome!;
      if ((e as MouseEvent).altKey) {
        // Alt+clique: isola a camada
        for (const c of this.camadas) this.definir(c.nome, c.nome === nome);
      } else {
        this.definir(nome, this.ocultas.has(nome));
      }
      this.render();
    });
  }

  carregar(camadas: CamadaDesenho[], ocultas: string[] = []) {
    this.camadas = camadas.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    this.ocultas = new Set();
    for (const n of ocultas) if (camadas.some((c) => c.nome === n)) this.definir(n, false);
    this.render();
  }

  get camadasOcultas(): string[] { return [...this.ocultas]; }

  private definir(nome: string, visivel: boolean) {
    if (visivel) this.ocultas.delete(nome); else this.ocultas.add(nome);
    this.onMudou(nome, visivel);
  }

  private definirTodas(visivel: boolean) {
    const f = this.filtro.value.trim().toLowerCase();
    for (const c of this.camadas) if (!f || c.nome.toLowerCase().includes(f)) this.definir(c.nome, visivel);
    this.render();
  }

  private render() {
    const f = this.filtro.value.trim().toLowerCase();
    const vis = this.camadas.filter((c) => !f || c.nome.toLowerCase().includes(f));
    this.contador.textContent = this.camadas.length ? `${this.camadas.length - this.ocultas.size}/${this.camadas.length} visíveis` : "";
    this.lista.innerHTML = vis.map((c) => {
      const n = c.segmentos.length / 4 + c.textos.length;
      const cor = "#" + c.cor.toString(16).padStart(6, "0");
      return `<li data-nome="${esc(c.nome)}" class="${this.ocultas.has(c.nome) ? "oculta" : ""}" title="${esc(c.nome)} — clique: mostrar/ocultar · Alt+clique: isolar">
        ${OLHO}<span class="cor" style="background:${cor}"></span><span class="nome">${esc(c.nome)}</span><span class="qtd">${fmt(n)}</span></li>`;
    }).join("");
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
