# Aplicativo OpenHidro

Interface de desktop do OpenHidro (Tauri + TypeScript + Three.js). Ver `../docs/arquitetura.md`.

## Desenvolvimento

```bash
npm install
npm run dev          # abre no navegador em http://localhost:1420 (sem recursos de arquivo do Tauri)
npx tauri dev        # abre como aplicativo (requer Rust)
npx tauri build      # gera o instalador em src-tauri/target/release/bundle/
```

## M1 — o que já funciona
- Importar planta DXF (botão ou arrastar e soltar) — linhas, polilinhas com arcos, círculos, arcos,
  elipses, splines, sólidos, textos e blocos aninhados; acentos em DXF antigos (ANSI_1252)
- Zoom na roda do mouse, mover com botão do meio, botão direito ou Espaço + arrastar; Home ou
  duplo clique no botão do meio = ver tudo
- Painel de camadas: mostrar/ocultar, Alt+clique isola, filtro por nome
- Projeto `.ohp`: salvar, abrir (recarrega a planta de fundo e a vista), novo
