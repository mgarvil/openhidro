// Painel direito: opções da ferramenta (biblioteca de pontos), propriedades da seleção e resultados.
import type { Editor } from "../editor";
import { APARELHOS, NOMES_TIPO, SIGLAS, TUBOS_PVC, aparelho, type Elemento } from "../modelo/elementos";
import type { Projeto } from "../projeto";

type Executar = (nome: string, args?: unknown) => Promise<unknown>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const num = (v: string) => Number(v.trim().replace(",", "."));
const f = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const vf = (v: number | null | undefined) => (v == null ? "" : String(+v.toFixed(3)).replace(".", ","));

export class Paineis {
  constructor(private editor: Editor, private projeto: () => Projeto, private executar: Executar,
              private irPara: (ids: string[]) => void,
              private elFerr: HTMLElement, private elProp: HTMLElement, private elRes: HTMLElement) {}

  atualizarTudo() { this.ferramenta(); this.propriedades(); this.resultados(); }

  // ------------------------------------------------------------ ferramenta
  ferramenta() {
    const ed = this.editor, o = ed.opcoes, el = this.elFerr;
    const pavs = this.projeto().pavimentos;
    switch (ed.ferramenta) {
      case "aparelho": {
        const ap = aparelho(o.aparelho);
        el.innerHTML = `<h2>Ponto de utilização</h2>
          <ul class="biblioteca">${APARELHOS.map((a) => `<li data-chave="${a.chave}" class="${a.chave === o.aparelho ? "ativo" : ""}" title="Peso ${f(a.peso, 1)} · ${f(a.vazao_ls)} L/s">
            <span class="sigla">${SIGLAS[a.chave] ?? ""}</span>${esc(a.descricao)}</li>`).join("")}</ul>
          <div class="form">
            <label>Altura do ponto (m)</label><input name="alturaAparelho" value="${vf(o.alturaAparelho ?? ap?.altura_m)}" />
            <span class="info">Altura acima do piso. Padrão do aparelho: ${vf(ap?.altura_m)} m.</span>
          </div>`;
        el.querySelectorAll<HTMLElement>(".biblioteca li").forEach((li) => li.addEventListener("click", () => {
          o.aparelho = li.dataset.chave!; o.alturaAparelho = null; this.ferramenta();
        }));
        break;
      }
      case "tubo":
        el.innerHTML = `<h2>Tubulação — água fria</h2><div class="form">
          <label>Altura do tubo (m)</label><input name="alturaTubo" value="${vf(o.alturaTubo)}" />
          <span class="info">Altura acima do piso do pavimento (ex.: 2,60 no forro, 0,30 no piso). A descida até cada ponto é gerada no cálculo.</span>
          <label>Material</label><select disabled><option>PVC soldável</option></select></div>`;
        break;
      case "reservatorio":
        el.innerHTML = `<h2>Reservatório</h2><div class="form">
          <label>Saída acima do piso (m)</label><input name="alturaReservatorio" value="${vf(o.alturaReservatorio)}" />
          <label>Lâmina d'água (m)</label><input name="nivelAgua" value="${vf(o.nivelAgua)}" />
          <span class="info">A lâmina é a altura de água acima da saída considerada no cálculo. Use 0 para o caso mais desfavorável (reservatório quase vazio).</span></div>`;
        break;
      case "coluna": {
        const a = ed.pavAtivo;
        el.innerHTML = `<h2>Coluna</h2><div class="form">
          <label>De</label><input value="${esc(a.nome)}" disabled />
          <label>Até</label><select name="colunaTopo">${pavs.filter((p) => p.id !== a.id).map((p) =>
            `<option value="${p.id}" ${p.id === (o.colunaTopo ?? pavs[pavs.indexOf(a) + 1]?.id) ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select>
          <span class="info">Lance a coluna no ponto onde os tubos de cada pavimento chegam (use o snap na ponta do tubo).</span></div>`;
        break;
      }
      default:
        el.innerHTML = "";
    }
    el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]").forEach((inp) =>
      inp.addEventListener("change", () => {
        const k = inp.name as keyof typeof o;
        if (k === "colunaTopo" || k === "aparelho") (o as any)[k] = inp.value;
        else { const v = num(inp.value); if (isFinite(v)) (o as any)[k] = v; else inp.value = vf((o as any)[k]); }
        if (k === "alturaTubo") this.projeto().config.alturaTubo = o.alturaTubo;
      }));
  }

  // ---------------------------------------------------------- propriedades
  propriedades() {
    const sel = this.editor.selecionados, el = this.elProp;
    if (!sel.length) { el.innerHTML = ""; return; }
    const tipos = new Set(sel.map((e) => e.tipo));
    const ids = sel.map((e) => e.id);
    const um = sel.length === 1 ? sel[0] : null;
    const comum = <K extends string>(k: K) => {
      const vs = new Set(sel.map((e) => (e as any)[k]));
      return vs.size === 1 ? [...vs][0] : null;
    };
    let campos = "";
    if (tipos.size === 1) {
      const t = [...tipos][0];
      if (t === "aparelho") {
        campos = `<label>Aparelho</label><select name="chave">${um ? "" : `<option value="">(vários)</option>`}${APARELHOS.map((a) =>
          `<option value="${a.chave}" ${comum("chave") === a.chave ? "selected" : ""}>${esc(a.descricao)}</option>`).join("")}</select>
          <label>Altura (m)</label><input name="altura" value="${vf(comum("altura"))}" />
          <label>Quantidade</label><input name="quantidade" value="${vf(comum("quantidade"))}" />`;
      } else if (t === "tubo") {
        const comp = sel.reduce((s, e) => s + (e.tipo === "tubo" ? Math.hypot(e.x2 - e.x1, e.y2 - e.y1) : 0), 0) * this.projeto().config.escalaMetro;
        const dn = comum("dn");
        campos = `<label>Altura (m)</label><input name="altura" value="${vf(comum("altura"))}" />
          <label>Diâmetro</label><select name="dn"><option value="">Calculado</option>${TUBOS_PVC.map((t) =>
            `<option value="${t.dn}" ${dn === t.dn ? "selected" : ""}>DN ${t.dn} (${t.referencia})</option>`).join("")}</select>
          <span class="info">Comprimento em planta: ${f(comp)} m. Diâmetro fixado é verificado, não alterado, no cálculo.</span>`;
      } else if (t === "reservatorio") {
        campos = `<label>Saída acima do piso (m)</label><input name="altura" value="${vf(comum("altura"))}" />
          <label>Lâmina d'água (m)</label><input name="nivelAgua" value="${vf(comum("nivelAgua"))}" />`;
      } else if (t === "coluna") {
        const pavs = this.projeto().pavimentos;
        campos = `<label>Até o pavimento</label><select name="topoId">${pavs.map((p) =>
          `<option value="${p.id}" ${comum("topoId") === p.id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select>`;
      }
      if (um) campos = `<label>Rótulo</label><input name="rotulo" value="${esc(um.rotulo ?? "")}" placeholder="automático" />` + campos;
    }
    const titulo = um ? NOMES_TIPO[um.tipo] + (um.tipo === "aparelho" ? ` — ${SIGLAS[um.chave] ?? ""}` : "")
                      : `${sel.length} elementos selecionados`;
    el.innerHTML = `<h2>${esc(titulo)}</h2><div class="form">${campos}</div>
      <div class="acoes-painel"><button data-a="ir">Mostrar</button><button data-a="excluir" class="perigo">Excluir (Del)</button></div>`;
    el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]").forEach((inp) =>
      inp.addEventListener("change", () => {
        const k = inp.name;
        let v: unknown = inp.value;
        if (k === "dn") v = inp.value ? Number(inp.value) : null;
        else if (k === "chave" && !inp.value) return;
        else if (["altura", "quantidade", "nivelAgua"].includes(k)) {
          const n = num(inp.value);
          if (!isFinite(n) || (k === "quantidade" && n <= 0)) { this.propriedades(); return; }
          v = n;
        }
        this.executar("alterarElementos", { ids, dados: { [k]: v } });
      }));
    el.querySelector('[data-a="excluir"]')!.addEventListener("click", () => this.executar("excluirElementos", { ids }));
    el.querySelector('[data-a="ir"]')!.addEventListener("click", () => this.irPara(ids));
  }

  // ------------------------------------------------------------ resultados
  resultados() {
    const r = this.editor.resultado, el = this.elRes;
    if (!r) {
      const n = this.projeto().elementos.length;
      el.innerHTML = n ? `<h2>Cálculo</h2><div class="vazio-painel">Lance reservatório, tubos e pontos e clique em <b>Calcular</b> (F5).</div>` : `<h2>Como começar</h2>
        <div class="vazio-painel">1. Importe a planta do pavimento.<br>2. <b>Reservatório</b>: clique onde sai a água.<br>
        3. <b>Tubo</b>: desenhe do reservatório até os ambientes.<br>4. <b>Ponto</b>: escolha o aparelho e clique na ponta do tubo.<br>
        5. <b>Calcular</b>: o programa escolhe os diâmetros e confere as pressões.</div>`;
      return;
    }
    const falhas = r.trechos.filter((t) => !t.ok).length + r.pontos.filter((p) => !p.ok).length + r.erros.length;
    const problemas = [...r.erros.map((e) => ({ ...e, classe: "" })), ...r.avisos.map((e) => ({ ...e, classe: "aviso" }))];
    const alertas = r.alertas.filter((a) => !a.startsWith("AVISO trecho") || true);
    el.innerHTML = `<h2>Resultado — NBR 5626</h2>
      <div class="resumo">${r.redes.length} rede(s) · ${r.trechos.length} trechos · ${r.pontos.length} pontos<br>
        ${falhas ? `<span class="falha">${falhas} pendência(s)</span>` : `<span class="ok">Todos os pontos atendidos</span>`}</div>
      ${problemas.length ? `<ul class="problemas">${problemas.map((p, i) => `<li class="${p.classe}" data-p="${i}">${esc(p.mensagem)}</li>`).join("")}</ul>` : ""}
      ${alertas.length ? `<ul class="problemas">${alertas.map((a) => `<li class="${a.startsWith("ERRO") ? "" : "aviso"}">${esc(a)}</li>`).join("")}</ul>` : ""}
      ${r.pontos.length ? `<table class="tab"><thead><tr><th>Ponto</th><th>P (kPa)</th><th>Mín.</th></tr></thead><tbody>
        ${r.pontos.map((p) => `<tr class="${p.ok ? "" : "ruim"}" data-el="${p.el}"><td>${esc(p.no)}</td><td>${f(p.pd, 1)}</td><td>${p.pmin ?? "—"}</td></tr>`).join("")}
        </tbody></table><br>` : ""}
      ${r.trechos.length ? `<table class="tab"><thead><tr><th>Trecho</th><th>DN</th><th>Q (L/s)</th><th>v (m/s)</th><th>hf (m)</th></tr></thead><tbody>
        ${r.trechos.map((t) => `<tr class="${t.ok ? "" : "ruim"}" data-rede="${t.rede}" data-t="${t.id}" title="${esc(t.de)} → ${esc(t.para)} · L = ${f(t.L)} m">
          <td>${esc(t.id)} <span style="color:#5a6370">${esc(t.para)}</span></td><td>${t.dn}</td><td>${f(t.q)}</td><td>${f(t.v)}</td><td>${f(t.hf, 3)}</td></tr>`).join("")}
        </tbody></table>` : ""}
      <div class="ressalva">Cálculo preliminar pelo método da soma dos pesos. A responsabilidade técnica é do engenheiro, que deve conferir critérios e tabelas com a norma vigente.</div>`;
    el.querySelectorAll<HTMLElement>("[data-p]").forEach((li) => li.addEventListener("click", () => this.irPara(problemas[+li.dataset.p!].elementos)));
    el.querySelectorAll<HTMLElement>("tr[data-el]").forEach((tr) => tr.addEventListener("click", () => this.irPara([tr.dataset.el!])));
    el.querySelectorAll<HTMLElement>("tr[data-t]").forEach((tr) => tr.addEventListener("click", () => {
      const m = r.redes.find((x) => x.montada.id === tr.dataset.rede)?.montada.trechos.find((x) => x.id === tr.dataset.t);
      if (m) this.irPara(m.elementos);
    }));
  }
}

export type { Elemento };
