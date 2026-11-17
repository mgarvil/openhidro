import { spawn } from "node:child_process";
import { defineConfig, type Plugin } from "vite";

// Em desenvolvimento (navegador) o cálculo vai para o motor Python instalado na máquina
// (pip install -e .), pelo endereço /api/motor. No app instalado o motor é o sidecar do Tauri.
function motorDev(): Plugin {
  const tratar = (req: any, res: any) => {
    let corpo = "";
    req.on("data", (c: Buffer) => (corpo += c));
    req.on("end", () => {
      const py = spawn(process.env.OPENHIDRO_PYTHON ?? "python3", ["-m", "openhidro.ponte"]);
      let saida = "", erro = "";
      py.stdout.on("data", (c) => (saida += c));
      py.stderr.on("data", (c) => (erro += c));
      py.on("close", () => {
        res.setHeader("Content-Type", "application/json");
        res.end(saida || JSON.stringify({ ok: false, erro: erro || "motor não respondeu" }));
      });
      py.on("error", (e) => res.end(JSON.stringify({ ok: false, erro: String(e) })));
      py.stdin.end(corpo);
    });
  };
  return {
    name: "openhidro-motor-dev",
    configureServer: (s) => { s.middlewares.use("/api/motor", tratar); },
    configurePreviewServer: (s) => { s.middlewares.use("/api/motor", tratar); },
  };
}

// Tauri espera porta fixa em desenvolvimento e saída em dist/
export default defineConfig({
  clearScreen: false,
  plugins: [motorDev()],
  server: { port: 1420, strictPort: true },
  build: { target: "es2021", outDir: "dist", chunkSizeWarningLimit: 2000 },
});
