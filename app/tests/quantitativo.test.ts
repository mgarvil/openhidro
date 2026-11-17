import { describe, expect, it } from "vitest";
import { montarRedes } from "../src/modelo/rede";
import { listaDeMateriais } from "../src/modelo/quantitativo";
import type { Elemento } from "../src/modelo/elementos";
import type { Pavimento } from "../src/projeto";

const pav = (id: string, cota: number): Pavimento => ({ id, nome: id, cota, peDireito: 3, fundo: null, vista: null });

describe("lista de materiais (mesmo exemplo de rede.test.ts, tudo DN 25)", () => {
  // Contagem à mão:
  //  joelhos 90 25: saída do reservatório (0,0,3,3), topo da coluna (2000,0,3,3), pé da coluna (2000,0,2,5),
  //                 descida do chuveiro (2000,2500), descida do lavatório (3000,1500) = 5
  //  tê 90 25: derivação (2000,1500) = 1 (corrida alinhada, derivação do mesmo DN)
  //  joelho de redução c/ bucha de latão 25 x 1/2": chuveiro e lavatório = 2
  //  reservatório: adaptador c/ flange livre 25 x 3/4", registro de gaveta bruto 3/4", 2 adaptadores curtos
  //  chuveiro: registro de pressão 3/4" + 2 adaptadores curtos; lavatório: engate flexível
  //  tubo 25: Cobertura 0,2 + 2,0 = 2,2 m; Térreo 0,8 + 1,5 + 1,0 + 0,3 + 1,0 + 1,9 = 6,5 m
  const pavs = [pav("T", 0), pav("C", 3)];
  const els: Elemento[] = [
    { id: "r", tipo: "reservatorio", pavimentoId: "C", x: 0, y: 0, altura: 0.5, nivelAgua: 0 },
    { id: "t1", tipo: "tubo", pavimentoId: "C", x1: 0, y1: 0, x2: 2000, y2: 0, altura: 0.3 },
    { id: "c", tipo: "coluna", pavimentoId: "T", topoId: "C", x: 2000, y: 0 },
    { id: "t2", tipo: "tubo", pavimentoId: "T", x1: 2000, y1: 0, x2: 2000, y2: 2500, altura: 2.5 },
    { id: "t3", tipo: "tubo", pavimentoId: "T", x1: 2000, y1: 1500, x2: 3000, y2: 1500, altura: 2.5 },
    { id: "ch", tipo: "aparelho", pavimentoId: "T", chave: "chuveiro", x: 2000, y: 2500, altura: 2.2, quantidade: 1 },
    { id: "lv", tipo: "aparelho", pavimentoId: "T", chave: "lavatorio", x: 3000, y: 1500, altura: 0.6, quantidade: 1 },
  ];
  const m = montarRedes(els, pavs, 0.001).redes[0];
  const dn = new Map(m.trechos.map((t) => [t.id, 25]));
  const l = listaDeMateriais([{ montada: m, dn }], els, "Tigre");
  const q = (fam: string, pv?: string) => l.filter((x) => x.familia === fam && (!pv || x.pavimentoId === pv)).reduce((s, x) => s + x.qtd, 0);
  it("conexões", () => {
    expect(q("joelho_90")).toBe(5);
    expect(q("te_90")).toBe(1);
    expect(q("joelho_reducao_90_bucha_latao")).toBe(2);
    expect(q("adaptador_curto")).toBe(4);
    expect(q("registro_pressao_canopla")).toBe(1);
    expect(q("registro_gaveta_bruto")).toBe(1);
    expect(q("adaptador_caixa_flange_livre")).toBe(1);
    expect(q("engate_flexivel")).toBe(1);
  });
  it("tubos por pavimento", () => {
    expect(q("tubo_soldavel", "C")).toBeCloseTo(2.2, 6);
    expect(q("tubo_soldavel", "T")).toBeCloseTo(6.5, 6);
  });
  it("tudo vem do catálogo Tigre", () => {
    expect(l.filter((x) => x.foraCatalogo)).toEqual([]);
    expect(l.find((x) => x.familia === "te_90")!.descricao).toBe("Tê 90° soldável 25 mm");
  });
  it("tê de redução quando a derivação é menor", () => {
    const dn2 = new Map(m.trechos.map((t) => [t.id, t.para === "LV1" ? 25 : 32]));
    const l2 = listaDeMateriais([{ montada: m, dn: dn2 }], els, "Amanco");
    expect(l2.find((x) => x.familia === "te_reducao_90")?.descricao).toBe("Tê de redução 90° soldável 32 x 25 mm");
  });
  it("sem tê de redução no catálogo (32 x 20): tê 32 + bucha longa 32 x 20", () => {
    const dn3 = new Map(m.trechos.map((t) => [t.id, t.para === "LV1" ? 20 : 32]));
    const l3 = listaDeMateriais([{ montada: m, dn: dn3 }], els, "Tigre");
    expect(l3.some((x) => x.familia === "te_reducao_90")).toBe(false);
    expect(l3.find((x) => x.familia === "bucha_reducao_longa")?.descricao).toBe("Bucha de redução soldável longa 32 x 20 mm");
  });
});
