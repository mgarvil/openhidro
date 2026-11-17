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

## Uso no Brasil e nos EUA

O programa é pensado desde o início para mais de um mercado. Brasil é o padrão; EUA é o segundo
alvo.

| Camada | Brasil (padrão) | EUA |
|---|---|---|
| **Pacote de normas** | NBR 5626 (soma dos pesos), NBR 8160 (UHC), NBR 10844 | IPC / UPC (Water Supply Fixture Units — curva de Hunter; Drainage Fixture Units), ASPE |
| **Unidades** | SI: m, mm, L/s, kPa | US customary: ft-in, in, gpm, psi (conversão só na tela e nos relatórios; o modelo interno é SI) |
| **Catálogo de tubos e peças** | Fabricantes brasileiros (PVC soldável NBR 5648, esgoto NBR 5688…) | ASTM/ANSI: PVC Sch 40/80, CPVC, PEX, cobre tipo K/L/M, DWV, cast iron |
| **Idioma da interface** | pt-BR | en-US |
| **Simbologia e pranchas** | ABNT | ANSI/ASPE |

Regras de implementação:
* Cada pacote de normas é um módulo independente (`normas/br/…`, `normas/us/…`) com a mesma
  interface (aparelhos, vazão de projeto, tabelas de dimensionamento, limites); o projeto `.ohp`
  guarda qual pacote usa.
* Catálogos de peças são arquivos de dados (JSON/CSV) por região e fabricante — não código.
* Todo texto da interface passa por arquivos de tradução; nenhuma string fixa em português no
  código novo da interface.
* O modelo interno é sempre SI; unidades imperiais são formatação.
