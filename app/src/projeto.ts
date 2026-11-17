// Arquivo de projeto .ohp (JSON). Ver docs/arquitetura.md.
import type { EstadoVista } from "./vista/vista2d";

export interface Fundo {
  nome: string;
  caminho: string | null;      // caminho no disco (app instalado)
  camadasOcultas: string[];
}

/** Pavimento (nível): tudo que é lançado pertence a um pavimento. */
export interface Pavimento {
  id: string;
  nome: string;                 // "Térreo", "1º Pavimento", "Cobertura", "Barrilete"…
  cota: number;                 // m — cota do piso acabado
  peDireito: number;            // m — piso a piso
  fundo: Fundo | null;          // planta de arquitetura deste pavimento
  vista: EstadoVista | null;
}

export interface Projeto {
  formato: "openhidro-projeto";
  versao: 2;
  nome: string;
  criadoEm: string;
  alteradoEm: string;
  pavimentos: Pavimento[];      // ordenados de baixo para cima
  pavimentoAtivo: string;
  elementos: unknown[];         // M2: aparelhos, nós e trechos (cada um com pavimentoId)
  historico: { comando: string; quando: string; dados?: unknown }[];
}

let seq = 0;
export const novoId = (prefixo: string) => `${prefixo}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function novoPavimento(nome: string, cota: number, peDireito = 3.0): Pavimento {
  return { id: novoId("pav"), nome, cota, peDireito, fundo: null, vista: null };
}

export function novoProjeto(nome = "Projeto sem título"): Projeto {
  const agora = new Date().toISOString();
  const terreo = novoPavimento("Térreo", 0);
  return { formato: "openhidro-projeto", versao: 2, nome, criadoEm: agora, alteradoEm: agora,
           pavimentos: [terreo], pavimentoAtivo: terreo.id, elementos: [], historico: [] };
}

export function lerProjeto(texto: string): Projeto {
  const p = JSON.parse(texto);
  if (p?.formato !== "openhidro-projeto") throw new Error("Este arquivo não é um projeto do OpenHidro");
  if (p.versao === 1) {
    // v1 tinha um único fundo: vira o Térreo
    const t = novoPavimento("Térreo", 0);
    t.fundo = p.fundo ?? null;
    t.vista = p.vista ?? null;
    return { formato: "openhidro-projeto", versao: 2, nome: p.nome, criadoEm: p.criadoEm, alteradoEm: p.alteradoEm,
             pavimentos: [t], pavimentoAtivo: t.id, elementos: p.elementos ?? [], historico: p.historico ?? [] };
  }
  if (p.versao !== 2) throw new Error(`Versão de projeto ${p.versao} não suportada`);
  if (!p.pavimentos?.length) throw new Error("Projeto sem pavimentos");
  return p as Projeto;
}

export function ordenarPavimentos(p: Projeto) {
  p.pavimentos.sort((a, b) => a.cota - b.cota);
}

export function serializar(p: Projeto): string {
  p.alteradoEm = new Date().toISOString();
  return JSON.stringify(p, null, 2);
}
