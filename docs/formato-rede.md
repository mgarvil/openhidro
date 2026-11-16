# Formato da rede (JSON)

```json
{
  "sistema": "agua_fria",
  "nome": "Banheiro social",
  "parametros": { "nivel_agua_m": 0.0, "acrescimo_localizadas": 0.0 },
  "nos": [
    { "id": "RES", "x": 0, "y": 0, "z": 5.0, "tipo": "reservatorio" },
    { "id": "A",   "x": 0, "y": 0, "z": 2.8 },
    { "id": "LAV", "x": 3, "y": 1, "z": 0.6, "tipo": "ponto", "aparelho": "lavatorio" }
  ],
  "trechos": [
    { "id": "T1", "de": "RES", "para": "A",   "conexoes": { "entrada_normal": 1, "registro_gaveta": 1, "joelho_90": 2 } },
    { "id": "T2", "de": "A",   "para": "LAV", "conexoes": { "te_saida_lateral": 1, "joelho_90": 2 } }
  ]
}
```

## Nós

| campo | descrição |
|---|---|
| `id` | identificador único |
| `x`, `y`, `z` | coordenadas em metros; `z` é a cota (para pontos de utilização, a cota do ponto) |
| `tipo` | `reservatorio`, `ponto`, `juncao` (padrão), `caixa_sifonada`, `caixa_inspecao`, `saida` |
| `aparelho` | chave do aparelho (`openhidro aparelhos` lista todas) |
| `quantidade` | nº de aparelhos iguais no nó (ou metros, para mictório de calha) |
| `rotulo` | texto livre |

## Trechos

| campo | descrição |
|---|---|
| `id`, `de`, `para` | identificação e nós de início/fim |
| `comprimento` | m; se omitido = projeção horizontal + desnível |
| `conexoes` | água fria: `{peça: quantidade}` para perdas localizadas |
| `dn` | DN imposto pelo projetista (o cálculo verifica, não altera) |
| `tipo` | esgoto: `ramal_descarga`, `ramal_esgoto`, `tubo_queda`, `subcoletor`, `coletor` (se omitido, é inferido) |
| `declividade` | esgoto, m/m; se omitida, calculada pelas cotas ou `parametros.declividade_padrao` |

## Parâmetros

Água fria: `material` (`pvc`), `formula_perda` (`fwh` ou `darcy`), `velocidade_max_ms`,
`pressao_min_ponto_kpa`, `pressao_min_rede_kpa`, `pressao_max_estatica_kpa`,
`acrescimo_localizadas` (fração do comprimento quando o trecho não lista conexões), `dn_minimo`,
`dimensionar_por_pressao`, `nivel_agua_m`.

Esgoto: `pavimentos`, `declividade_padrao`, `diametro_caixa_sifonada`.

## Convenções

* A rede é uma **árvore** (sem anéis).
* Água fria: um único nó `reservatorio`; trechos de montante para jusante.
* Esgoto: trechos no sentido do escoamento; um único nó final (sem trecho de saída).
