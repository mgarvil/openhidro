import { carregarDxf, decodificarDxf, type Desenho } from "./dxf/carregar";
import * as C from "./comandos";
import { escolherArquivo, lerCaminho, salvarTexto } from "./plataforma";
import { lerProjeto, novoPavimento, novoProjeto, ordenarPavimentos, serializar, type Pavimento, type Projeto } from "./projeto";
import { PainelCamadas } from "./ui/camadas";
import { PainelPavimentos } from "./ui/pavimentos";
import { Vista2D } from "./vista/vista2d";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const area = $("area");
const vista = new Vista2D(area);
const painel = new PainelCamadas($("listaCamadas"), $("filtroCamadas"), $("contCamadas"), $("todasOn"), $("todasOff"));
let projeto: Projeto = novoProjeto();
let caminhoProjeto: string | null = null;
/** Plantas de fundo já lidas, por pavimento (não vão para o .ohp; só o caminho vai). */
const desenhos = new Map<string, Desenho>();
let desenho: Desenho | null = null;   // o do pavimento ativo
let alterado = false;

const ativo = (): Pavimento => projeto.pavimentos.find((p) => p.id === projeto.pavimentoAtivo) ?? projeto.pavimentos[0];
const pav = (id: string) => {
  const p = projeto.pavimentos.find((x) => x.id === id || x.nome.toLowerCase() === String(id).toLowerCase());
  if (!p) throw new Error(`Pavimento "${id}" não existe`);
  return p;
};

// ----------------------------------------------------------------- status
const fmtN = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const fmtCota = (v: number) => (v >= 0 ? "+" : "") + fmtN(v);
vista.onCursor = (x, y) => { $("coord").textContent = `x ${fmtN(x)}   y ${fmtN(y)}`; };
vista.onMudouVista = () => { if (desenho) ativo().vista = vista.estado; };
let temporizador = 0;
function mensagem(t: string, erro = false) {
  const el = $("mensagem");
  el.textContent = t;
  el.classList.toggle("erro", erro);
  clearTimeout(temporizador);
  if (!erro) temporizador = window.setTimeout(() => (el.textContent = ""), 6000);
}
function atualizarTitulo() {
  const a = ativo();
  $("titulo").textContent = `${projeto.nome}${alterado ? " •" : ""}  —  ${a.nome}${desenho ? "  ·  " + desenho.nome : ""}`;
  document.title = `${projeto.nome}${alterado ? " •" : ""} — OpenHidro`;
  $("pavAtivo").textContent = `${a.nome}  ${fmtCota(a.cota)} m`;
}
painel.onMudou = (camada, visivel) => {
  vista.definirVisivel(camada, visivel);
  const a = ativo();
  if (a.fundo) a.fundo.camadasOcultas = painel.camadasOcultas;
  marcarAlterado();
};
function marcarAlterado() { alterado = true; atualizarTitulo(); }

