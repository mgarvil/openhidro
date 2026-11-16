---
name: projeto-hidrossanitario
description: Conduz um projeto hidrossanitário predial (água fria NBR 5626, esgoto NBR 8160, reservatórios) com o OpenHidro — montar a rede a partir de planta/DXF ou descrição, dimensionar, revisar alertas e entregar memorial. Use quando o usuário pedir para dimensionar água fria, esgoto, reservatório ou ler tubulação de um DXF.
---

# Projeto hidrossanitário com o OpenHidro

## 1. Entender o que existe
- Pergunte apenas o essencial que faltar: tipo de edificação, nº de pavimentos, posição e cota do
  reservatório, pé-direito/cota do barrilete, aparelhos por ambiente.
- Se houver DXF: identifique a camada da tubulação e os nomes dos blocos de aparelhos
  (liste-os lendo o arquivo com `ezdxf`) antes de montar a configuração.

## 2. Montar a rede
- Água fria: um nó `reservatorio`; trechos do reservatório para os pontos; `z` dos pontos =
  cota do piso + altura do ponto (`ALTURA_PONTO_M` se o usuário não informar).
- Esgoto: trechos no sentido do escoamento até um único nó final (caixa de inspeção/rede).
  Bacia → ramal DN 100; lavatório/chuveiro/ralos → caixa sifonada → ramal de esgoto.
- Informe conexões nos trechos de água fria quando conhecidas; senão use
  `acrescimo_localizadas` (0,20–0,30) e diga isso no resumo.
- Use `listar_aparelhos` para as chaves válidas. Não invente chave.

## 3. Calcular
- Ferramentas MCP: `dimensionar_rede`, `dimensionar_dxf`, `calcular_reservatorio`.
- Sem MCP: `openhidro calcular rede.json -o saida/` ou a API Python.

## 4. Revisar antes de entregar
- Leia todos os `alertas`. `ERRO` = não atende à norma: proponha a correção (subir o
  reservatório, pressurizador, aumentar DN imposto, corrigir declividade) e recalcule.
- Confira se o ponto mais desfavorável (geralmente o chuveiro mais alto e mais distante) tem a
  pressão mínima.
- Verifique se diâmetros não diminuem rumo ao reservatório / no sentido do escoamento.

## 5. Entregar
- Memorial (Markdown) + tabela CSV + DXF anotado quando houver DXF.
- Sempre lembre que os valores são preliminares e que a responsabilidade técnica é do
  engenheiro; aponte as tabelas ainda pendentes em `docs/conferencia-normas.md` se afetarem o
  resultado.
