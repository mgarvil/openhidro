# OpenHidro

**Software livre de projeto hidrossanitário predial, feito para trabalhar junto com o Claude.**

O OpenHidro dimensiona redes de **água fria** (ABNT NBR 5626 — método da soma dos pesos) e de
**esgoto sanitário** (ABNT NBR 8160 — método das Unidades Hunter de Contribuição), lê a tubulação
direto de um **DXF** e devolve memorial de cálculo, tabela de trechos e o DXF anotado com os
diâmetros. Expõe tudo por um **servidor MCP**, então o Claude (ou outro assistente compatível)
pode montar, calcular e revisar a rede junto com o engenheiro.

> ⚠️ Versão 0.1 — em desenvolvimento. Os resultados são preliminares e **não substituem a
> responsabilidade técnica do engenheiro**. Confira as tabelas com a norma vigente
> (ver [docs/conferencia-normas.md](docs/conferencia-normas.md)).

## O que já faz

| Módulo | Situação |
|---|---|
| Água fria — soma dos pesos, Fair-Whipple-Hsiao ou Darcy-Weisbach, perdas localizadas por comprimento equivalente, verificação de velocidade e de pressões dinâmica/estática, aumento automático de diâmetro até atender a pressão mínima | ✅ |
| Esgoto — ramais de descarga, ramais de esgoto, tubos de queda, subcoletores e coletor (Tabelas 3 a 7), declividades mínimas, ramais de ventilação (Tabela 8), caixas sifonadas | ✅ |
| Reservatórios — consumo diário por ocupação, reserva de 1 a 3 dias, reserva de incêndio, divisão superior/inferior | ✅ |
| Leitura de DXF — linhas em camadas viram trechos, blocos viram aparelhos, derivações em "T" detectadas | ✅ |
| Saídas — memorial em Markdown, CSV, JSON, DXF anotado | ✅ |
| Servidor MCP para o Claude | ✅ |
| Água quente, águas pluviais (NBR 10844), coluna de ventilação, isométricos, IFC | 🔜 ver [roadmap](docs/roadmap.md) |

## Instalação

```bash
git clone https://github.com/mgarvil/openhidro.git
cd openhidro
pip install -e ".[mcp,dev]"
```

## Uso rápido

```bash
# lista os aparelhos aceitos
openhidro aparelhos

# dimensiona uma rede descrita em JSON
openhidro calcular exemplos/residencia_agua_fria.json -o saida/
openhidro calcular exemplos/sobrado_esgoto.json -o saida/

# lê a tubulação de um DXF, dimensiona e grava o DXF anotado
python exemplos/gerar_dxf_exemplo.py
openhidro dxf exemplos/banheiro_af.dxf --config exemplos/banheiro_af_config.json -o saida/

# reservatório: 120 pessoas em escritório, 2 dias, 6.000 L de incêndio
openhidro reservatorio escritorio=120 --dias 2 --incendio 6000
```

## Usando com o Claude

**Claude Code:**

```bash
claude mcp add openhidro -- openhidro-mcp
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{ "mcpServers": { "openhidro": { "command": "openhidro-mcp" } } }
```

Depois é só pedir em português: *"dimensione a água fria deste banheiro"*, *"leia o DXF da planta
do 2º pavimento, camada HID-AF, e me devolva os diâmetros"*, *"qual o volume de reservatório para
64 apartamentos?"*. A skill em [`.claude/skills/projeto-hidrossanitario`](.claude/skills/projeto-hidrossanitario/SKILL.md)
ensina o Claude a conduzir o projeto.

## Formato da rede

Veja [docs/formato-rede.md](docs/formato-rede.md). Em resumo: nós (`id`, `x`, `y`, `z`, `tipo`,
`aparelho`) e trechos (`de`, `para`, `conexoes`, `dn`, `declividade`) formando uma árvore. Na
água fria os trechos vão do reservatório para os pontos; no esgoto, no sentido do escoamento.

## Contribuindo

Engenheiros e programadores são bem-vindos. Leia [CONTRIBUTING.md](CONTRIBUTING.md) e o
[`CLAUDE.md`](CLAUDE.md) — este último é o contexto que o Claude de cada colaborador lê ao abrir o
repositório, então cada um usa a própria conta e todos trabalham com as mesmas regras.

Toda mudança em tabela normativa precisa citar norma, edição, tabela e item.

## Licença

GPL-3.0-or-later. O OpenHidro é e continuará livre. O desenvolvimento não usa código, bibliotecas,
formatos internos nem interfaces de programas comerciais: parte apenas das normas técnicas e do
conhecimento de engenharia dos colaboradores.
