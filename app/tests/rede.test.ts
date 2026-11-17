import { describe, expect, it } from "vitest";
import { montarRedes } from "../src/modelo/rede";
import type { Elemento } from "../src/modelo/elementos";
import type { Pavimento } from "../src/projeto";

const pav = (id: string, cota: number): Pavimento => ({ id, nome: id, cota, peDireito: 3, fundo: null, vista: null });

describe("montarRedes", () => {
  // Exemplo feito à mão (desenho em mm, escala 0,001 m/mm):
  //  Cobertura (cota 3,0): reservatório em (0,0) com saída a 0,5 m da laje -> z = 3,5
  //    tubo a 0,3 m (z = 3,3) de (0,0) a (2000,0)
  //  Coluna em (2000,0) do Térreo à Cobertura
  //  Térreo (cota 0): tubo a 2,5 m de (2000,0) a (2000,1500) [tê] -> (2000,2500) chuveiro (z 2,2)
  //                                                    tê -> (3000,1500) lavatório (z 0,6)
  //  T1 RES->N1: 0,2 (descida) + 2,0 + 0,8 (coluna) + 1,5 = 4,5 m; 3 joelhos 90, entrada + registro
  //  T  N1->CH1: 1,0 + 0,3 = 1,3 m; tê passagem direta + joelho 90
  //  T  N1->LV1: 1,0 + 1,9 = 2,9 m; tê saída lateral + joelho 90
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
  const m = montarRedes(els, pavs, 0.001);

  it("monta uma rede sem erros", () => {
    expect(m.erros).toEqual([]);
    expect(m.redes).toHaveLength(1);
  });
  const r = m.redes[0].rede;
  const t = (para: string) => r.trechos.find((x: any) => x.para === para);

  it("trecho do reservatório até o tê", () => {
    const t1 = r.trechos.find((x: any) => x.de === "RES");
    expect(t1.comprimento).toBeCloseTo(4.5, 6);
    expect(t1.conexoes).toEqual({ entrada_normal: 1, registro_gaveta: 1, joelho_90: 3 });
  });
  it("ramal do chuveiro: passagem direta", () => {
    expect(t("CH1").comprimento).toBeCloseTo(1.3, 6);
    expect(t("CH1").conexoes).toEqual({ te_passagem_direta: 1, joelho_90: 1 });
  });
  it("ramal do lavatório: saída lateral", () => {
    expect(t("LV1").comprimento).toBeCloseTo(2.9, 6);
    expect(t("LV1").conexoes).toEqual({ te_saida_lateral: 1, joelho_90: 1 });
  });
  it("cotas dos nós", () => {
    const z = Object.fromEntries(r.nos.map((n: any) => [n.id, n.z]));
    expect(z).toMatchObject({ RES: 3.5, CH1: 2.2, LV1: 0.6, N1: 2.5 });
  });
  it("aponta anel e falta de reservatório", () => {
    const anel = montarRedes([...els, { id: "t4", tipo: "tubo", pavimentoId: "T", x1: 2000, y1: 2500, x2: 3000, y2: 1500, altura: 2.5 } as Elemento], pavs, 0.001);
    expect(anel.erros[0].mensagem).toMatch(/anel/);
    const sem = montarRedes(els.filter((e) => e.id !== "r"), pavs, 0.001);
    expect(sem.erros[0].mensagem).toMatch(/sem reservatório/);
  });
});

describe("ponto sobre o meio do tubo", () => {
  // Tubo a 2,6 m de (0,0) a (3000,0) saindo do reservatório (z 5); mictório em (1000,0) a 1,05 m:
  // o tubo é partido em (1000,0) -> tê com descida de 1,55 m até o mictório.
  // T RES->N1: 2,4 (descida do res 5,0->2,6) + 1,0 = 3,4 m
  // T N1->MIC1: 1,55 m (tê saída lateral + joelho) ; T N1->LV1: 2,0 + 2,0 (2,6->0,6) = 4,0 m
  const els: Elemento[] = [
    { id: "r", tipo: "reservatorio", pavimentoId: "T", x: 0, y: 0, altura: 5, nivelAgua: 0 },
    { id: "t", tipo: "tubo", pavimentoId: "T", x1: 0, y1: 0, x2: 3000, y2: 0, altura: 2.6 },
    { id: "m", tipo: "aparelho", pavimentoId: "T", chave: "mictorio_caixa", x: 1000, y: 0, altura: 1.05, quantidade: 1 },
    { id: "l", tipo: "aparelho", pavimentoId: "T", chave: "lavatorio", x: 3000, y: 0, altura: 0.6, quantidade: 1 },
  ];
  const m = montarRedes(els, [pav("T", 0)], 0.001);
  it("forma o tê no meio do tubo", () => {
    expect(m.erros).toEqual([]);
    const r = m.redes[0].rede;
    const c = (para: string) => r.trechos.find((x: any) => x.para === para).comprimento;
    expect(r.trechos.find((x: any) => x.de === "RES").comprimento).toBeCloseTo(3.4, 6);
    expect(c("MIC1")).toBeCloseTo(1.55, 6);
    expect(c("LV1")).toBeCloseTo(4.0, 6);
  });
});

