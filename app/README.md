# Aplicativo OpenHidro

Interface de desktop do OpenHidro (Tauri + TypeScript + Three.js). Ver `../docs/arquitetura.md`.

## Desenvolvimento

```bash
npm install
npm run dev          # abre no navegador em http://localhost:1420 (o cálculo usa o Python da máquina: pip install -e ..)
npm test             # testes da montagem da rede (vitest)
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

## M1.1 — pavimentos
- Cada pavimento tem nome, cota, pé-direito, planta de fundo própria e enquadramento

## M2 — água fria na tela
- Faixa **Água fria**: Selecionar (S/Esc), Reservatório (R), Tubo (T), Ponto (P), Coluna (C)
- Tubo: clique os pontos; snap nas pontas, nos pontos e no meio dos tubos (forma tê), nas pontas de
  linha da planta (F3); Orto (F8 ou Shift); mostra o comprimento enquanto desenha
- Ponto de utilização: biblioteca de aparelhos gerada do motor (`src/dados/agua_fria.json`,
  `python scripts/gerar_dados_app.py`); altura padrão de cada aparelho, editável
- Coluna liga pavimentos; reservatório com altura da saída e lâmina d'água
- Seleção por clique ou janela, Delete, Ctrl+Z / Ctrl+Y, painel de propriedades (altura, DN fixado…)
- **Calcular (F5)**: `src/modelo/rede.ts` monta a árvore (descidas, tês, joelhos), o motor Python
  dimensiona (NBR 5626) e o desenho mostra Ø de cada trecho e a pressão de cada ponto; pendências
  em vermelho, clicáveis
- **Memorial**: salva o memorial de cálculo em Markdown
- Unidade da planta (m, cm, mm) detectada pelo tamanho do desenho e ajustável no painel da planta

### Motor dentro do aplicativo
O instalador leva o motor Python empacotado com PyInstaller (`binaries/openhidro-motor`, sidecar do
Tauri), gerado pela CI a partir de `scripts/motor_entrada.py`. O aplicativo grava o pedido num arquivo
temporário e lê a resposta JSON (ver `src/openhidro/ponte.py`). Não é preciso instalar Python.

## 0.3 — materiais e prancha
- **Registro** (G): gaveta, pressão ou esfera sobre o tubo; entra na perda de carga e na lista
- **Materiais**: lista por pavimento com as peças do fabricante escolhido (Tigre ou Amanco): tubos
  (m e barras), joelhos, tês, tês de redução, buchas, peças azuis com bucha de latão nos pontos,
  adaptadores, registros, engates; exporta CSV. Catálogo em `src/dados/catalogo.json`, gerado de
  `src/openhidro/catalogo` (`python scripts/gerar_dados_app.py`)
- **Prancha PDF** (A0–A3): uma folha por pavimento com planta (planta de fundo, tubos, Ø, pontos,
  registros, colunas, áreas de detalhe), isométrico de cada ambiente (alturas, Ø, roscas), legenda,
  lista de materiais, notas e selo editável

## 0.4 — 3D
- **3D** (botão ou tecla 3): modelo com tubos, conexões (bolsas), peças azuis nos pontos, registros e
  caixa d'água, com a planta de cada pavimento na sua cota. Girar: botão esquerdo; mover: direito; zoom: roda
- **Exportar 3D**: arquivo `.glb` (glTF) para Blender, 3D Viewer do Windows e outros

## 0.5 — IFC e esquema vertical
- **IFC** (IFC4): pavimentos como IfcBuildingStorey, tubos (IfcPipeSegment), conexões (IfcPipeFitting),
  registros (IfcValve), pontos (IfcSanitaryTerminal), reservatório (IfcTank), sistema de água fria e
  propriedades de cálculo (DN, vazão, velocidade). Validação: `python scripts/validar_ifc.py arquivo.ifc`
- **Prancha**: folha extra com o esquema vertical de cada coluna (níveis, ramais, registros, Ø, alturas)

## 0.6 — esgoto
- Aba **Esgoto**: Saída (ligação à rede pública), Tubo (no sentido do escoamento, com altura e
  declividade), Ponto (bacia, chuveiro, lavatório, pia, tanque, mictórios…), Caixa (sifonada,
  inspeção, gordura, ralo) e Tubo de queda entre pavimentos
- `src/modelo/redeEsgoto.ts` monta a rede (descidas dos pontos, junções, tubo de queda) e o motor
  dimensiona pela NBR 8160 (UHC, tipo de trecho, DN, declividade mínima); Ø e i% no desenho
- Materiais de esgoto (tubos, joelhos, junções, reduções, caixas, ralos, terminal de ventilação),
  planta de esgoto na prancha, peças em 3D e sistema SEWAGE no IFC

## 0.8 — correções da revisão do engenheiro
- Descida automática entre tubos de alturas diferentes no mesmo ponto (tubulação pela parede);
  registro com altura na descida
- Pendência para "tê de canto" (peça inexistente)
- Esgoto: chegada a 45° automática ao desenhar; pendência para ramal a 90° no horizontal
- Tubos em faixa com contorno preto e preenchimento claro (tela e prancha)
- Isométrico bifilar com bolsas das conexões, peças com bucha de latão, registros e paredes; chamadas sem sobreposição
- Ver `docs/regras-de-lancamento.md`
