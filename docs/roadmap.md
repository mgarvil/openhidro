# Roadmap

O OpenHidro está sendo construído como **aplicativo de desktop** (ver
[arquitetura.md](arquitetura.md)) sobre o motor de cálculo já existente. Cada etapa termina com um
instalador para Windows testado em projeto real.

## Motor de cálculo v0.1 ✅
- [x] Água fria: soma dos pesos, perdas de carga, pressões, aumento automático de DN
- [x] Esgoto: UHC, Tabelas 3 a 8, declividades
- [x] Reservatórios
- [x] DXF → rede; DXF anotado; memorial Markdown/CSV/JSON
- [x] CLI e servidor MCP

## Aplicativo
- [x] **M1 — Esqueleto**: abrir DXF de fundo, zoom/pan, camadas, salvar/abrir projeto `.ohp`, instalador Windows
- [x] **M2 — Água fria na tela**: biblioteca de aparelhos, desenho de tubulação com snap, botão Calcular, diâmetros no desenho, trechos com problema em destaque
- [ ] **M2.1 — Edição**: mover/copiar/espelhar elementos, propriedades em lote, registros e conexões editáveis por trecho, cotas, prumada em vista de corte, snap em interseções da planta
- [ ] **M3 — Claude no programa**: servidor MCP do aplicativo (os mesmos comandos do mouse), receitas de lançamento, aprendizado por correção
- [ ] **M4 — Esgoto, 3D e exportação**: rede de esgoto, vista 3D, exportação IFC/DXF, memorial
- [~] **M5 — Pranchas e detalhes**: ✅ prancha PDF por pavimento (planta, isométrico por ambiente, legenda, lista, notas, selo); falta: esquema vertical/corte das colunas, barrilete e reservatórios em 3D, posicionamento manual das vistas, DXF/DWG da prancha
- [~] **M6 — Peças comerciais**: ✅ catálogo Tigre/Amanco (soldável, esgoto, metais), lista de materiais com conexões reais por DN, CSV; falta: códigos de fabricante, preços/orçamento, editor do catálogo

## M1.1 — Pavimentos [x]

- [x] Lista de pavimentos (nome, cota, pé-direito), cada um com sua planta de fundo
- [x] Troca de pavimento ativo guardando camadas ocultas e enquadramento
- [x] Projeto `.ohp` v2 com migração da v1

## Internacionalização (EUA)
- [ ] Unidades imperiais na interface e nos relatórios
- [ ] Interface em inglês (en-US)
- [ ] Pacote de normas US: IPC/UPC — WSFU (curva de Hunter), DFU, drenagem e ventilação
- [ ] Catálogo ASTM (PVC Sch 40, CPVC, PEX, cobre K/L/M, DWV)

## Motor — próximos cálculos
- [ ] Água quente (NBR 5626:2020 / NBR 7198)
- [ ] Águas pluviais (NBR 10844)
- [ ] Colunas de ventilação; caixas de gordura/inspeção
- [ ] Barrilete e colunas em edifícios (pressão por pavimento, VRP)
- [ ] Método hidráulico do esgoto (NBR 8160, Anexo B)

## Sempre
- Conferência das tabelas contra o texto da norma (ver `conferencia-normas.md`)
- Exemplos resolvidos à mão como testes
