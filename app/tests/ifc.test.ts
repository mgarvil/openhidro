import { writeFileSync, mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gerarIfc, num, str } from "../src/exportar/ifc";
import { montarRedes } from "../src/modelo/rede";
import type { Elemento } from "../src/modelo/elementos";
import type { Pavimento } from "../src/projeto";

const pav = (id: string, nome: string, cota: number): Pavimento => ({ id, nome, cota, peDireito: 3, fundo: null, vista: null });

describe("IFC4", () => {
  it("formata números e textos no padrão STEP", () => {
    expect(num(3)).toBe("3.");
    expect(num(0.025)).toBe("0.025");
    expect(num(-0)).toBe("0.");
    expect(str("Térreo d'água")).toBe("'T\\X2\\00E9\\X0\\rreo d''\\X2\\00E1\\X0\\gua'");
  });
  it("gera arquivo com pavimentos, tubos, conexões, registro, pontos e reservatório", () => {
    const pavs = [pav("T", "Térreo", 0), pav("C", "Cobertura", 3)];
    const els: Elemento[] = [
      { id: "r", tipo: "reservatorio", pavimentoId: "C", x: 0, y: 0, altura: 0.5, nivelAgua: 0 },
      { id: "t1", tipo: "tubo", pavimentoId: "C", x1: 0, y1: 0, x2: 2000, y2: 0, altura: 0.3 },
      { id: "c", tipo: "coluna", pavimentoId: "T", topoId: "C", x: 2000, y: 0 },
      { id: "t2", tipo: "tubo", pavimentoId: "T", x1: 2000, y1: 0, x2: 2000, y2: 2500, altura: 2.5 },
      { id: "t3", tipo: "tubo", pavimentoId: "T", x1: 2000, y1: 1500, x2: 3000, y2: 1500, altura: 2.5 },
      { id: "rg", tipo: "registro", pavimentoId: "T", x: 2000, y: 700, modelo: "gaveta" },
      { id: "ch", tipo: "aparelho", pavimentoId: "T", chave: "chuveiro", x: 2000, y: 2500, altura: 2.2, quantidade: 1 },
      { id: "lv", tipo: "aparelho", pavimentoId: "T", chave: "lavatorio", x: 3000, y: 1500, altura: 0.6, quantidade: 1 },
    ];
    const m = montarRedes(els, pavs, 0.001);
    const txt = gerarIfc({ nome: "Teste", elementos: els, pavimentos: pavs, escala: 0.001, versao: "teste",
      redes: m.redes.map((r) => ({ montada: r, dn: new Map(r.trechos.map((t) => [t.id, 25])) })) });
    const conta = (ent: string) => (txt.match(new RegExp(`=${ent}\\(`, "g")) ?? []).length;
    expect(conta("IFCBUILDINGSTOREY")).toBe(2);
    expect(conta("IFCTANK")).toBe(1);
    expect(conta("IFCVALVE")).toBe(1);
    expect(conta("IFCSANITARYTERMINAL")).toBe(2);
    expect(conta("IFCPIPESEGMENT")).toBeGreaterThan(6);
    expect(conta("IFCPIPEFITTING")).toBeGreaterThan(4);
    expect(txt).toContain("FILE_SCHEMA(('IFC4'))");
    mkdirSync("tests/saida", { recursive: true });
    writeFileSync("tests/saida/exemplo.ifc", txt);   // validado com IfcOpenShell: scripts/validar_ifc.py
  });
});
