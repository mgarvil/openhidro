// Arquivo de projeto .ohp (JSON). Ver docs/arquitetura.md.
import type { EstadoVista } from "./vista/vista2d";

export interface Fundo {
  nome: string;
  caminho: string | null;      // caminho no disco (app instalado)
  camadasOcultas: string[];
}

export interface Projeto {
  formato: "openhidro-projeto";
  versao: 1;
  nome: string;
  criadoEm: string;
  alteradoEm: string;
  fundo: Fundo | null;
  vista: EstadoVista | null;
  elementos: unknown[];         // M2: aparelhos, nós e trechos lançados
  historico: { comando: string; quando: string; dados?: unknown }[];
}

export function novoProjeto(nome = "Projeto sem título"): Projeto {
  const agora = new Date().toISOString();
  return { formato: "openhidro-projeto", versao: 1, nome, criadoEm: agora, alteradoEm: agora,
           fundo: null, vista: null, elementos: [], historico: [] };
}

export function lerProjeto(texto: string): Projeto {
  const p = JSON.parse(texto);
  if (p?.formato !== "openhidro-projeto") throw new Error("Este arquivo não é um projeto do OpenHidro");
  if (p.versao !== 1) throw new Error(`Versão de projeto ${p.versao} não suportada`);
  return p as Projeto;
}

export function serializar(p: Projeto): string {
  p.alteradoEm = new Date().toISOString();
  return JSON.stringify(p, null, 2);
}
