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

## Pavimentos

Como no QiBuilder e no Revit, o projeto é dividido em **pavimentos** (níveis). Cada pavimento tem
nome, cota do piso, pé-direito, planta de fundo própria e seu enquadramento de tela.

- Tudo que for lançado (aparelhos, nós, trechos, cotas) leva `pavimentoId`.
- Colunas, tubos de queda e ventilação ligam pavimentos: são trechos verticais entre a cota de um
  pavimento e a de outro.
- A cota absoluta de um ponto = cota do pavimento + altura do ponto em relação ao piso.
- Comandos (mouse, teclado e, no M3, Claude): `ativarPavimento`, `adicionarPavimento`,
  `editarPavimento`, `excluirPavimento`.
- Formato `.ohp` versão 2; arquivos da versão 1 viram um pavimento "Térreo".
- Futuro: deslocamento de alinhamento por planta (quando os DXF dos pavimentos não estão na mesma
  origem) e exibir o pavimento de baixo esmaecido como referência.

## Motor dentro do aplicativo (M2)

O motor Python vai empacotado no instalador como executável único (PyInstaller), declarado como
*sidecar* do Tauri (`bundle.externalBin`). A interface monta a rede em TypeScript
(`app/src/modelo/rede.ts`), grava o pedido num arquivo temporário e chama
`openhidro-motor --entrada pedido.json`; a resposta (resultado + memorial) volta em JSON pela saída
padrão. Assim existe **um único motor de cálculo** — o mesmo da linha de comando e do servidor MCP — e
as tabelas normativas continuam só em Python (o catálogo que a interface usa é gerado delas).

## 3D e BIM com bibliotecas abertas

| Necessidade | Biblioteca | Licença | Situação |
|---|---|---|---|
| Vista 3D e peças paramétricas (tubos, conexões, registros, caixas) | Three.js | MIT | **em uso** (`app/src/modelo/pecas3d.ts`) |
| Exportar 3D para qualquer visualizador (Blender, 3D Viewer do Windows) | Three.js GLTFExporter (.glb) | MIT | **em uso** |
| Ler e gravar IFC no navegador | web-ifc (That Open) | MPL-2.0 | previsto (M4) |
| Gravar IFC no motor Python (IfcPipeSegment, IfcPipeFitting, IfcValve) | IfcOpenShell | LGPL-3.0 | alternativa ao web-ifc |
| Peças com detalhe de fabricação (sólidos, STEP) | replicad / OpenCascade.js | MIT / LGPL-2.1 | avaliar |

As peças 3D são geradas por parâmetros (DN, ângulo, tipo) — não se usam bibliotecas de peças de
software comercial. Dimensões finas (bolsa, comprimento de encaixe) podem vir do catálogo público
dos fabricantes quando forem cadastradas.
