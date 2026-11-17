# Arquitetura do OpenHidro

O OpenHidro tem duas partes:

1. **Motor de cálculo** (`src/openhidro/`, Python) — normas, dimensionamento, leitura de DXF,
   memorial. Já existe e é testado. Também roda sozinho pela linha de comando e pelo servidor MCP.
2. **Aplicativo de desktop** (`app/`) — a tela onde o engenheiro desenha, lança, calcula e
   exporta. Pode ser usado só com mouse/teclado ou junto com o Claude.

```
┌──────────────────────────── Aplicativo OpenHidro (Tauri) ───────────────────────────┐
│  Tela (TypeScript + Three.js)                                                        │
│   ├─ Planta 2D: fundo DXF/IFC, camadas, snap, lançamento de aparelhos e tubos        │
│   ├─ Vista 3D                                                                        │
│   ├─ Painéis: camadas, propriedades, biblioteca de peças, resultados                 │
│   └─ Comandos (toda ação passa por aqui — mouse, teclado e Claude usam os mesmos)    │
│                                                                                      │
│  Núcleo (Rust/Tauri): janela, arquivos, ponte com o motor e com o Claude (MCP)       │
│  Motor (Python empacotado): cálculo NBR 5626 / NBR 8160, relatórios, DXF, IFC        │
└──────────────────────────────────────────────────────────────────────────────────────┘
            ▲ MCP                                    ▲ GitHub (receitas compartilhadas, opcional)
     Claude Desktop / Claude Code
```

## Princípios

* **Leve e fluido.** Tauri usa o WebView do próprio Windows (instalador de dezenas de MB, não
  centenas). Desenho em GPU via Three.js, com geometria agrupada por camada.
* **Um único caminho de comandos.** Lançar ponto, desenhar trecho, mover, apagar, calcular:
  cada ação é um *comando* registrado com nome, parâmetros e desfazer. O mouse dispara comandos;
  o Claude, via MCP, dispara os mesmos comandos. Nada que o Claude faz é "mágico" — tudo aparece
  no histórico e pode ser desfeito.
* **O Claude é opcional.** O programa funciona inteiro sem IA.
* **Formatos abertos.** Projeto em JSON legível (`.ohp`), importação/exportação DXF e IFC.

## Como o programa aprende com o uso

O modelo de IA não é retreinado. O que cresce é o **conhecimento do escritório**, guardado em
arquivos que o Claude lê a cada sessão:

| O quê | Exemplo | Onde fica |
|---|---|---|
| **Receitas de lançamento** | "Baia de 4 lugares: tomada 4x no eixo da divisória, junto à parede, ponto diretor para dentro" | `receitas/*.json` (por usuário/escritório) |
| **Correções** | O Claude lançou, o usuário moveu/girou → o app pergunta "aplicar sempre assim?" e atualiza a receita | histórico do projeto → receita |
| **Preferências** | alturas de pontos, peças e fabricantes preferidos, padrão de memorial, selo | `preferencias.json` |
| **Receitas da comunidade** | receitas publicadas por outros engenheiros | repositório GitHub (opt-in) |

Regras: o **cálculo normativo nunca muda sozinho** (só com revisão e teste); toda receita
mostra de onde veio e pode ser editada ou apagada.

## Arquivo de projeto `.ohp`

JSON com: metadados, referências de fundo (caminho do DXF/IFC + deslocamento/escala), estado das
camadas, elementos lançados (aparelhos, nós, trechos), redes calculadas e histórico de comandos.
O motor Python lê a parte de rede diretamente (mesmo formato de `docs/formato-rede.md`).

## Etapas

Ver [roadmap.md](roadmap.md).
