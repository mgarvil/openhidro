// Acesso a arquivos: usa as APIs do Tauri quando o app roda instalado, e as do navegador quando
// roda em modo de desenvolvimento (npm run dev).

export const noTauri = typeof (window as any).__TAURI_INTERNALS__ !== "undefined";

export interface ArquivoLido { nome: string; caminho: string | null; bytes: Uint8Array }

export async function escolherArquivo(extensoes: string[], titulo: string): Promise<ArquivoLido | null> {
  if (noTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const caminho = await open({ title: titulo, multiple: false, filters: [{ name: titulo, extensions: extensoes }] });
    if (!caminho || Array.isArray(caminho)) return null;
    const bytes = await readFile(caminho);
    return { nome: caminho.split(/[\\/]/).pop() ?? caminho, caminho, bytes };
  }
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = extensoes.map((e) => "." + e).join(",");
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      resolve({ nome: f.name, caminho: null, bytes: new Uint8Array(await f.arrayBuffer()) });
    };
    inp.click();
  });
}

export async function lerCaminho(caminho: string): Promise<Uint8Array | null> {
  if (!noTauri) return null;
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    return await readFile(caminho);
  } catch {
    return null;
  }
}

export async function salvarTexto(conteudo: string, nomeSugerido: string, caminhoAtual: string | null,
                                  extensao: string, titulo: string): Promise<string | null> {
  if (noTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const caminho = caminhoAtual ?? (await save({ title: titulo, defaultPath: nomeSugerido,
      filters: [{ name: titulo, extensions: [extensao] }] }));
    if (!caminho) return null;
    await writeTextFile(caminho, conteudo);
    return caminho;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([conteudo], { type: "application/json" }));
  a.download = nomeSugerido;
  a.click();
  URL.revokeObjectURL(a.href);
  return nomeSugerido;
}

/** Chama o motor de cálculo (Python). Ver src/openhidro/ponte.py. */
export async function chamarMotor(pedido: unknown): Promise<any> {
  let texto: string;
  if (noTauri) {
    const { Command } = await import("@tauri-apps/plugin-shell");
    const { tempDir, join } = await import("@tauri-apps/api/path");
    const { writeTextFile, remove } = await import("@tauri-apps/plugin-fs");
    const arq = await join(await tempDir(), `openhidro-pedido-${Date.now()}.json`);
    await writeTextFile(arq, JSON.stringify(pedido));
    try {
      const r = await Command.sidecar("binaries/openhidro-motor", ["--entrada", arq]).execute();
      if (!r.stdout) throw new Error(r.stderr || `o motor de cálculo saiu com código ${r.code}`);
      texto = r.stdout;
    } finally {
      remove(arq).catch(() => {});
    }
  } else {
    const r = await fetch("/api/motor", { method: "POST", body: JSON.stringify(pedido) });
    texto = await r.text();
  }
  const resp = JSON.parse(texto);
  if (!resp.ok) throw new Error(resp.erro);
  return resp;
}
