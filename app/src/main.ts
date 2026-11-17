import { carregarDxf, decodificarDxf, type Desenho } from "./dxf/carregar";
import * as C from "./comandos";
import { Editor, type NomeFerramenta, type ResultadoCalculo } from "./editor";
import { aplicarDnImposto, montarRedes } from "./modelo/rede";
import { barras, csvMateriais, FABRICANTES, listaDeMateriais, listaEsgoto } from "./modelo/quantitativo";
import { montarRedesEsgoto } from "./modelo/redeEsgoto";
import { chamarMotor, escolherArquivo, lerCaminho, salvarBinario, salvarTexto } from "./plataforma";
import { lerProjeto, novoPavimento, novoProjeto, ordenarPavimentos, serializar, type Pavimento, type Projeto } from "./projeto";
import { PainelCamadas } from "./ui/camadas";
import { Paineis } from "./ui/paineis";
import { PainelPavimentos } from "./ui/pavimentos";
import { IndicePontas } from "./vista/indice";
import { Vista2D } from "./vista/vista2d";
import { Vista3D } from "./vista/vista3d";
import { construir3D } from "./modelo/pecas3d";
import { ehSegmento, type Elemento } from "./modelo/elementos";

const VERSAO = "0.9.2";
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
const editor = new Editor(vista, area, () => projeto);
const vista3d = new Vista3D(area);
vista3d.mostrar(false);

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
    Extensão: ${fmtN(e.xmax - e.xmin)} × ${fmtN(e.ymax - e.ymin)} (${d.unidade})<br>
    <label class="unid">Desenho em <select id="escalaDesenho">${ESCALAS.map(([u, k]) =>
      `<option value="${k}" ${Math.abs(k - projeto.config.escalaMetro) < 1e-12 ? "selected" : ""}>${u}</option>`).join("")}</select>
      → ${fmtN((e.xmax - e.xmin) * projeto.config.escalaMetro)} m de largura</label>
    ${d.avisos.map((a) => `<div class="aviso">⚠ ${esc(a)}</div>`).join("")}`;
  el.querySelector<HTMLSelectElement>("#escalaDesenho")!.addEventListener("change", (ev) => {
    projeto.config.escalaMetro = Number((ev.target as HTMLSelectElement).value);
    editor.resultado = null; editor.problemas.clear();
    paineis.resultados(); vista.redesenhar(); marcarAlterado(); mostrarInfo(d);
    mensagem("Unidade do desenho alterada: comprimentos recalculados com a nova escala.");
  });
}
/** Metros por unidade do desenho: usa $INSUNITS se o tamanho fizer sentido para uma edificação,
 *  senão escolhe a unidade em que a planta mede entre 5 m e 5 km (preferindo m, depois mm). */
const ESCALAS: [string, number][] = [["mm", 0.001], ["cm", 0.01], ["m", 1]];
const PREFERENCIA = [1, 0.001, 0.01];   // m e mm são as unidades usuais; cm por último
function adivinharEscala(d: Desenho): number {
  const e = d.extensaoPrincipal, vao = Math.max(e.xmax - e.xmin, e.ymax - e.ymin);
  const ok = (k: number) => vao * k >= 5 && vao * k <= 5000;
  // 1º: espessura das paredes (linhas paralelas próximas) — 9 a 30 cm na unidade certa
  const porParede = escalaPelasParedes(d);
  if (porParede && ok(porParede)) return porParede;
  const decl = ESCALAS.find(([u]) => u === d.unidade)?.[1];
  if (decl && ok(decl)) return decl;
  return PREFERENCIA.find(ok) ?? decl ?? 0.001;
}
/** Distância entre cada linha horizontal/vertical e a paralela mais próxima que se sobrepõe a ela;
 *  em paredes isso é a espessura. Vence a unidade em que mais distâncias caem entre 9 e 30 cm. */
export function escalaPelasParedes(d: Desenho): number | null {
  const camadas = [...d.camadas.values()];
  const deParede = camadas.filter((c) => /par|wall|alv|muro/i.test(c.nome));
  const fonte = deParede.length ? deParede : camadas;
  const hs: [number, number, number][] = [], vs: [number, number, number][] = [];
  for (const c of fonte) {
    const s = c.segmentos;
    for (let i = 0; i < s.length && hs.length + vs.length < 60000; i += 4) {
      const x1 = s[i], y1 = s[i + 1], x2 = s[i + 2], y2 = s[i + 3];
      const L = Math.hypot(x2 - x1, y2 - y1);
      if (!L) continue;
      if (Math.abs(y2 - y1) < 1e-6 * L) hs.push([y1, Math.min(x1, x2), Math.max(x1, x2)]);
      else if (Math.abs(x2 - x1) < 1e-6 * L) vs.push([x1, Math.min(y1, y2), Math.max(y1, y2)]);
    }
  }
  const gaps: number[] = [];
  for (const arr of [hs, vs]) {
    arr.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < Math.min(arr.length, i + 40); j++) {
        const g = arr[j][0] - arr[i][0];
        if (g <= 0) continue;
        const sob = Math.min(arr[i][2], arr[j][2]) - Math.max(arr[i][1], arr[j][1]);
        if (sob > 2 * g) { gaps.push(g); break; }
      }
    }
  }
  if (gaps.length < 20) return null;
  let melhor: number | null = null, n = 0;
  for (const [, k] of ESCALAS) {
    const c = gaps.filter((g) => g * k >= 0.09 && g * k <= 0.30).length;
    if (c > n) { n = c; melhor = k; }
  }
  return n >= gaps.length * 0.15 ? melhor : null;
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

// ------------------------------------------------------------ lançamento
const paineis = new Paineis(editor, () => projeto, (n, a) => C.executar(n, a).catch((e) => mensagem(String(e?.message ?? e), true)),
  (ids) => irPara(ids), $("painelFerramenta"), $("painelPropriedades"), $("painelResultados"));
editor.mensagem = (t, erro) => mensagem(t, erro);
editor.aoAlterar = () => { marcarAlterado(); paineis.resultados(); atualizarVazio(); };
editor.aoMudarSelecao = () => paineis.propriedades();
editor.aoMudarFerramenta = () => {
  document.querySelectorAll<HTMLButtonElement>("[data-ferramenta]").forEach((b) => b.classList.toggle("ativa", b.dataset.ferramenta === editor.ferramenta));
  paineis.ferramenta();
};

// snap nas pontas de linha da planta do pavimento ativo (índice criado na primeira vez que é usado)
const indices = new WeakMap<Desenho, IndicePontas>();
editor.pontaPlanta = (x, y, tol) => {
  if (!desenho) return null;
  let ind = indices.get(desenho);
  if (!ind) indices.set(desenho, (ind = new IndicePontas(desenho, 0.5 / projeto.config.escalaMetro)));
  return ind.maisProximo(x, y, tol, new Set(ativo().fundo?.camadasOcultas ?? []));
};

/** Mostra elementos: troca para o pavimento deles, seleciona e enquadra. */
function irPara(ids: string[]) {
  const els = projeto.elementos.filter((e) => ids.includes(e.id));
  if (!els.length) return;
  const pavs = new Set(els.filter((e) => e.tipo !== "coluna").map((e) => e.pavimentoId));
  if (pavs.size && !pavs.has(projeto.pavimentoAtivo)) ativarPavimento([...pavs][0]);
  editor.selecionar(els.map((e) => e.id));
  editor.enquadrarElementos(els.map((e) => e.id));
}

function atualizarVazio() {
  const temAlgo = !!desenho || projeto.elementos.some((e) => e.pavimentoId === projeto.pavimentoAtivo);
  $("vazio").hidden = temAlgo;
}

/** Mostra na tela o pavimento ativo: sua planta, camadas ocultas e enquadramento. */
function mostrarPavimentoAtivo() {
  const a = ativo();
  desenho = desenhos.get(a.id) ?? null;
  vista.definirDesenho(desenho);
  const ocultas = a.fundo?.camadasOcultas ?? [];
  painel.carregar(desenho ? [...desenho.camadas.values()] : [], ocultas);
  if (desenho) for (const n of ocultas) vista.definirVisivel(n, false);
  if (desenho && a.vista) vista.restaurar(a.vista);
  atualizarVazio();
  if (editor.ferramenta === "tubo") editor.definirFerramenta("tubo");   // encerra tubulação em curso
  vista.redesenhar();
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
    if (!projeto.elementos.length) projeto.config.escalaMetro = adivinharEscala(d);
    else if (Math.abs(adivinharEscala(d) - projeto.config.escalaMetro) > 1e-12)
      mensagem(`Atenção: ${nome} parece estar em outra unidade que o projeto. Confira em "Planta de fundo".`, true);
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
    projeto.elementos = projeto.elementos.filter((e) => e.pavimentoId !== p.id && !((e.tipo === "coluna" || e.tipo === "tubo_queda") && e.topoId === p.id));
    editor.limparHistorico();
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
  reiniciarEditor();
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
    reiniciarEditor();
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

function reiniciarEditor() {
  editor.limparHistorico();
  editor.opcoes.alturaTubo = projeto.config.alturaTubo;
  editor.definirFerramenta("selecionar");
  paineis.atualizarTudo();
}

// ------------------------------------------------------- comandos de lançamento
const pavDe = (a: any) => (a?.pavimento ? pav(a.pavimento).id : projeto.pavimentoAtivo);
C.registrar({ nome: "ferramenta", descricao: "Ativa uma ferramenta: selecionar, tubo, aparelho, reservatorio, coluna",
  executar: (a?: any) => editor.definirFerramenta((a?.nome ?? a) as NomeFerramenta) });
C.registrar({ nome: "inserirAparelho", descricao: "Insere ponto de utilização {chave, x, y, altura?, quantidade?, pavimento?}",
  executar: (a: any) => editor.inserir({ tipo: "aparelho", chave: a.chave, x: a.x, y: a.y, altura: a.altura, quantidade: a.quantidade ?? 1, pavimentoId: pavDe(a), rotulo: a.rotulo }).id });
C.registrar({ nome: "inserirTubo", descricao: "Insere tubo horizontal {x1, y1, x2, y2, altura (m acima do piso), dn?, pavimento?}. Pontas de tubos no mesmo x,y com alturas diferentes viram uma descida/subida automática (tubulação descendo pela parede)",
  executar: (a: any) => editor.inserir({ tipo: "tubo", x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, altura: a.altura, dn: a.dn ?? null, pavimentoId: pavDe(a) }).id });
C.registrar({ nome: "inserirReservatorio", descricao: "Insere reservatório {x, y, altura?, nivelAgua?, pavimento?}",
  executar: (a: any) => editor.inserir({ tipo: "reservatorio", x: a.x, y: a.y, altura: a.altura, nivelAgua: a.nivelAgua, pavimentoId: pavDe(a), rotulo: a.rotulo ?? editor.proximoRotulo("RES") }).id });
C.registrar({ nome: "inserirColuna", descricao: "Insere coluna {x, y, pavimento (base), topo}",
  executar: (a: any) => editor.inserir({ tipo: "coluna", x: a.x, y: a.y, pavimentoId: pavDe(a), topoId: pav(a.topo).id, rotulo: a.rotulo ?? editor.proximoRotulo("AF-") }).id });
C.registrar({ nome: "inserirRegistro", descricao: "Insere registro {x, y, modelo: gaveta|pressao|esfera, altura?, pavimento?}. Sem altura: no meio de um tubo horizontal. Com altura (m): numa descida (ponto onde tubos de alturas diferentes se encontram)",
  executar: (a: any) => editor.inserir({ tipo: "registro", x: a.x, y: a.y, modelo: a.modelo ?? "gaveta", altura: a.altura ?? null, pavimentoId: pavDe(a) } as any).id });
C.registrar({ nome: "inserirPontoEsgoto", descricao: "Insere ponto de esgoto {chave (bacia, lavatorio, chuveiro…), x, y, quantidade?, pavimento?}",
  executar: (a: any) => editor.inserir({ tipo: "ponto_esgoto", chave: a.chave, x: a.x, y: a.y, quantidade: a.quantidade ?? 1, pavimentoId: pavDe(a) } as any).id });
C.registrar({ nome: "inserirTuboEsgoto", descricao: "Insere tubo de esgoto no sentido do escoamento {x1, y1, x2, y2, altura?, declividade?, dn?, pavimento?}. Se terminar no meio de outro tubo de esgoto a 90°, a chegada vira junção a 45° automaticamente (juncao45:false desliga)",
  executar: (a: any) => editor.inserirTuboEsgoto({ x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, altura: a.altura, declividade: a.declividade, dn: a.dn ?? null,
    pavimentoId: pavDe(a), juncao45: a.juncao45 }).map((e) => e.id) });
C.registrar({ nome: "inserirCaixa", descricao: "Insere caixa {modelo: sifonada|inspecao|gordura|ralo, x, y, altura?, pavimento?}",
  executar: (a: any) => editor.inserir({ tipo: "caixa_esgoto", modelo: a.modelo ?? "sifonada", x: a.x, y: a.y, altura: a.altura, pavimentoId: pavDe(a) } as any).id });
C.registrar({ nome: "inserirTuboQueda", descricao: "Insere tubo de queda {x, y, pavimento (base), topo}",
  executar: (a: any) => editor.inserir({ tipo: "tubo_queda", x: a.x, y: a.y, pavimentoId: pavDe(a), topoId: pav(a.topo).id, rotulo: a.rotulo ?? editor.proximoRotulo("TQ-") } as any).id });
C.registrar({ nome: "inserirSaidaEsgoto", descricao: "Insere a saída de esgoto (ligação à rede pública) {x, y, altura?, pavimento?}",
  executar: (a: any) => editor.inserir({ tipo: "saida_esgoto", x: a.x, y: a.y, altura: a.altura, pavimentoId: pavDe(a), rotulo: a.rotulo ?? "Saída" } as any).id });
C.registrar({ nome: "excluirElementos", descricao: "Exclui elementos {ids}", executar: (a: any) => editor.excluir(a.ids) });
C.registrar({ nome: "alterarElementos", descricao: "Altera propriedades {ids, dados}", executar: (a: any) => editor.alterar(a.ids, a.dados) });
C.registrar({ nome: "selecionar", descricao: "Seleciona elementos {ids} e mostra na tela", executar: (a: any) => irPara(a.ids) });
C.registrar({ nome: "alinhar", descricao: "Alinha pontos {ids?, eixo: 'y' (mesma linha horizontal) | 'x' (mesma vertical), valor?}. Sem ids usa a seleção; sem valor usa o primeiro selecionado. Pontas de tubo ligadas acompanham.",
  executar(a: any) {
    const ids: string[] = a?.ids ?? [...editor.selecao];
    const eixo: "x" | "y" = a?.eixo === "x" ? "x" : "y";
    const els = ids.map((id) => projeto.elementos.find((e) => e.id === id)).filter((e): e is Elemento => !!e && !ehSegmento(e));
    if (els.length < 1) throw new Error("Selecione os pontos a alinhar");
    const v = typeof a?.valor === "number" ? a.valor : (els[0] as any)[eixo];
    let n = 0;
    for (const e of els) {
      const x0 = (e as any).x, y0 = (e as any).y;
      if ((e as any)[eixo] === v) continue;
      editor.alterar([e.id], { [eixo]: v } as any);
      for (const t of projeto.elementos) if (ehSegmento(t) && t.pavimentoId === e.pavimentoId) {
        if (t.x1 === x0 && t.y1 === y0) editor.alterar([t.id], (eixo === "x" ? { x1: v } : { y1: v }) as any);
        if (t.x2 === x0 && t.y2 === y0) editor.alterar([t.id], (eixo === "x" ? { x2: v } : { y2: v }) as any);
      }
      n++;
    }
    vista.redesenhar();
    mensagem(`${n} ponto(s) alinhado(s) em ${eixo} = ${fmtN(v)}`);
    return { alinhados: n, eixo, valor: v };
  } });
C.registrar({ nome: "configurar", descricao: "Configura o projeto {escalaMetro? (0.001 mm | 0.01 cm | 1 m), folha? (A0–A3), fabricante?, alturasPontos? {chave: m}, alturaRegistroGaveta?, alturaRegistroPressao?}",
  executar(a: any) {
    const c = projeto.config;
    if (a?.escalaMetro != null) { c.escalaMetro = Number(a.escalaMetro); editor.resultado = null; editor.problemas.clear(); if (desenho) indices.delete(desenho); }
    if (a?.folha) c.folha = a.folha;
    if (a?.fabricante) c.fabricante = a.fabricante;
    if (a?.alturasPontos) c.alturasPontos = { ...c.alturasPontos, ...a.alturasPontos };
    if (a?.alturaRegistroGaveta != null) c.alturaRegistroGaveta = Number(a.alturaRegistroGaveta);
    if (a?.alturaRegistroPressao != null) c.alturaRegistroPressao = Number(a.alturaRegistroPressao);
    marcarAlterado(); paineis.resultados(); vista.redesenhar(); if (desenho) mostrarInfo(desenho);
    return { escalaMetro: c.escalaMetro, folha: c.folha, fabricante: c.fabricante, alturasPontos: c.alturasPontos,
             alturaRegistroGaveta: c.alturaRegistroGaveta, alturaRegistroPressao: c.alturaRegistroPressao };
  } });
C.registrar({ nome: "desfazer", descricao: "Desfaz a última alteração", executar: () => editor.desfazer() });
C.registrar({ nome: "refazer", descricao: "Refaz a alteração desfeita", executar: () => editor.refazer() });
C.registrar({ nome: "enquadrar", descricao: "Enquadra a vista {xmin, ymin, xmax, ymax} (coordenadas do desenho)",
  executar: (a: any) => vista.enquadrar(a.xmin, a.ymin, a.xmax, a.ymax, 1.05) });
C.registrar({ nome: "estado", descricao: "Resumo do projeto: pavimentos, contagem de elementos, ferramenta, unidade, vista e resultado do cálculo",
  executar() {
    const cont: Record<string, number> = {};
    for (const e of projeto.elementos) cont[e.tipo] = (cont[e.tipo] ?? 0) + 1;
    const r = editor.resultado;
    return {
      projeto: projeto.nome, escalaMetro: projeto.config.escalaMetro, unidadeDesenho: desenho?.unidade ?? null,
      pavimentos: projeto.pavimentos.map((p) => ({ id: p.id, nome: p.nome, cota: p.cota, peDireito: p.peDireito, planta: p.fundo?.nome ?? null })),
      pavimentoAtivo: ativo().nome, elementos: cont, ferramenta: editor.ferramenta, selecao: [...editor.selecao],
      vista: vista.janela, modo3d: vista3d.ativo,
      calculo: r ? { pendencias: r.erros.length + r.trechos.filter((t) => !t.ok).length + r.pontos.filter((p) => !p.ok).length + r.trechosEs.filter((t) => !t.ok).length,
                     redesAguaFria: r.redes.length, redesEsgoto: r.esgoto.length, erros: r.erros.map((x) => x.mensagem), alertas: r.alertas } : null,
    };
  } });
C.registrar({ nome: "buscarTextos", descricao: "Procura textos na planta de fundo do pavimento ativo {filtro (ex.: 'BWC', 'COZINHA'), limite?} → [{texto, x, y, camada}]",
  executar(a?: any) {
    if (!desenho) return [];
    const f = String(a?.filtro ?? "").toLowerCase(), lim = a?.limite ?? 60, out: any[] = [];
    for (const c of desenho.camadas.values()) for (const t of c.textos)
      if (!f || t.texto.toLowerCase().includes(f)) { out.push({ texto: t.texto, x: +t.x.toFixed(4), y: +t.y.toFixed(4), camada: c.nome }); if (out.length >= lim) return out; }
    return out;
  } });
C.registrar({ nome: "camadas", descricao: "Camadas da planta de fundo do pavimento ativo, com nº de linhas e textos",
  executar: () => desenho ? [...desenho.camadas.values()].map((c) => ({ nome: c.nome, linhas: c.segmentos.length / 4, textos: c.textos.length,
    visivel: !(ativo().fundo?.camadasOcultas ?? []).includes(c.nome) })) : [] });
C.registrar({ nome: "geometriaPlanta", descricao: "Linhas da planta de fundo dentro de uma janela {xmin, ymin, xmax, ymax, camadas?, limite?} → [[x1,y1,x2,y2,camada]]",
  executar(a: any) {
    if (!desenho) return [];
    const lim = a?.limite ?? 2000, sel = a?.camadas ? new Set<string>(a.camadas) : null, out: any[] = [];
    for (const c of desenho.camadas.values()) {
      if (sel && !sel.has(c.nome)) continue;
      const s = c.segmentos;
      for (let i = 0; i < s.length; i += 4) {
        if (Math.max(s[i], s[i + 2]) < a.xmin || Math.min(s[i], s[i + 2]) > a.xmax || Math.max(s[i + 1], s[i + 3]) < a.ymin || Math.min(s[i + 1], s[i + 3]) > a.ymax) continue;
        out.push([+s[i].toFixed(4), +s[i + 1].toFixed(4), +s[i + 2].toFixed(4), +s[i + 3].toFixed(4), c.nome]);
        if (out.length >= lim) return out;
      }
    }
    return out;
  } });
C.registrar({ nome: "capturarTela", descricao: "Imagem PNG da vista atual (planta ou 3D), em base64",
  executar() {
    const url = vista3d.ativo ? vista3d.renderer.domElement.toDataURL("image/png") : vista.capturar();
    return { formato: "png", base64: url.split(",")[1], janela: vista.janela };
  } });
C.registrar({ nome: "listarComandos", descricao: "Lista os comandos disponíveis", executar: () => C.listar() });
C.registrar({ nome: "listarElementos", descricao: "Lista os elementos do projeto", executar: () => projeto.elementos });

C.registrar({ nome: "calcular", descricao: "Dimensiona a água fria (NBR 5626) e mostra diâmetros e pressões", async executar() {
  const m = montarRedes(projeto.elementos, projeto.pavimentos, projeto.config.escalaMetro);
  const me = montarRedesEsgoto(projeto.elementos, projeto.pavimentos, projeto.config.escalaMetro);
  const r: ResultadoCalculo = { redes: [], trechos: [], pontos: [], alertas: [], erros: [...m.erros, ...me.erros], avisos: [...m.avisos, ...me.avisos],
                                materiais: [], esgoto: [], trechosEs: [] };
  if (!m.redes.length && !me.redes.length && !r.erros.length) { mensagem("Nada para calcular: lance água fria (reservatório, tubos, pontos) ou esgoto (pontos, tubos, saída).", true); return; }
  mensagem("Calculando…");
  for (const rm of m.redes) {
    aplicarDnImposto(rm, projeto.elementos);
    let resp: any;
    try { resp = await chamarMotor({ acao: "dimensionar", rede: rm.rede }); }
    catch (e: any) { r.erros.push({ mensagem: `${rm.rede.nome}: ${e?.message ?? e}`, elementos: [rm.id] }); continue; }
    r.redes.push({ montada: rm, resposta: resp });
    const vmax = resp.resultado.parametros.velocidade_max_ms;
    for (const t of resp.resultado.trechos)
      r.trechos.push({ rede: rm.id, id: t.id, de: t.de, para: t.para, dn: t.dn, ref: t.referencia, q: t.vazao_ls,
                       v: t.velocidade_ms, hf: t.perda_carga_m, L: t.comprimento_m, ok: t.velocidade_ms <= vmax + 1e-6 });
    for (const n of resp.resultado.nos) {
      const el = rm.nos[n.id];
      if (!el || n.aparelho == null) continue;
      r.pontos.push({ rede: rm.id, no: n.id, el, pd: n.pressao_dinamica_kpa, pmin: n.pressao_min_kpa, ok: n.ok });
    }
    r.alertas.push(...resp.resultado.alertas.map((a: string) => (m.redes.length > 1 ? `${rm.rede.nome}: ` : "") + a));
  }
  for (const rm of me.redes) {
    const porId = new Map(projeto.elementos.map((e) => [e.id, e]));
    for (const t of rm.trechos) {
      const dns = t.elementos.map((id) => porId.get(id)).filter((e) => e?.tipo === "tubo_esgoto").map((e: any) => e.dn ?? null);
      if (dns.length && dns.every((d) => d != null && d === dns[0])) rm.rede.trechos.find((x: any) => x.id === t.id).dn = dns[0];
    }
    let resp: any;
    try { resp = await chamarMotor({ acao: "dimensionar", rede: rm.rede }); }
    catch (e: any) { r.erros.push({ mensagem: `Esgoto: ${e?.message ?? e}`, elementos: [rm.id] }); continue; }
    r.esgoto.push({ montada: rm, resposta: resp });
    const alertas: string[] = resp.resultado.alertas;
    for (const t of resp.resultado.trechos)
      r.trechosEs.push({ rede: rm.id, id: t.id, de: t.de, para: t.para, tipo: t.tipo, uhc: t.uhc, dn: t.dn, dec: t.declividade, L: t.comprimento_m,
                         ok: !alertas.some((a) => a.startsWith(`ERRO trecho ${t.id}:`)) });
    r.alertas.push(...alertas.map((a) => "Esgoto: " + a));
  }
  r.materiais = materiaisDe(r);
  editor.resultado = r;
  editor.problemas = new Set([...r.erros, ...r.avisos].flatMap((p) => p.elementos));
  paineis.resultados();
  vista.redesenhar();
  const pend = r.erros.length + r.trechos.filter((t) => !t.ok).length + r.pontos.filter((p) => !p.ok).length + r.trechosEs.filter((t) => !t.ok).length;
  mensagem(pend ? `Cálculo concluído com ${pend} pendência(s) — veja o painel à direita.` : "Cálculo concluído: todos os pontos atendidos.", pend > 0);
  return { pendencias: pend, trechos: r.trechos, pontos: r.pontos, trechosEsgoto: r.trechosEs, erros: r.erros, alertas: r.alertas };
} });

function materiaisDe(r: ResultadoCalculo) {
  return [...listaDeMateriais(r.redes.map((x) => ({ montada: x.montada,
    dn: new Map<string, number>(x.resposta.resultado.trechos.map((t: any) => [t.id, t.dn])) })), projeto.elementos, projeto.config.fabricante),
    ...listaEsgoto(r.esgoto.map((x) => ({ montada: x.montada,
      dn: new Map<string, number>(x.resposta.resultado.trechos.map((t: any) => [t.id, t.dn])) })), projeto.elementos, projeto.config.fabricante)];
}
const nomePav = (id: string) => projeto.pavimentos.find((p) => p.id === id)?.nome ?? id;

C.registrar({ nome: "materiais", descricao: "Mostra a lista de materiais (calcula antes, se preciso)", async executar(a?: any) {
  if (!editor.resultado) await C.executar("calcular");
  const r = editor.resultado;
  if (!r?.redes.length && !r?.esgoto.length) return [];
  if (a?.semJanela) return r.materiais;
  const dlg = $("dlgMateriais") as HTMLDialogElement;
  const f = (v: number, u: string) => u === "m" ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
  const render = () => {
    const ls = r.materiais;
    const pavs = projeto.pavimentos.slice().reverse().filter((p) => ls.some((l) => l.pavimentoId === p.id));
    dlg.innerHTML = `<div class="dlg-cab"><h2>Lista de materiais — água fria</h2>
        <label>Fabricante <select id="fabMat">${FABRICANTES.map((x) => `<option ${x === projeto.config.fabricante ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        <button id="csvMat">Exportar CSV</button><button id="fecharMat">Fechar</button></div>
      <div class="dlg-corpo">${pavs.map((p) => {
        const lp = ls.filter((l) => l.pavimentoId === p.id);
        const grupos = [...new Set(lp.map((l) => l.grupo))];
        return `<h3>${esc(p.nome)}</h3><table class="tab mat"><thead><tr><th>Descrição</th><th>Código</th><th>Qtd.</th><th>Un.</th><th>Barras 6 m</th></tr></thead><tbody>
          ${grupos.map((g) => `<tr class="grupo"><td colspan="5">${esc(g)}</td></tr>` + lp.filter((l) => l.grupo === g).map((l) =>
            `<tr class="${l.foraCatalogo ? "fora" : ""}" title="${l.foraCatalogo ? "Peça não encontrada no catálogo do fabricante" : ""}"><td>${esc(l.descricao)}</td><td>${l.codigo ?? "—"}</td>
             <td>${f(l.qtd, l.unidade)}</td><td>${l.unidade}</td><td>${l.unidade === "m" ? barras(l.qtd) : ""}</td></tr>`).join("")).join("")}
          </tbody></table>`;
      }).join("")}
      <p class="ressalva">Tubos com 10 % de perda de corte nas barras. Códigos de fabricante a conferir no catálogo vigente. A responsabilidade técnica é do engenheiro.</p></div>`;
    dlg.querySelector("#fecharMat")!.addEventListener("click", () => dlg.close());
    dlg.querySelector("#fabMat")!.addEventListener("change", (ev) => {
      projeto.config.fabricante = (ev.target as HTMLSelectElement).value;
      r.materiais = materiaisDe(r); marcarAlterado(); render();
    });
    dlg.querySelector("#csvMat")!.addEventListener("click", async () => {
      const nome = (projeto.nome || "projeto").replace(/[\\/:*?"<>|]/g, "_") + "_materiais.csv";
      const c = await salvarTexto("\ufeff" + csvMateriais(r.materiais, nomePav), nome, null, "csv", "Lista de materiais");
      if (c) mensagem(`Lista salva: ${c}`);
    });
  };
  render();
  if (!dlg.open) dlg.showModal();
  return r.materiais;
} });

