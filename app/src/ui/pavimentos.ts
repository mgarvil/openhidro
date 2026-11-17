// Painel de pavimentos: lista (de cima para baixo, como num corte), troca do pavimento ativo,
// adicionar, editar (nome, cota, pé-direito) e excluir.
import type { Pavimento } from "../projeto";

export interface AcoesPavimentos {
  ativar(id: string): void;
  adicionar(): void;
  editar(id: string, dados: { nome: string; cota: number; peDireito: number }): void;
  excluir(id: string): void;
}

const fmt = (v: number) => (v >= 0 ? "+" : "") + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export class PainelPavimentos {
  private editando: string | null = null;
  private pavs: Pavimento[] = [];
  private ativo = "";

  constructor(private lista: HTMLUListElement, botaoAdicionar: HTMLButtonElement, private acoes: AcoesPavimentos) {
    botaoAdicionar.addEventListener("click", () => acoes.adicionar());
    lista.addEventListener("click", (e) => {
      const alvo = e.target as HTMLElement;
      const li = alvo.closest("li");
      if (!li) return;
      const id = li.dataset.id!;
      if (alvo.closest(".editar")) { this.editando = id; this.render(); return; }
      if (alvo.closest(".excluir")) { acoes.excluir(id); return; }
      if (alvo.closest(".ok")) { this.salvar(li, id); return; }
      if (alvo.closest(".cancelar")) { this.editando = null; this.render(); return; }
      if (alvo.closest("input")) return;
      if (this.editando !== id) acoes.ativar(id);
    });
    lista.addEventListener("dblclick", (e) => {
      const li = (e.target as HTMLElement).closest("li");
      if (li && !this.editando) { this.editando = li.dataset.id!; this.render(); }
    });
    lista.addEventListener("keydown", (e) => {
      const li = (e.target as HTMLElement).closest("li");
      if (!li) return;
      if (e.key === "Enter") this.salvar(li, li.dataset.id!);
      if (e.key === "Escape") { this.editando = null; this.render(); }
    });
  }

  carregar(pavs: Pavimento[], ativo: string) {
    this.pavs = pavs;
    this.ativo = ativo;
    if (this.editando && !pavs.some((p) => p.id === this.editando)) this.editando = null;
    this.render();
  }

  editar(id: string) { this.editando = id; this.render(); }

  private salvar(li: HTMLElement, id: string) {
    const v = (n: string) => (li.querySelector(`[name=${n}]`) as HTMLInputElement).value;
    const num = (s: string) => Number(s.replace(",", "."));
    const nome = v("nome").trim(), cota = num(v("cota")), peDireito = num(v("pe"));
    if (!nome || !isFinite(cota) || !isFinite(peDireito) || peDireito <= 0) return;
    this.editando = null;
    this.acoes.editar(id, { nome, cota, peDireito });
  }

  private render() {
    const pavs = this.pavs.slice().reverse(); // de cima para baixo
    this.lista.innerHTML = pavs.map((p) => {
      const ativo = p.id === this.ativo ? "ativo" : "";
      if (p.id === this.editando) {
        return `<li data-id="${p.id}" class="${ativo} editando">
          <input name="nome" value="${esc(p.nome)}" placeholder="Nome" />
          <label>Cota <input name="cota" value="${String(p.cota).replace(".", ",")}" /> m</label>
          <label>Pé-direito <input name="pe" value="${String(p.peDireito).replace(".", ",")}" /> m</label>
          <span class="acoes"><button class="ok">OK</button><button class="cancelar">Cancelar</button></span></li>`;
      }
      return `<li data-id="${p.id}" class="${ativo}" title="Clique para trabalhar neste pavimento · duplo clique para editar">
        <span class="marcador"></span>
        <span class="nome">${esc(p.nome)}</span>
        <span class="cota">${fmt(p.cota)}</span>
        <span class="fundo-ico" title="${p.fundo ? "Planta: " + esc(p.fundo.nome) : "Sem planta de fundo"}">${p.fundo ? "▣" : "□"}</span>
        <button class="mini editar" title="Editar">✎</button>
        <button class="mini excluir" title="Excluir pavimento">✕</button></li>`;
    }).join("");
    const inp = this.lista.querySelector<HTMLInputElement>(".editando input[name=nome]");
    inp?.focus();
    inp?.select();
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