function mostrarInfo(d: Desenho | null) {
  const el = $("infoDesenho");
  $("unidade").textContent = d ? `unidade: ${d.unidade}` : "";
  if (!d) { el.innerHTML = ""; return; }
  const e = d.extensao;
  el.innerHTML = `<h2>Planta de fundo</h2>
    <b>${esc(d.nome)}</b><br>
    ${d.camadas.size} camadas · ${d.totalSegmentos.toLocaleString("pt-BR")} segmentos<br>
    Unidade: ${d.unidade}<br>
    Extensão: ${fmtN(e.xmax - e.xmin)} × ${fmtN(e.ymax - e.ymin)}
    ${d.avisos.map((a) => `<div class="aviso">⚠ ${esc(a)}</div>`).join("")}`;
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

// ------------------------------------------------------------- pavimentos
const painelPavs = new PainelPavimentos($("listaPavimentos"), $("addPavimento"), {
  ativar: (id) => C.executar("ativarPavimento", { pavimento: id }),
  adicionar: () => C.executar("adicionarPavimento"),
  editar: (id, dados) => C.executar("editarPavimento", { pavimento: id, ...dados }),
  excluir: (id) => C.executar("excluirPavimento", { pavimento: id }),
});
const atualizarPavs = () => painelPavs.carregar(projeto.pavimentos, projeto.pavimentoAtivo);

/** Mostra na tela o pavimento ativo: sua planta, camadas ocultas e enquadramento. */
function mostrarPavimentoAtivo() {
  const a = ativo();
  desenho = desenhos.get(a.id) ?? null;
  vista.definirDesenho(desenho);
  const ocultas = a.fundo?.camadasOcultas ?? [];
  painel.carregar(desenho ? [...desenho.camadas.values()] : [], ocultas);
  if (desenho) for (const n of ocultas) vista.definirVisivel(n, false);
  if (desenho && a.vista) vista.restaurar(a.vista);
  $("vazio").hidden = !!desenho;
  $("vazio").querySelector("h1")!.textContent = `${a.nome}: importe a planta de arquitetura deste pavimento`;
  mostrarInfo(desenho);
  atualizarPavs();
  atualizarTitulo();
}

function ativarPavimento(id: string) {
  if (desenho) ativo().vista = vista.estado;   // guarda o enquadramento do pavimento que sai
  projeto.pavimentoAtivo = pav(id).id;
  mostrarPavimentoAtivo();
}

// -------------------------------------------------------------- operações
async function abrirDesenho(bytes: Uint8Array, nome: string, caminho: string | null, alvo: Pavimento = ativo(),
                            ocultas: string[] = []) {
  const carregando = $("carregando");
  carregando.textContent = `Lendo ${nome} (${alvo.nome})…`;
  carregando.hidden = false;
  await new Promise((r) => setTimeout(r, 30)); // deixa a mensagem aparecer
  try {
    const t0 = performance.now();
    const d = carregarDxf(decodificarDxf(bytes), nome);
    desenhos.set(alvo.id, d);
    const trocouPlanta = alvo.fundo?.nome !== nome;
    alvo.fundo = { nome, caminho, camadasOcultas: ocultas };
    if (trocouPlanta) alvo.vista = null;
    if (alvo.id === projeto.pavimentoAtivo) mostrarPavimentoAtivo(); else atualizarPavs();
    mensagem(`${nome} aberto em ${alvo.nome} em ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    return true;
  } catch (e: any) {
    mensagem(`Não consegui ler ${nome}: ${e?.message ?? e}`, true);
    return false;
  } finally {
    carregando.hidden = true;
    atualizarTitulo();
  }
}

C.registrar({ nome: "importarFundo", descricao: "Importa uma planta DXF como fundo do pavimento ativo", async executar() {
  const a = ativo();
  const arq = await escolherArquivo(["dxf"], `Planta de arquitetura do ${a.nome} (DXF)`);
  if (!arq) return;
  if (await abrirDesenho(arq.bytes, arq.nome, arq.caminho, a)) marcarAlterado();
} });

C.registrar({ nome: "zoomExtensao", descricao: "Mostra o desenho inteiro", executar: () => vista.zoomExtensao() });

C.registrar({ nome: "ativarPavimento", descricao: "Torna ativo um pavimento (id ou nome)",
  executar: (args?: any) => ativarPavimento(args?.pavimento) });

C.registrar({ nome: "adicionarPavimento", descricao: "Cria um pavimento acima do último (ou com nome/cota/pé-direito dados)",
  executar(args?: any) {
    const topo = projeto.pavimentos[projeto.pavimentos.length - 1];
    const n = projeto.pavimentos.length;
    const p = novoPavimento(args?.nome ?? `${n}º Pavimento`, args?.cota ?? +(topo.cota + topo.peDireito).toFixed(3),
                            args?.peDireito ?? topo.peDireito);
    projeto.pavimentos.push(p);
    ordenarPavimentos(projeto);
    marcarAlterado();
    ativarPavimento(p.id);
    if (!args) painelPavs.editar(p.id);   // pelo mouse: já abre para dar nome e cota
    return p.id;
  } });

C.registrar({ nome: "editarPavimento", descricao: "Altera nome, cota ou pé-direito de um pavimento",
  executar(args?: any) {
    const p = pav(args?.pavimento);
    if (args.nome != null) p.nome = String(args.nome);
    if (args.cota != null) p.cota = Number(args.cota);
    if (args.peDireito != null) p.peDireito = Number(args.peDireito);
    ordenarPavimentos(projeto);
    marcarAlterado();
    atualizarPavs();
  } });

C.registrar({ nome: "excluirPavimento", descricao: "Exclui um pavimento (o projeto mantém pelo menos um)",
  executar(args?: any) {
    const p = pav(args?.pavimento);
    if (projeto.pavimentos.length === 1) { mensagem("O projeto precisa ter pelo menos um pavimento.", true); return; }
    if (!args?.semConfirmar && !confirmar(`Excluir o pavimento "${p.nome}" e tudo o que foi lançado nele?`)) return;
    projeto.pavimentos = projeto.pavimentos.filter((x) => x !== p);
    projeto.elementos = projeto.elementos.filter((e: any) => e?.pavimentoId !== p.id);
    desenhos.delete(p.id);
    if (projeto.pavimentoAtivo === p.id) projeto.pavimentoAtivo = projeto.pavimentos[0].id;
    marcarAlterado();
    mostrarPavimentoAtivo();
  } });

C.registrar({ nome: "novo", descricao: "Cria um projeto novo", async executar() {
  if (alterado && !confirmar("Descartar as alterações do projeto atual?")) return;
  projeto = novoProjeto();
  caminhoProjeto = null;
  desenhos.clear();
  alterado = false;
  mostrarPavimentoAtivo();
} });

C.registrar({ nome: "salvar", descricao: "Salva o projeto (.ohp)", async executar() {
  if (desenho) ativo().vista = vista.estado;
  const sugestao = (projeto.nome || "projeto").replace(/[\\/:*?"<>|]/g, "_") + ".ohp";
  const c = await salvarTexto(serializar(projeto), sugestao, caminhoProjeto, "ohp", "Projeto OpenHidro");
  if (!c) return;
  caminhoProjeto = c.endsWith(".ohp") ? c : caminhoProjeto;
  projeto.nome = c.split(/[\\/]/).pop()!.replace(/\.ohp$/i, "");
  alterado = false;
  atualizarTitulo();
  mensagem(`Projeto salvo: ${c}`);
} });

C.registrar({ nome: "abrir", descricao: "Abre um projeto (.ohp)", async executar() {
  if (alterado && !confirmar("Descartar as alterações do projeto atual?")) return;
  const a = await escolherArquivo(["ohp"], "Projeto OpenHidro");
  if (!a) return;
  try {
    const p = lerProjeto(new TextDecoder().decode(a.bytes));
    projeto = p;
    caminhoProjeto = a.caminho;
    projeto.nome = a.nome.replace(/\.ohp$/i, "");
    desenhos.clear();
    mostrarPavimentoAtivo();
    const faltando: string[] = [];
    for (const pv of p.pavimentos) {
      if (!pv.fundo) continue;
      const bytes = pv.fundo.caminho ? await lerCaminho(pv.fundo.caminho) : null;
      const vistaSalva = pv.vista;
      if (bytes && await abrirDesenho(bytes, pv.fundo.nome, pv.fundo.caminho, pv, pv.fundo.camadasOcultas)) {
        pv.vista = vistaSalva;
        if (pv.id === p.pavimentoAtivo && vistaSalva) vista.restaurar(vistaSalva);
      } else faltando.push(`${pv.nome}: ${pv.fundo.nome}`);
    }
    alterado = false;
    atualizarTitulo();
    if (faltando.length) mensagem(`Não encontrei as plantas de fundo (${faltando.join("; ")}). Ative o pavimento e use Importar planta DXF.`, true);
  } catch (e: any) {
    mensagem(e?.message ?? String(e), true);
  }
} });

function confirmar(t: string) { return window.confirm(t); }

// ------------------------------------------------------------- interface
document.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((b) =>
  b.addEventListener("click", () => C.executar(b.dataset.cmd!).catch((e) => mensagem(String(e?.message ?? e), true))));

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === "s") { e.preventDefault(); C.executar("salvar"); }
  else if (e.ctrlKey && k === "o") { e.preventDefault(); C.executar("abrir"); }
  else if (e.ctrlKey && k === "n") { e.preventDefault(); C.executar("novo"); }
  else if (e.key === "Home") { e.preventDefault(); C.executar("zoomExtensao"); }
});

// arrastar e soltar arquivo DXF/OHP
area.addEventListener("dragover", (e) => { e.preventDefault(); area.classList.add("arrastando"); });
area.addEventListener("dragleave", () => area.classList.remove("arrastando"));
area.addEventListener("drop", async (e) => {
  e.preventDefault();
  area.classList.remove("arrastando");
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (!/\.dxf$/i.test(f.name)) { mensagem("Por enquanto só arquivos DXF podem ser arrastados (DWG: salve como DXF no AutoCAD).", true); return; }
  if (await abrirDesenho(new Uint8Array(await f.arrayBuffer()), f.name, null)) marcarAlterado();
});

window.addEventListener("beforeunload", (e) => { if (alterado) e.preventDefault(); });

// API para automação e testes (o servidor MCP do M3 usará os mesmos comandos)
(window as any).openhidro = {
  executar: C.executar,
  comandos: C.listar,
  abrirDxfTexto: async (texto: string, nome = "desenho.dxf", pavimento?: string) =>
    abrirDesenho(new TextEncoder().encode(texto), nome, null, pavimento ? pav(pavimento) : ativo()),
  estado: () => ({
    projeto,
    pavimentoAtivo: ativo().nome,
    pavimentos: projeto.pavimentos.map((p) => ({ id: p.id, nome: p.nome, cota: p.cota, peDireito: p.peDireito,
      fundo: p.fundo?.nome ?? null, carregado: desenhos.has(p.id) })),
    desenho: desenho && { nome: desenho.nome, camadas: desenho.camadas.size, segmentos: desenho.totalSegmentos },
  }),
};

mostrarPavimentoAtivo();
