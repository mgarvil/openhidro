---
name: desenvolvimento-openhidro
description: Roteiro para desenvolver o OpenHidro (motor Python + app Tauri/TypeScript/Three.js) — onde fica cada coisa, como testar, publicar o instalador e as regras do projeto. Use ao alterar código, catálogo, pranchas, 3D ou o instalador do OpenHidro.
---

# Desenvolvimento do OpenHidro

Leia antes o `CLAUDE.md` da raiz (regras de rastreabilidade normativa, sala limpa, unidades).

## Mapa
| Parte | Onde | Observação |
|---|---|---|
| Normas e tabelas | `src/openhidro/normas/` | só dados + funções de consulta, com fonte em comentário |
| Catálogo de peças | `src/openhidro/catalogo/` | Tigre/Amanco/genéricos; códigos pendentes em `docs/conferencia-normas.md` |
| Motor de cálculo | `src/openhidro/calculo/` | `dimensionar_agua_fria`, `dimensionar_esgoto` |
| Ponte app ↔ motor | `src/openhidro/ponte.py` | JSON por arquivo/stdin; empacotado como sidecar (PyInstaller) |
| Dados para o app | `app/src/dados/*.json` | **gerados**: `python scripts/gerar_dados_app.py` (teste falha se desatualizado) |
| Montagem da rede | `app/src/modelo/rede.ts` | elementos desenhados → árvore do motor (descidas, tês, joelhos, colunas) |
| Lista de materiais | `app/src/modelo/quantitativo.ts` | conexões reais por DN a partir do grafo + DN calculado |
| Editor 2D | `app/src/editor.ts`, `app/src/vista/vista2d.ts` | ferramentas, snap, desenho por cima da planta |
| Vista 3D | `app/src/vista/vista3d.ts`, `app/src/modelo/pecas3d.ts` | peças paramétricas em Three.js |
| Prancha PDF | `app/src/prancha/prancha.ts` | jsPDF vetorial |
| Comandos | `app/src/main.ts` (`C.registrar`) | mouse, teclado e Claude (M3) usam os mesmos comandos |

## Testar
```bash
pip install -e ".[mcp,dev]" && python -m pytest -q          # motor
cd app && npm ci && npx tsc --noEmit && npm test              # app (vitest)
npx vite build && npx vite preview --port 4173                # /api/motor chama o Python local
```
Teste de ponta a ponta: Playwright (skill `webapp-testing`) abrindo `http://localhost:4173`, usando
`window.openhidro.executar(comando, args)` e conferindo `window.openhidro.estado()`.
Todo cálculo novo leva teste com exemplo feito à mão (a conta no comentário do teste).

## Publicar
Subir a versão em `app/package.json`, `app/src-tauri/tauri.conf.json`, `app/src-tauri/Cargo.toml`
(e `pyproject.toml` / `src/openhidro/__init__.py` se o motor mudou). Push em `main` →
workflow `app-windows` empacota o motor, gera o instalador e publica a release `app-vX.Y.Z`.
Push com `git -c push.negotiate=true push`.

## Bibliotecas abertas em uso / previstas
- Three.js (MIT) — 2D e 3D; jsPDF (MIT) — prancha; dxf-parser (MIT) — leitura de DXF.
- IFC: web-ifc (MPL-2.0, navegador) ou IfcOpenShell (LGPL-3.0, Python). Ambas compatíveis com GPL-3.0.
- Nunca usar código, bibliotecas de peças ou formatos de software comercial (AltoQi, Revit…).

## Skills instaladas no repositório
- `mcp-builder` — para o servidor MCP do app (M3)
- `webapp-testing` — testes de interface com Playwright
- `frontend-design` — qualidade visual da interface
- `projeto-hidrossanitario` — uso do motor para projetos
