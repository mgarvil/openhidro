import { carregarDxf, decodificarDxf, type Desenho } from "./dxf/carregar";
import * as C from "./comandos";
import { escolherArquivo, lerCaminho, salvarTexto } from "./plataforma";
import { lerProjeto, novoProjeto, serializar, type Projeto } from "./projeto";
import { PainelCamadas } from "./ui/camadas";
import { Vista2D } from "./vista/vista2d";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const area = $("area");
const vista = new Vista2D(area);
const painel = new PainelCamadas($("listaCamadas"), $("filtroCamadas"), $("contCamadas"), $("todasOn"), $("todasOff"));
let projeto: Projeto = novoProjeto();
let caminhoProjeto: string | null = null;
let desenho: Desenho | null = null;
let alterado = false;

// ----------------------------------------------------------------- status
const fmtN = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
vista.onCursor = (x, y) => { $("coord").textContent = `x ${fmtN(x)}   y ${fmtN(y)}`; };
vista.onMudouVista = () => {
  if (!desenho) return;
  projeto.vista = vista.estado;
};
let temporizador = 0;
function mensagem(t: string, erro = false) {
  const el = $("mensagem");
  el.textContent = t;
  el.classList.toggle("erro", erro);
  clearTimeout(temporizador);
  if (!erro) temporizador = window.setTimeout(() => (el.textContent = ""), 6000);
}
function atualizarTitulo() {
  $("titulo").textContent = `${projeto.nome}${alterado ? " •" : ""}${desenho ? "  —  " + desenho.nome : ""}`;
  document.title = `${projeto.nome}${alterado ? " •" : ""} — OpenHidro`;
}
painel.onMudou = (camada, visivel) => {
  vista.definirVisivel(camada, visivel);
  if (projeto.fundo) projeto.fundo.camadasOcultas = painel.camadasOcultas;
  marcarAlterado();
};
function marcarAlterado() { alterado = true; atualizarTitulo(); }

function mostrarInfo(d: Desenho | null) {
  const el = $("infoDesenho");
  if (!d) { el.innerHTML = ""; return; }
  const e = d.extensao;
  el.innerHTML = `<h2>Planta de fundo</h2>
    <b>${esc(d.nome)}</b><br>
    ${d.camadas.size} camadas · ${d.totalSegmentos.toLocaleString("pt-BR")} segmentos<br>
    Unidade: ${d.unidade}<br>
    Extensão: ${fmtN(e.xmax - e.xmin)} × ${fmtN(e.ymax - e.ymin)}
    ${d.avisos.map((a) => `<div class="aviso">⚠ ${esc(a)}</div>`).join("")}`;
  $("unidade").textContent = `unidade: ${d.unidade}`;
}
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

// -------------------------------------------------------------- operações
async function abrirDesenho(bytes: Uint8Array, nome: string, caminho: string | null, ocultas: string[] = []) {
  const carregando = $("carregando");
  carregando.hidden = false;
  await new Promise((r) => setTimeout(r, 30)); // deixa a mensagem aparecer
  try {
    const t0 = performance.now();
    const d = carregarDxf(decodificarDxf(bytes), nome);
    desenho = d;
    vista.definirDesenho(d);
    painel.carregar([...d.camadas.values()], ocultas);
    for (const n of ocultas) vista.definirVisivel(n, false);
    projeto.fundo = { nome, caminho, camadasOcultas: painel.camadasOcultas };
    $("vazio").hidden = true;
    mostrarInfo(d);
    mensagem(`${nome} aberto em ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e: any) {
    mensagem(`Não consegui ler ${nome}: ${e?.message ?? e}`, true);
  } finally {
    carregando.hidden = true;
    atualizarTitulo();
  }
}

C.registrar({ nome: "importarFundo", descricao: "Importa uma planta DXF como desenho de fundo", async executar() {
  const a = await escolherArquivo(["dxf"], "Planta de arquitetura (DXF)");
  if (!a) return;
  await abrirDesenho(a.bytes, a.nome, a.caminho);
  marcarAlterado();
} });

C.registrar({ nome: "zoomExtensao", descricao: "Mostra o desenho inteiro", executar: () => vista.zoomExtensao() });

C.registrar({ nome: "novo", descricao: "Cria um projeto novo", async executar() {
  if (alterado && !confirmar("Descartar as alterações do projeto atual?")) return;
  projeto = novoProjeto();
  caminhoProjeto = null;
  desenho = null;
  vista.definirDesenho(null);
  painel.carregar([]);
  mostrarInfo(null);
  $("vazio").hidden = false;
  alterado = false;
  atualizarTitulo();
} });

C.registrar({ nome: "salvar", descricao: "Salva o projeto (.ohp)", async executar() {
  projeto.vista = desenho ? vista.estado : null;
  const sugestao = (projeto.nome || "projeto").replace(/[\\/:*?"<>|]/g, "_") + ".ohp";
  const c = await salvarTexto(serializar(projeto), sugestao, caminhoProjeto, "ohp", "Projeto OpenHidro");
  if (!c) return;
  caminhoProjeto = c.endsWith(".ohp") ? c : caminhoProjeto;
  const nome = c.split(/[\\/]/).pop()!.replace(/\.ohp$/i, "");
  projeto.nome = nome;
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
    desenho = null;
    vista.definirDesenho(null);
    painel.carregar([]);
    mostrarInfo(null);
    $("vazio").hidden = false;
    if (p.fundo) {
      const bytes = p.fundo.caminho ? await lerCaminho(p.fundo.caminho) : null;
      if (bytes) {
        await abrirDesenho(bytes, p.fundo.nome, p.fundo.caminho, p.fundo.camadasOcultas);
        if (p.vista) vista.restaurar(p.vista);
      } else {
        mensagem(`Não encontrei a planta de fundo "${p.fundo.nome}". Use Importar planta DXF para indicá-la de novo.`, true);
      }
    }
    alterado = false;
    atualizarTitulo();
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
  await abrirDesenho(new Uint8Array(await f.arrayBuffer()), f.name, null);
  marcarAlterado();
});

window.addEventListener("beforeunload", (e) => { if (alterado) e.preventDefault(); });

// API para automação e testes (o servidor MCP do M3 usará os mesmos comandos)
(window as any).openhidro = {
  executar: C.executar,
  comandos: C.listar,
  abrirDxfTexto: async (texto: string, nome = "desenho.dxf") =>
    abrirDesenho(new TextEncoder().encode(texto), nome, null),
  estado: () => ({ projeto, desenho: desenho && { nome: desenho.nome, camadas: desenho.camadas.size, segmentos: desenho.totalSegmentos } }),
};

atualizarTitulo();
