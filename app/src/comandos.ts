// Registro único de comandos. Botões, atalhos e (a partir do M3) o Claude via MCP disparam
// comandos por nome — assim tudo fica no histórico e funciona igual pelos três caminhos.

export interface Comando {
  nome: string;
  descricao: string;
  executar: (args?: any) => unknown | Promise<unknown>;
}

const registro = new Map<string, Comando>();
type Ouvinte = (nome: string, args: unknown) => void;
const ouvintes: Ouvinte[] = [];

export function registrar(c: Comando) {
  registro.set(c.nome, c);
}

export async function executar(nome: string, args?: unknown): Promise<unknown> {
  const c = registro.get(nome);
  if (!c) throw new Error(`Comando desconhecido: ${nome}`);
  const r = await c.executar(args);
  for (const o of ouvintes) o(nome, args);
  return r;
}

export function aoExecutar(o: Ouvinte) {
  ouvintes.push(o);
}

export function listar(): { nome: string; descricao: string }[] {
  return [...registro.values()].map(({ nome, descricao }) => ({ nome, descricao }));
}