describe("descida na parede com registro", () => {
  // Reservatório (0,0) saída a 3,0 m; tubo no forro a 2,6 m até (1000,0); tubo na parede a 1,2 m de
  // (1000,0) a (2000,0); registro de gaveta na descida a 1,8 m; lavatório em (2000,0) a 0,6 m.
  // Um único trecho: 0,4 + 1,0 + (2,6-1,2 = 1,4) + 1,0 + 0,6 = 4,4 m
  // Conexões: entrada + registro (saída do reservatório) + registro da descida = 2 registros;
  // joelhos 90: (0,0,2,6) (1000,0,2,6) (1000,0,1,2) (2000,0,1,2) = 4
  const els: Elemento[] = [
    { id: "r", tipo: "reservatorio", pavimentoId: "T", x: 0, y: 0, altura: 3, nivelAgua: 0 },
    { id: "t1", tipo: "tubo", pavimentoId: "T", x1: 0, y1: 0, x2: 1000, y2: 0, altura: 2.6 },
    { id: "t2", tipo: "tubo", pavimentoId: "T", x1: 1000, y1: 0, x2: 2000, y2: 0, altura: 1.2 },
    { id: "rg", tipo: "registro", pavimentoId: "T", x: 1000, y: 0, modelo: "gaveta", altura: 1.8 },
    { id: "lv", tipo: "aparelho", pavimentoId: "T", chave: "lavatorio", x: 2000, y: 0, altura: 0.6, quantidade: 1 },
  ];
  const m = montarRedes(els, [pav("T", 0)], 0.001);
  it("liga os tubos pela descida e conta o registro", () => {
    expect(m.erros).toEqual([]);
    const t = m.redes[0].rede.trechos;
    expect(t).toHaveLength(1);
    expect(t[0].comprimento).toBeCloseTo(4.4, 6);
    expect(t[0].conexoes).toEqual({ entrada_normal: 1, registro_gaveta: 2, joelho_90: 4 });
    expect(m.redes[0].grafo.nos.some((n) => n.reg === "rg" && Math.abs(n.z - 1.8) < 1e-9)).toBe(true);
  });
});

describe("tê de canto", () => {
  // Coluna descendo em (0,0) e dois tubos saindo a 90° um do outro no mesmo ponto: peça inexistente
  const els: Elemento[] = [
    { id: "r", tipo: "reservatorio", pavimentoId: "C", x: 0, y: 0, altura: 0.5, nivelAgua: 0 },
    { id: "c", tipo: "coluna", pavimentoId: "T", topoId: "C", x: 0, y: 0 },
    { id: "a", tipo: "tubo", pavimentoId: "T", x1: 0, y1: 0, x2: 1000, y2: 0, altura: 2.2 },
    { id: "b", tipo: "tubo", pavimentoId: "T", x1: 0, y1: 0, x2: 0, y2: -1000, altura: 2.2 },
    { id: "l1", tipo: "aparelho", pavimentoId: "T", chave: "lavatorio", x: 1000, y: 0, altura: 0.6, quantidade: 1 },
    { id: "l2", tipo: "aparelho", pavimentoId: "T", chave: "lavatorio", x: 0, y: -1000, altura: 0.6, quantidade: 1 },
  ];
  it("é apontado como pendência", () => {
    const m = montarRedes(els, [pav("T", 0), pav("C", 3)], 0.001);
    expect(m.erros.some((e) => /tê de canto/.test(e.mensagem))).toBe(true);
  });
  it("com a derivação afastada 10 cm deixa de ser", () => {
    const ok = els.map((e) => (e.id === "b" ? { ...e, x1: 100, x2: 100 } : e.id === "l2" ? { ...e, x: 100 } : e)) as Elemento[];
    const m = montarRedes(ok, [pav("T", 0), pav("C", 3)], 0.001);
    expect(m.erros).toEqual([]);
  });
});
