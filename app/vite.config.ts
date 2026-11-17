import { defineConfig } from "vite";

// Tauri espera porta fixa em desenvolvimento e saída em dist/
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2021", outDir: "dist", chunkSizeWarningLimit: 2000 },
});
