# CLAUDE.md — contexto do projeto OpenHidro

Software livre (GPL-3.0) de projeto hidrossanitário predial, em Python, conforme normas ABNT.
Idioma do projeto: **português do Brasil** (código, nomes, mensagens, documentação).

## Estrutura

- `src/openhidro/normas/` — tabelas e parâmetros normativos. **Só dados e funções de consulta.**
  - `nbr5626.py` água fria (pesos, vazões, tubos, comprimentos equivalentes, perda de carga)
  - `nbr8160.py` esgoto (UHC, Tabelas 3 a 8, declividades)
  - `consumo.py` consumo per capita e reservatórios
- `src/openhidro/modelo.py` — `Rede`, `No`, `Trecho` (árvore; JSON de entrada/saída)
- `src/openhidro/calculo/` — motores `agua_fria.py` e `esgoto.py`
- `src/openhidro/io/` — `dxf.py` (leitura/anotação), `relatorio.py` (memorial, CSV, JSON)
- `src/openhidro/cli.py` — comando `openhidro`; `mcp_server.py` — servidor MCP `openhidro-mcp`
- `tests/` — pytest; `exemplos/` — redes de exemplo e gerador de DXF

## Regras

1. **Rastreabilidade normativa:** todo valor de tabela tem comentário com norma, edição e
   tabela/item. Valor sem fonte confirmada entra em `docs/conferencia-normas.md` como pendente.
2. **Sala limpa:** não usar código, binários, bibliotecas de peças, formatos internos ou telas de
   softwares comerciais (AltoQi, Revit MEP etc.). Fontes permitidas: normas, literatura técnica,
   catálogos públicos de fabricantes, conhecimento dos colaboradores.
3. **Unidades:** m, mm (diâmetros), L/s, kPa, m/m (declividade). Conversão kPa↔mca por
   `KPA_POR_MCA`.
4. **Convenção de sentido:** água fria `de`→`para` = reservatório→pontos; esgoto = sentido do
   escoamento.
5. Todo cálculo novo vem com teste que reproduz um exemplo **feito à mão** (no comentário do
   teste, a conta).
6. Resultados sempre com a ressalva de que a responsabilidade técnica é do engenheiro.
7. Não reduzir diâmetro no sentido do reservatório (água fria) nem no sentido do escoamento
   (esgoto).

## Comandos

```bash
pip install -e ".[mcp,dev]"
python -m pytest -q
openhidro calcular exemplos/residencia_agua_fria.json
```

## Próximos passos

Ver `docs/roadmap.md`.
