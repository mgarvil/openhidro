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