const CAMPOS_SELO: [keyof Projeto["config"]["selo"], string][] = [
  ["empresa", "Empresa / projetista"], ["contato", "Contato"], ["responsavel", "Responsável técnico"], ["registro", "CREA / CAU"],
  ["obra", "Obra"], ["endereco", "Endereço"], ["proprietario", "Proprietário"], ["disciplina", "Disciplina"],
  ["revisao", "Revisão"], ["data", "Data"], ["notas", "Notas"]];

async function gerarPdf() {
  if (!editor.resultado?.redes.length) await C.executar("calcular");
  const r = editor.resultado;
  if (!r?.redes.length) throw new Error("Calcule a rede antes de gerar a prancha");
  mensagem("Gerando prancha…");
  await new Promise((res) => setTimeout(res, 20));
  const { gerarPrancha } = await import("./prancha/prancha");
  const doc = gerarPrancha({ projeto, desenhos, resultado: r });
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  const nome = (projeto.nome || "projeto").replace(/[\\/:*?"<>|]/g, "_") + "_agua_fria.pdf";
  const c = await salvarBinario(bytes, nome, "pdf", "Prancha PDF", "application/pdf");
  if (c) mensagem(`Prancha salva: ${c} (${doc.getNumberOfPages()} folha(s))`);
  return { arquivo: c, folhas: doc.getNumberOfPages() };
}

C.registrar({ nome: "prancha", descricao: "Gera a prancha em PDF {direto?: true para não abrir a janela do selo}", async executar(a?: any) {
  if (a?.direto) return gerarPdf();
  const dlg = $("dlgPrancha") as HTMLDialogElement;
  const s = projeto.config.selo;
  dlg.innerHTML = `<div class="dlg-cab"><h2>Prancha PDF — dados do selo</h2>
      <label>Folha <select id="folhaPr">${["A0", "A1", "A2", "A3"].map((f) => `<option ${f === projeto.config.folha ? "selected" : ""}>${f}</option>`).join("")}</select></label>
      <button id="gerarPr" class="destaque">Gerar PDF</button><button id="fecharPr">Fechar</button></div>
    <div class="dlg-corpo"><div class="form-selo">${CAMPOS_SELO.map(([k, rot]) => `<label>${rot}</label>` +
      (k === "notas" ? `<textarea name="${k}">${esc(s[k])}</textarea>` : `<input name="${k}" value="${esc(s[k]).replace(/"/g, "&quot;")}" />`)).join("")}</div>
    <p class="ressalva">Uma folha por pavimento: planta com diâmetros, isométrico de cada ambiente, legenda, lista de materiais (${esc(projeto.config.fabricante)}), notas e selo. Os dados ficam salvos no projeto.</p></div>`;
  dlg.querySelector("#fecharPr")!.addEventListener("click", () => dlg.close());
  dlg.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[name]").forEach((inp) => inp.addEventListener("change", () => {
    (s as any)[inp.name] = inp.value; marcarAlterado();
  }));
  dlg.querySelector("#folhaPr")!.addEventListener("change", (ev) => { projeto.config.folha = (ev.target as HTMLSelectElement).value as any; marcarAlterado(); });
  dlg.querySelector("#gerarPr")!.addEventListener("click", async () => {
    try { await gerarPdf(); dlg.close(); } catch (err: any) { mensagem(err?.message ?? String(err), true); }
  });
  if (!dlg.open) dlg.showModal();
} });

function modelo3D() {
  const m = montarRedes(projeto.elementos, projeto.pavimentos, projeto.config.escalaMetro);
  const calc = editor.resultado;
  const redes = m.redes.map((rm) => {
    const r = calc?.redes.find((x) => x.montada.id === rm.id);
    return { montada: r?.montada ?? rm, dn: r ? new Map<string, number>(r.resposta.resultado.trechos.map((t: any) => [t.id, t.dn])) : null };
  });
  const me = montarRedesEsgoto(projeto.elementos, projeto.pavimentos, projeto.config.escalaMetro);
  for (const rm of me.redes) {
    const r = calc?.esgoto.find((x) => x.montada.id === rm.id);
    redes.push({ montada: (r?.montada ?? rm) as any, dn: r ? new Map<string, number>(r.resposta.resultado.trechos.map((t: any) => [t.id, t.dn])) : null, esgoto: true } as any);
  }
  return construir3D({ elementos: projeto.elementos, pavimentos: projeto.pavimentos, escala: projeto.config.escalaMetro, redes, desenhos });
}

C.registrar({ nome: "vista3d", descricao: "Alterna entre a planta (2D) e o modelo 3D {ligar?: boolean}", executar(a?: any) {
  const ligar = a?.ligar ?? !vista3d.ativo;
  if (ligar) {
    if (!projeto.elementos.length) { mensagem("Nada lançado ainda para ver em 3D.", true); return false; }
    editor.definirFerramenta("selecionar");
    vista3d.definirModelo(modelo3D());
    vista.ativo = false;
    vista3d.mostrar(true);
    vista3d.enquadrar();
    $("vazio").hidden = true;
    mensagem(editor.resultado ? "3D com os diâmetros calculados. Girar: botão esquerdo · mover: direito · zoom: roda."
                              : "3D com diâmetro provisório (25 mm). Calcule (F5) para ver os diâmetros reais.");
  } else {
    vista3d.mostrar(false);
    vista.ativo = true;
    atualizarVazio();
  }
  $("btn3d").classList.toggle("ligado", ligar);
  document.body.classList.toggle("modo3d", ligar);
  return ligar;
} });

C.registrar({ nome: "exportarGlb", descricao: "Exporta o modelo 3D em glTF binário (.glb)", async executar() {
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const m = modelo3D();
  m.grupo.children.filter((o) => o.userData.fundo).forEach((o) => m.grupo.remove(o));
  const buf = await new GLTFExporter().parseAsync(m.grupo, { binary: true }) as ArrayBuffer;
  const nome = (projeto.nome || "projeto").replace(/[\\/:*?"<>|]/g, "_") + "_agua_fria.glb";
  const c = await salvarBinario(new Uint8Array(buf), nome, "glb", "Modelo 3D (glTF)", "model/gltf-binary");
  if (c) mensagem(`Modelo 3D salvo: ${c}`);
} });

C.registrar({ nome: "exportarIfc", descricao: "Exporta a água fria em IFC4 (pavimentos, tubos, conexões, registros, pontos, reservatório)", async executar() {
  const { gerarIfc } = await import("./exportar/ifc");
  const m = montarRedes(projeto.elementos, projeto.pavimentos, projeto.config.escalaMetro);
  const calc = editor.resultado;
  const redes = m.redes.map((rm) => {
    const r = calc?.redes.find((x) => x.montada.id === rm.id);
    return { montada: r?.montada ?? rm,
      dn: r ? new Map<string, number>(r.resposta.resultado.trechos.map((t: any) => [t.id, t.dn])) : null,
      trechos: r ? new Map<string, { q: number; v: number }>(r.resposta.resultado.trechos.map((t: any) => [t.id, { q: t.vazao_ls, v: t.velocidade_ms }])) : undefined };
  });
  if (!calc) mensagem("Atenção: sem cálculo, o IFC sai com diâmetro provisório de 25 mm. Calcule (F5) antes.", true);
  const esgoto = montarRedesEsgoto(projeto.elementos, projeto.pavimentos, projeto.config.escalaMetro).redes.map((rm) => {
    const r = calc?.esgoto.find((x) => x.montada.id === rm.id);
    return { montada: (r?.montada ?? rm) as any,
      dn: r ? new Map<string, number>(r.resposta.resultado.trechos.map((t: any) => [t.id, t.dn])) : null,
      dec: r ? new Map<string, number | null>(r.resposta.resultado.trechos.map((t: any) => [t.id, t.declividade])) : undefined };
  });
  const txt = gerarIfc({ nome: projeto.nome || "Projeto", elementos: projeto.elementos, pavimentos: projeto.pavimentos,
                         escala: projeto.config.escalaMetro, redes, esgoto, versao: VERSAO });
  const nome = (projeto.nome || "projeto").replace(/[\\/:*?"<>|]/g, "_") + "_agua_fria.ifc";
  const c = await salvarTexto(txt, nome, null, "ifc", "Modelo IFC");
  if (c) mensagem(`IFC salvo: ${c}`);
  return c;
} });

C.registrar({ nome: "exportarMemorial", descricao: "Salva o memorial de cálculo em Markdown", async executar() {
  if (!editor.resultado?.redes.length) await C.executar("calcular");
  const r = editor.resultado;
  if (!r?.redes.length) return;
  const texto = `# ${projeto.nome}\n\n` + r.redes.map((x) => x.resposta.memorial).join("\n---\n\n");
  const nome = (projeto.nome || "projeto").replace(/[\\/:*?"<>|]/g, "_") + "_memorial.md";
  const c = await salvarTexto(texto, nome, null, "md", "Memorial de cálculo");
  if (c) mensagem(`Memorial salvo: ${c}`);
} });

// ------------------------------------------------------------- interface
document.querySelectorAll<HTMLButtonElement>("[data-cmd]").forEach((b) =>
  b.addEventListener("click", () => C.executar(b.dataset.cmd!).catch((e) => mensagem(String(e?.message ?? e), true))));

const rodar = (n: string, a?: unknown) => C.executar(n, a).catch((e) => mensagem(String(e?.message ?? e), true));
document.querySelectorAll<HTMLButtonElement>("[data-ferramenta]").forEach((b) =>
  b.addEventListener("click", async () => { if (vista3d.ativo) await rodar("vista3d", { ligar: false }); rodar("ferramenta", { nome: b.dataset.ferramenta }); }));
$("snapPlanta").addEventListener("click", () => { editor.alternarSnapPlanta(); $("snapPlanta").classList.toggle("ligado", editor.snapPlanta); });
$("btn3d").addEventListener("click", () => rodar("vista3d"));
document.querySelectorAll<HTMLButtonElement>("[data-aba]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll<HTMLButtonElement>("[data-aba]").forEach((x) => x.classList.toggle("ativa", x === b));
  document.querySelectorAll<HTMLElement>("[data-grupo]").forEach((g) => (g.hidden = g.dataset.grupo !== b.dataset.aba));
  // o botão Selecionar fica nas duas abas
  const sel = document.querySelector<HTMLButtonElement>('[data-ferramenta="selecionar"]')!;
  document.querySelector<HTMLElement>(`[data-grupo="${b.dataset.aba}"]`)!.prepend(sel);
  if (editor.ferramenta !== "selecionar") editor.definirFerramenta("selecionar");
}));
$("orto").addEventListener("click", () => { editor.alternarOrto(); $("orto").classList.toggle("ligado", editor.orto); });

