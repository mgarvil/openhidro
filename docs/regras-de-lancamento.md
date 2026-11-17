# Regras de lançamento (aprendidas com as correções do engenheiro)

Estas regras orientam o lançamento automático pelo Claude (`src/openhidro/app_mcp.py`) e as
verificações do programa. Cada correção do engenheiro vira uma regra aqui e, quando possível, uma
verificação automática.

| Regra | Origem | Verificação no programa |
|---|---|---|
| Água fria embutida na parede, no eixo da parede; descida pela parede até o ramal | Revisão do teste do sanitário (17/11/2026) | Descida automática entre tubos de alturas diferentes no mesmo x,y |
| Registro de gaveta por ambiente, na descida (~1,80 m) | idem | Registro com altura vira nó da descida e entra na perda de carga |
| Não existe "tê de canto" (3 saídas sem par alinhado) | idem | Pendência no cálculo |
| Ramal secundário de esgoto entra no primário a 45° | idem | Chegada a 45° automática ao desenhar; pendência se chegar a 90° |
| Tubos representados em faixa: contorno preto e preenchimento claro | idem | Tela e prancha |
| Isométrico bifilar com conexões, registros e paredes | idem | Prancha |
| Alturas dos pontos pela Tabela 2 do escritório (RG 1,80; CH 2,10; RP 1,00; LV 0,60; VS 0,30; VD 1,00; DH 0,45; pia/tanque 1,10) | Projetos de referência MGarvil (`docs/referencias-projetos.md`) | Pendente (backlog #10) |
| Coluna desce do forro; ramal corre baixo e sobe aos pontos (ou alto e desce) | idem | Descida automática (0.8) |
| Trecho rotulado `PVC øDN` + `L=comprimento` | idem | Pendente (backlog #4) |
| Caixas de esgoto com cota de tampa e de fundo (CT/CF) | idem | Pendente (backlog #6) |
| Sem notas "confirmar em projeto X" quando X faz parte da mesma entrega | Revisão do contratante (hospital) | Pendente |
