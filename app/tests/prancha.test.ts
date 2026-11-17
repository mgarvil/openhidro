// Prancha de exemplo (banheiro): gera tests/saida/prancha_exemplo.pdf para conferência visual e
// verifica o conteúdo mínimo exigido pelo padrão de referência (docs/referencias-projetos.md, seção 8).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gerarPrancha } from "../src/prancha/prancha";
import { aplicarDnImposto, montarRedes } from "../src/modelo/rede";
import { listaDeMateriais } from "../src/modelo/quantitativo";
import type { Elemento } from "../src/modelo/elementos";
import { configPadrao, type Pavimento, type Projeto } from "../src/projeto";

const motor = (pedido: unknown) => JSON.parse(execFileSync("python3", ["-m", "openhidro.ponte"], {
  input: JSON.stringify(pedido), cwd: "..", env: { ...process.env, PYTHONPATH: "src" } }).toString());

export function banheiroExemplo(): Projeto {
  const pavs: Pavimento[] = [
    { id: "T", nome: "Térreo", cota: 0, peDireito: 2.8, fundo: null, vista: null },
    { id: "C", nome: "Cobertura", cota: 2.8, peDireito: 1.5, fundo: null, vista: null },
  ];
  const els: Elemento[] = [
    { id: "res", tipo: "reservatorio", pavimentoId: "C", x: 0, y: 2600, altura: 0.6, nivelAgua: 0, rotulo: "RES-1" },
    { id: "tc", tipo: "tubo", pavimentoId: "C", x1: 0, y1: 2600, x2: 0, y2: 1600, altura: 0.3 },
    { id: "col", tipo: "coluna", pavimentoId: "T", topoId: "C", x: 0, y: 1600, rotulo: "AF-1" },
    { id: "tf", tipo: "tubo", pavimentoId: "T", x1: 0, y1: 1600, x2: 600, y2: 1600, altura: 2.6 },
    { id: "rg", tipo: "registro", pavimentoId: "T", x: 600, y: 1600, modelo: "gaveta", altura: 1.8 },
    { id: "tb", tipo: "tubo", pavimentoId: "T", x1: 600, y1: 1600, x2: 2200, y2: 1600, altura: 0.3 },
    { id: "vs", tipo: "aparelho", pavimentoId: "T", chave: "bacia_caixa_descarga", x: 1100, y: 1600, altura: 0.3, quantidade: 1 },
    { id: "lv", tipo: "aparelho", pavimentoId: "T", chave: "lavatorio", x: 1700, y: 1600, altura: 0.6, quantidade: 1 },
    { id: "rp", tipo: "registro", pavimentoId: "T", x: 2200, y: 1600, modelo: "pressao", altura: 1.0 },
    { id: "ch", tipo: "aparelho", pavimentoId: "T", chave: "chuveiro", x: 2200, y: 1600, altura: 2.1, quantidade: 1 },
  ];
  return { formato: "openhidro-projeto", versao: 2, nome: "Banheiro exemplo", criadoEm: "", alteradoEm: "", pavimentos: pavs,
           pavimentoAtivo: "T", elementos: els, config: { ...configPadrao(), folha: "A1" }, historico: [] };
}

describe("prancha", () => {
  it("gera a folha do banheiro no padrão de referência", () => {
    const p = banheiroExemplo();
    const m = montarRedes(p.elementos, p.pavimentos, p.config.escalaMetro);
    expect(m.erros).toEqual([]);
    let redes: { montada: any; resposta: any }[];
    try { redes = m.redes.map((rm) => { aplicarDnImposto(rm, p.elementos); return { montada: rm, resposta: motor({ acao: "dimensionar", rede: rm.rede }) }; }); }
    catch { console.warn("motor Python indisponível: prancha de exemplo não gerada"); return; }
    const materiais = listaDeMateriais(redes.map((r) => ({ montada: r.montada,
      dn: new Map<string, number>(r.resposta.resultado.trechos.map((t: any) => [t.id, t.dn])) })), p.elementos, p.config.fabricante);
    const resultado: any = { redes, trechos: [], pontos: [], alertas: [], erros: [], avisos: [], materiais, esgoto: [], trechosEs: [] };
    const doc = gerarPrancha({ projeto: p, desenhos: new Map(), resultado });
    const buf = Buffer.from(doc.output("arraybuffer"));
    mkdirSync("tests/saida", { recursive: true });
    writeFileSync("tests/saida/prancha_exemplo.pdf", buf);
    let txt = "";
    try { txt = execFileSync("pdftotext", ["-layout", "tests/saida/prancha_exemplo.pdf", "-"]).toString(); } catch { return; }   // sem poppler: só gera
    for (const t of ["DETALHE HID-1", "L=1.1", "AF-1", "AF-2", "Legenda das indicações", "PVC ø", "Joelho 90° soldável", "Lavatório - 20 mm x 1/2\""]) expect(txt).toContain(t);
  });
});
