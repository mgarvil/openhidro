# Conferência das tabelas normativas

Situação de cada tabela usada no código. "Conferido" = comparado com reprodução da norma em
material didático/técnico público; o ideal é cada valor ser conferido também contra o texto
oficial da ABNT por um colaborador que tenha a norma.

| Tabela | Arquivo | Fonte | Situação |
|---|---|---|---|
| Pesos relativos e vazões dos pontos de utilização | `nbr5626.py` `APARELHOS_AF` | NBR 5626:1998, Anexo A | Valores clássicos. **A NBR 5626:2020 retirou essa tabela e o roteiro de cálculo** e deixou o método a critério do projetista; o OpenHidro adota a soma dos pesos como método justificado. |
| Q = 0,3·√ΣP | `nbr5626.py` | NBR 5626:1998 | Conferido |
| Velocidade máxima 3 m/s | `ParametrosAguaFria` | NBR 5626 | Conferido; ajustável |
| Pressões mínimas (10 kPa no ponto, 5 kPa na caixa de descarga e na rede) e estática máx. 400 kPa | `ParametrosAguaFria` | NBR 5626:1998 | Pendente de conferência com a edição de 2020; ajustável |
| Pressão mínima na válvula de descarga | `APARELHOS_AF["bacia_valvula_descarga"]` | NBR 5626:1998 / fabricantes | **Pendente**: hoje usa o mínimo geral de 10 kPa; a literatura e os fabricantes indicam valor maior para válvula de descarga (conferir na norma e no catálogo da válvula adotada) |
| Conexões contadas automaticamente pelo aplicativo | `app/src/modelo/rede.ts` | Critério do OpenHidro | Joelho em cada mudança de direção, tê (passagem direta ou saída lateral) em cada derivação, entrada + registro de gaveta na saída do reservatório. Não conta registros dos ramais nem a conexão de saída do ponto — revisar no memorial |
| Registro de pressão — perda localizada | `app/src/modelo/elementos.ts` `MODELOS_REGISTRO` | Critério do OpenHidro | **Pendente**: usa o comprimento equivalente do registro globo; conferir com o fabricante do registro |
| Catálogo de peças Tigre / Amanco | `src/openhidro/catalogo` | Catálogos e páginas públicas dos fabricantes | Nomes, bitolas e combinações de redução conforme material público. **Códigos de fabricante: pendentes** (preencher a partir do catálogo vigente) |
| Rosca de saída e acessórios de cada ponto | `catalogo.PONTOS` | Prática de mercado | Valores usuais (1/2" lavatório, bacia c/ caixa, chuveiro; 3/4" tanque, máquina, torneira de jardim); conferir com os aparelhos especificados |
| Diâmetros internos PVC soldável | `TUBOS_PVC_SOLDAVEL` | Catálogos de fabricantes (NBR 5648) | Pendente — conferir com catálogo atual |
| Comprimentos equivalentes PVC | `LEQ_PVC` | Catálogos de fabricantes | Joelhos, tês, registros, entrada/saída: valores usuais. **Curvas, entrada de borda, registro de ângulo, válvula de retenção e válvula de pé: pendentes** |
| Fair-Whipple-Hsiao (PVC e galvanizado) | `perda_unitaria_fwh` | Literatura técnica | Conferido |
| Alturas usuais dos pontos | `ALTURA_PONTO_M` | Prática de projeto | Apenas valor padrão; o projetista deve informar z |
| UHC e DN mínimo do ramal de descarga | `nbr8160.py` `APARELHOS_ES` | NBR 8160:1999 Tabela 3 | Conferido (EPUSP; eduCAPES) |
| UHC por DN para aparelhos não listados | `UHC_POR_DN_RAMAL` | NBR 8160:1999 Tabela 4 | Conferido |
| Ramais de esgoto | `RAMAL_ESGOTO_MAX_UHC` | NBR 8160:1999 Tabela 5 | Conferido |
| Tubos de queda | `TUBO_QUEDA_MAX_UHC` | NBR 8160:1999 Tabela 6 | Conferido |
| Subcoletores e coletor predial | `COLETOR_MAX_UHC` | NBR 8160:1999 Tabela 7 | Conferido |
| Ramais de ventilação | `RAMAL_VENTILACAO_*` | NBR 8160:1999 Tabela 8 | Conferido |
| Declividades mínimas (2 % DN ≤ 75; 1 % DN ≥ 100) e máxima 5 % | `nbr8160.py` | NBR 8160:1999 | Conferido |
| Limite de UHC em caixas sifonadas (100: 6; 125: 10; 150: 15) | `esgoto.py` | NBR 8160:1999 | Pendente |
| Consumo per capita | `consumo.py` | Macintyre / literatura | Valores de referência — confirmar com a concessionária |

Para conferir um item: abra uma *issue* com a tabela da norma (edição, número da tabela, página) e
o valor divergente.

## Ducha higiênica (água fria)

- Peso 0,1 e vazão 0,10 L/s adotados por **equivalência ao bidê** (NBR 5626:1998, Tabela A.1), porque
  a ducha higiênica não consta da tabela de pesos. **Pendente**: confirmar em norma, catálogo de fabricante
  ou literatura técnica. Altura padrão 0,45 m (tabela de alturas do escritório).
