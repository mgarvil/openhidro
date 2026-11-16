# Roadmap

## v0.1 — núcleo de cálculo (atual)
- [x] Água fria: soma dos pesos, perdas de carga, pressões, aumento automático de DN
- [x] Esgoto: UHC, Tabelas 3 a 8, declividades
- [x] Reservatórios
- [x] DXF → rede; DXF anotado; memorial Markdown/CSV/JSON
- [x] CLI e servidor MCP

## v0.2 — completar o hidrossanitário
- [ ] Água quente (NBR 5626:2020 / NBR 7198) — pesos, perdas, isolamento
- [ ] Águas pluviais (NBR 10844) — vazão de projeto, calhas, condutores verticais e horizontais
- [ ] Colunas e barrilete de ventilação (NBR 8160, Tabela 2 / tabela de colunas)
- [ ] Caixas de gordura, de inspeção e sifonadas — dimensionamento e quantitativo
- [ ] Barrilete e colunas de água fria em edifícios (pressões por pavimento, VRP)
- [ ] Método hidráulico do esgoto (NBR 8160, Anexo B) como alternativa ao UHC

## v0.3 — desenho e quantitativos
- [ ] Lista de materiais (tubos por DN, conexões, registros) e planilha orçamentária
- [ ] Isométricos de água fria gerados em DXF
- [ ] Biblioteca de blocos DXF própria (aparelhos, conexões, simbologia NBR)
- [ ] Lançamento automático de pontos a partir da máscara de arquitetura (blocos de aparelhos)

## v0.4 — BIM
- [ ] Exportação IFC (IfcOpenShell): IfcPipeSegment, IfcPipeFitting, IfcSanitaryTerminal
- [ ] Integração com o Bonsai (Blender) e FreeCAD
- [ ] Importação de modelos IFC de arquitetura

## Sempre
- Conferência das tabelas contra o texto da norma (ver `conferencia-normas.md`)
- Exemplos resolvidos à mão como testes
