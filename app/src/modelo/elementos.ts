// Elementos lançados no projeto. Coordenadas x/y nas unidades do desenho (as mesmas da planta de
// fundo); alturas sempre em metros acima do piso acabado do pavimento.
import catalogo from "../dados/agua_fria.json";
import catalogoEs from "../dados/esgoto.json";

export interface AparelhoCatalogo {
  chave: string; descricao: string; peso: number; vazao_ls: number;
  pressao_min_kpa: number | null; altura_m: number; dn_min: number | null;
}
export const APARELHOS: AparelhoCatalogo[] = catalogo.aparelhos;
export const TUBOS_PVC = catalogo.tubos.pvc as { dn: number; referencia: string; di_mm: number }[];
export const aparelho = (chave: string) => APARELHOS.find((a) => a.chave === chave);

/** Siglas usadas nos rótulos do desenho (convenção usual de projeto). */
export const SIGLAS: Record<string, string> = {
  bacia_caixa_descarga: "VS", bacia_valvula_descarga: "VD", banheira: "BAN", bebedouro: "BEB", bide: "BD",
  chuveiro: "CH", chuveiro_eletrico: "CH", ducha_higienica: "DH", lavadora: "MLR", lavatorio: "LV", mictorio_valvula: "MIC",
  mictorio_caixa: "MIC", mictorio_calha: "MIC", pia: "PIA", pia_torneira_eletrica: "PIA", tanque: "TQ",
  torneira_jardim: "TJ",
};

interface Base { id: string; pavimentoId: string; rotulo?: string }

export interface ElAparelho extends Base { tipo: "aparelho"; chave: string; x: number; y: number; altura: number; quantidade: number }
export interface ElTubo extends Base { tipo: "tubo"; x1: number; y1: number; x2: number; y2: number; altura: number; dn?: number | null }
export interface ElReservatorio extends Base { tipo: "reservatorio"; x: number; y: number; altura: number; nivelAgua: number }
/** Coluna (prumada): trecho vertical em (x, y) que atravessa do pavimento base ao pavimento topo. */
export interface ElColuna extends Base { tipo: "coluna"; x: number; y: number; topoId: string }

/** Registro no meio de um tubo horizontal, ou numa descida quando tem altura. */
/** Registro no meio de um tubo (gaveta, pressão ou esfera). Não muda a geometria; entra na perda de
 *  carga do trecho e na lista de materiais. */
export interface ElRegistro extends Base { tipo: "registro"; x: number; y: number; modelo: "gaveta" | "pressao" | "esfera"; altura?: number | null }

// ---- esgoto (NBR 8160)
export interface AparelhoEsgoto { chave: string; descricao: string; uhc: number; dn_min: number; sifonado: boolean }
export const APARELHOS_ES: AparelhoEsgoto[] = catalogoEs.aparelhos;
export const aparelhoEs = (chave: string) => APARELHOS_ES.find((a) => a.chave === chave);
export const DECLIVIDADE_MIN = catalogoEs.declividade_minima as Record<string, number>;
export const SIGLAS_ES: Record<string, string> = {
  bacia: "VS", banheira: "BAN", bebedouro: "BEB", bide: "BD", chuveiro: "CH", chuveiro_coletivo: "CH", lavador_comadre: "LC",
  lavatorio: "LV", lavatorio_coletivo: "LV", maquina_louca: "MLL", maquina_roupa: "MLR", mictorio_valvula: "MIC",
  mictorio_caixa: "MIC", mictorio_automatico: "MIC", mictorio_calha: "MIC", pia: "PIA", pia_industrial: "PIA",
  pia_industrial_panelas: "PIA", tanque: "TQ",
};
/** Ponto de esgoto (saída do aparelho, no piso). */
export interface ElPontoEsgoto extends Base { tipo: "ponto_esgoto"; chave: string; x: number; y: number; quantidade: number }
/** Tubo de esgoto horizontal; altura = geratriz no início (m em relação ao piso, negativa sob a laje). */
export interface ElTuboEsgoto extends Base { tipo: "tubo_esgoto"; x1: number; y1: number; x2: number; y2: number; altura: number; declividade: number; dn?: number | null }
export interface ElCaixaEsgoto extends Base { tipo: "caixa_esgoto"; modelo: "sifonada" | "inspecao" | "gordura" | "ralo"; x: number; y: number; altura: number }
export interface ElTuboQueda extends Base { tipo: "tubo_queda"; x: number; y: number; topoId: string }
/** Ligação à rede pública (ou à última caixa de inspeção): ponto final da rede de esgoto. */
export interface ElSaidaEsgoto extends Base { tipo: "saida_esgoto"; x: number; y: number; altura: number }

export type Elemento = ElAparelho | ElTubo | ElReservatorio | ElColuna | ElRegistro
  | ElPontoEsgoto | ElTuboEsgoto | ElCaixaEsgoto | ElTuboQueda | ElSaidaEsgoto;
export type Segmento = ElTubo | ElTuboEsgoto;
export const ehSegmento = (e: Elemento): e is Segmento => e.tipo === "tubo" || e.tipo === "tubo_esgoto";
const TIPOS_ES = new Set(["ponto_esgoto", "tubo_esgoto", "caixa_esgoto", "tubo_queda", "saida_esgoto"]);
export const ehEsgoto = (e: Elemento) => TIPOS_ES.has(e.tipo);
export const MODELOS_CAIXA: Record<ElCaixaEsgoto["modelo"], { nome: string; sigla: string }> = {
  sifonada: { nome: "Caixa sifonada", sigla: "CS" }, inspecao: { nome: "Caixa de inspeção", sigla: "CI" },
  gordura: { nome: "Caixa de gordura", sigla: "CG" }, ralo: { nome: "Ralo seco", sigla: "RS" },
};

export const NOMES_TIPO: Record<Elemento["tipo"], string> = {
  aparelho: "Ponto de utilização", tubo: "Tubo", reservatorio: "Reservatório", coluna: "Coluna", registro: "Registro",
  ponto_esgoto: "Ponto de esgoto", tubo_esgoto: "Tubo de esgoto", caixa_esgoto: "Caixa", tubo_queda: "Tubo de queda", saida_esgoto: "Saída de esgoto",
};

export const MODELOS_REGISTRO: Record<ElRegistro["modelo"], { nome: string; sigla: string; perda: string }> = {
  gaveta: { nome: "Registro de gaveta", sigla: "RG", perda: "registro_gaveta" },
  pressao: { nome: "Registro de pressão", sigla: "RP", perda: "registro_globo" },
  esfera: { nome: "Registro de esfera", sigla: "RE", perda: "registro_gaveta" },
};