window.addEventListener("keydown", (e) => {
  const alvo = e.target as HTMLElement;
  if (alvo instanceof HTMLInputElement || alvo instanceof HTMLSelectElement || alvo instanceof HTMLTextAreaElement) {
    if (e.key === "Escape") alvo.blur();
    return;
  }
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === "s") { e.preventDefault(); rodar("salvar"); }
  else if (e.ctrlKey && k === "o") { e.preventDefault(); rodar("abrir"); }
  else if (e.ctrlKey && k === "n") { e.preventDefault(); rodar("novo"); }
  else if (e.ctrlKey && k === "z") { e.preventDefault(); rodar(e.shiftKey ? "refazer" : "desfazer"); }
  else if (e.ctrlKey && k === "y") { e.preventDefault(); rodar("refazer"); }
  else if (e.ctrlKey && k === "a") { e.preventDefault(); editor.selecionar(editor.visiveis().map((x) => x.id)); }
  else if (e.ctrlKey || e.altKey || e.metaKey) return;
  else if (e.key === "Home") { e.preventDefault(); rodar("zoomExtensao"); }
  else if (e.key === "Escape") { if (vista3d.ativo) rodar("vista3d", { ligar: false }); else editor.esc(); }
  else if (vista3d.ativo && k !== "3") return;
  else if (k === "3") rodar("vista3d");
  else if (e.key === "Delete" || e.key === "Backspace") { if (editor.selecao.size) rodar("excluirElementos", { ids: [...editor.selecao] }); }
  else if (e.key === "F5") { e.preventDefault(); rodar("calcular"); }
  else if (e.key === "F3") { e.preventDefault(); editor.alternarSnapPlanta(); $("snapPlanta").classList.toggle("ligado", editor.snapPlanta); }
  else if (e.key === "F8") { e.preventDefault(); editor.alternarOrto(); $("orto").classList.toggle("ligado", editor.orto); }
  else if (k === "t") rodar("ferramenta", { nome: "tubo" });
  else if (k === "p") rodar("ferramenta", { nome: "aparelho" });
  else if (k === "r") rodar("ferramenta", { nome: "reservatorio" });
  else if (k === "c") rodar("ferramenta", { nome: "coluna" });
  else if (k === "g") rodar("ferramenta", { nome: "registro" });
  else if (k === "s") rodar("ferramenta", { nome: "selecionar" });
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
    elementos: projeto.elementos.length,
    ferramenta: editor.ferramenta,
    selecao: [...editor.selecao],
  }),
  editor,
  vista,
  vista3d,
};

