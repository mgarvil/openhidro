// Elementos lançados no projeto. Coordenadas x/y nas unidades do desenho (as mesmas da planta de
// fundo); alturas sempre em metros acima do piso acabado do pavimento.
import catalogo from "../dados/agua_fria.json";

export interface AparelhoCatalogo {
  chave: string; descricao: string; peso: number; vazao_ls: number;
  pressao_min_kpa: number | null; altura_m: number; dn_min: number | null;
}
export const APARELHOS: AparelhoCatalogo[] = catalogo.aparelhos;
export const TUBOS_PVC = catalogo.tubos.pvc as { dn: number; referencia: string; di_mm: number }[];
export const aparelho = (chave: string) => APARELHOS.find((a) => a.chave === chave);

/** Siglas usadas nos rótulos do desenho (convenção usual de projeto). */
export const SIGLAS: Record<string, string> = {
  bacia_caixa_descarga: "BS", bacia_valvula_descarga: "VD", banheira: "BAN", bebedouro: "BEB", bide: "BD",
  chuveiro: "CH", chuveiro_eletrico: "CH", lavadora: "MLR", lavatorio: "LV", mictorio_valvula: "MIC",
  mictorio_caixa: "MIC", mictorio_calha: "MIC", pia: "PIA", pia_torneira_eletrica: "PIA", tanque: "TQ",
  torneira_jardim: "TJ",
};

interface Base { id: string; pavimentoId: string; rotulo?: string }

export interface ElAparelho extends Base { tipo: "aparelho"; chave: string; x: number; y: number; altura: number; quantidade: number }
export interface ElTubo extends Base { tipo: "tubo"; x1: number; y1: number; x2: number; y2: number; altura: number; dn?: number | null }
export interface ElReservatorio extends Base { tipo: "reservatorio"; x: number; y: number; altura: number; nivelAgua: number }
/** Coluna (prumada): trecho vertical em (x, y) que atravessa do pavimento base ao pavimento topo. */
export interface ElColuna extends Base { tipo: "coluna"; x: number; y: number; topoId: string }

export type Elemento = ElAparelho | ElTubo | ElReservatorio | ElColuna;

export const NOMES_TIPO: Record<Elemento["tipo"], string> = {
  aparelho: "Ponto de utilização", tubo: "Tubo", reservatorio: "Reservatório", coluna: "Coluna",
};
