import { describe, expect, it } from "vitest";
import { montarRedesEsgoto } from "../src/modelo/redeEsgoto";
import type { Elemento } from "../src/modelo/elementos";
import type { Pavimento } from "../src/projeto";

const pav = (id: string, cota: number): Pavimento => ({ id, nome: id, cota, peDireito: 3, fundo: null, vista: null });

describe("rede de esgoto", () => {
  // Banheiro no térreo, tubos a -0,30 m (mm no desenho):
  //  LV (2000,1000) -> CS (2000,0): 0,30 (descida do ponto) + 1,00 = 1,30 m
  //  CH (3000,0)    -> CS:          0,30 + 1,00 = 1,30 m
  //  CS -> J (1000,0): 1,00 m ;  BS (1000,1000) -> J: 0,30 + 1,00 = 1,30 m ;  J -> SAÍDA (0,0): 1,00 m
  const els: Elemento[] = [
    { id: "lv", tipo: "ponto_esgoto", pavimentoId: "T", chave: "lavatorio", x: 2000, y: 1000, quantidade: 1 },
    { id: "ch", tipo: "ponto_esgoto", pavimentoId: "T", chave: "chuveiro", x: 3000, y: 0, quantidade: 1 },
    { id: "bs", tipo: "ponto_esgoto", pavimentoId: "T", chave: "bacia", x: 1000, y: 1000, quantidade: 1 },
    { id: "cs", tipo: "caixa_esgoto", pavimentoId: "T", modelo: "sifonada", x: 2000, y: 0, altura: -0.3 },
    { id: "sa", tipo: "saida_esgoto", pavimentoId: "T", x: 0, y: 0, altura: -0.3 },
    { id: "t1", tipo: "tubo_esgoto", pavimentoId: "T", x1: 2000, y1: 1000, x2: 2000, y2: 0, altura: -0.3, declividade: 0.02 },
    { id: "t2", tipo: "tubo_esgoto", pavimentoId: "T", x1: 3000, y1: 0, x2: 2000, y2: 0, altura: -0.3, declividade: 0.02 },
    { id: "t3", tipo: "tubo_esgoto", pavimentoId: "T", x1: 2000, y1: 0, x2: 0, y2: 0, altura: -0.3, declividade: 0.01 },
    { id: "t4", tipo: "tubo_esgoto", pavimentoId: "T", x1: 1000, y1: 1000, x2: 1000, y2: 0, altura: -0.3, declividade: 0.01 },
  ];
  const m = montarRedesEsgoto(els, [pav("T", 0)], 0.001);
  it("monta uma rede com 5 trechos no sentido do escoamento", () => {
    expect(m.erros).toEqual([]);
    expect(m.redes).toHaveLength(1);
    const r = m.redes[0].rede;
    const t = (de: string) => r.trechos.find((x: any) => x.de === de);
    expect(r.trechos).toHaveLength(5);
    expect(t("LV1").para).toBe("CS1");
    expect(t("LV1").comprimento).toBeCloseTo(1.3, 6);
    expect(t("CH1").comprimento).toBeCloseTo(1.3, 6);
    expect(t("CS1").para).toBe("J1");
    expect(t("BS1").comprimento).toBeCloseTo(1.3, 6);
    expect(t("J1").para).toBe("SAIDA");
    expect(t("J1").declividade).toBe(0.01);
  });
  it("sem saída é erro", () => {
    const sem = montarRedesEsgoto(els.filter((e) => e.id !== "sa"), [pav("T", 0)], 0.001);
    expect(sem.erros[0].mensagem).toMatch(/sem saída/);
  });
});