// --------------------------------------------------------- ponte com o Claude (MCP)
// O núcleo (Rust) recebe pedidos do servidor MCP em 127.0.0.1 e os entrega aqui como evento.
if ((window as any).__TAURI_INTERNALS__) {
  (async () => {
    const { listen } = await import("@tauri-apps/api/event");
    const { invoke } = await import("@tauri-apps/api/core");
    await listen<{ id: number; comando: string; args: unknown }>("mcp-pedido", async (ev) => {
      const { id, comando, args } = ev.payload;
      let resposta: unknown;
      try {
        const r = await C.executar(comando, args ?? undefined);
        resposta = { ok: true, resultado: JSON.parse(JSON.stringify(r ?? null)) };
        mensagem(`Claude: ${comando}`);
      } catch (e: any) {
        resposta = { ok: false, erro: String(e?.message ?? e) };
      }
      await invoke("mcp_resposta", { id, resposta });
    });
  })().catch((e) => console.error("ponte MCP", e));
}

C.registrar({ nome: "conectarClaude", descricao: "Mostra como ligar o Claude Desktop a este programa", async executar() {
  let info: any = null;
  if ((window as any).__TAURI_INTERNALS__) { const { invoke } = await import("@tauri-apps/api/core"); info = await invoke("mcp_info"); }
  const dlg = $("dlgMateriais") as HTMLDialogElement;
  const cfg = `"openhidro-app": { "command": "python", "args": ["-m", "openhidro.app_mcp"] }`;
  dlg.innerHTML = `<div class="dlg-cab"><h2>Claude dentro do OpenHidro</h2><button id="fecharCl">Fechar</button></div>
    <div class="dlg-corpo" style="line-height:1.6">
    <p>Com o OpenHidro aberto, o Claude Desktop pode lançar, calcular, gerar prancha e exportar usando os mesmos comandos dos botões.</p>
    <p><b>1.</b> Atualize o pacote Python (uma vez): <code>pip install -U "openhidro[mcp] @ git+https://github.com/mgarvil/openhidro"</code></p>
    <p><b>2.</b> No arquivo de configuração do Claude Desktop, dentro de <code>"mcpServers"</code>, acrescente:</p>
    <pre style="background:#0f1216;padding:8px;border-radius:6px;user-select:all">${esc(cfg)}</pre>
    <p><b>3.</b> Feche e abra o Claude Desktop. Peça, por exemplo: <i>"no OpenHidro, lance a água fria do banheiro do Térreo e calcule"</i>.</p>
    <p class="ressalva">Ponte local: ${info?.porta ? `ativa na porta ${info.porta} (somente este computador)` : "disponível no aplicativo instalado"}.
    O Claude só age enquanto o OpenHidro estiver aberto; tudo pode ser desfeito com Ctrl+Z.</p></div>`;
  dlg.querySelector("#fecharCl")!.addEventListener("click", () => dlg.close());
  if (!dlg.open) dlg.showModal();
  return info;
} });

reiniciarEditor();
mostrarPavimentoAtivo();
