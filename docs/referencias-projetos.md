# Referências: projetos entregues pela MGarvil

Padrões de lançamento e de detalhamento observados nos PDFs de projetos hidrossanitários da
MGarvil Engenharia. São projetos do próprio escritório, usados como referência de **resultado
esperado**. Não copiamos software nem formatos de terceiros (regra de sala limpa): registramos só
convenções de desenho e de entrega que o engenheiro adota.

Os valores marcados como **padrão do escritório** são práticas usuais da MGarvil e não números
de norma. No OpenHidro eles entram como padrão editável, nunca como exigência normativa.

## Projetos analisados (1ª rodada, 17/11/2026)

| Ref. | Tipo | Folhas | Ferramenta de origem |
|---|---|---|---|
| R1 | Residência térrea com barrilete (HID + SAN) | 3 | QiBuilder |
| R2 | Residência, projeto de instalações completo (HID, SAN, pluvial, elétrico) | 8 | QiBuilder |
| R3 | Residência de um pavimento (HID e SAN, uma folha cada) | 2 | QiBuilder |
| R4 | Escola municipal (HID + SAN, A0) | 9 | AutoCAD (base QiBuilder) |
| R5 | Hospital, ala de imagem no subsolo (HID e SAN, A1) | 2 | AutoCAD |
| R6 | Instruções do contratante e revisão do contratante (hospital) | 2 docs | Word |
| R7 | Campus de terceiros (projeto recebido, A0) | 1 | gcad, usado para comparação |

Os nomes dos clientes ficam fora do repositório; os arquivos ficam na pasta do escritório.

## 1. Planta baixa de água fria

- Escala 1/50 para o pavimento e 1/100 para cobertura ou barrilete.
- Cada coluna é identificada por um balão com divisória: em cima `AF-n`, embaixo `ø25`. A
  alimentação a partir do hidrômetro usa `AL-n` com a mesma forma.
- O rótulo do trecho tem duas linhas: `PVC ø25` sobre `L=0.9` (material e DN, depois o comprimento
  em metros).
- Cores:
  - azul para água fria;
  - verde para a alimentação da rede (hidrômetro → reservatório);
  - vermelho para água quente (CPVC);
  - roxo para reúso.
- Cada ambiente detalhado leva um retângulo tracejado com o nome do detalhe (`HID-1`, `HID-2`…).
  Esse nome é o título do isométrico correspondente.
- Os pontos recebem sigla e especificação ao lado: `LV 25 mm - 1/2"`, `MLL 25 mm - 3/4"`.
- Notas de obra vão em texto livre com chamada, por exemplo "Extravasor reservatório (posicionar
  saída em ponto visível)".
- Tubulação que desce, que sobe ou que sobe e desce tem símbolo próprio: círculo com a linha
  saindo para baixo, para cima ou para os dois lados.
- O hidrômetro vem com detalhe do abrigo (vista frontal e isométrica).

## 2. Isométrico de água fria (o item mais cobrado)

- Um isométrico por ambiente, com título `DETALHE HID-n` e escala 1:25, marcado com o símbolo
  verde de detalhe.
- **A coluna desce do forro.** O balão `AF-n / øDN` fica no topo da descida.
- **O registro de gaveta fica na descida.** A cadeia de cotas (80 + 100 = 180) o coloca a 1,80 m.
- Os ramais horizontais correm baixos, junto do piso, e sobem até cada ponto. Também existe a
  variante de ramal alto que desce para cada ponto: as duas aparecem.
- **Cotas verticais em vermelho** dos dois lados: alturas acumuladas do piso até o ponto, o
  registro e o forro (ex.: 30 / 80 / 40 / 180). As linhas de chamada também são vermelhas.
- **Cotas horizontais no plano do piso**, localizando cada louça a partir da parede
  (ex.: 15 / 30 / 81,4 / 29,9 / 70,9).
- O piso é desenhado em isométrico com o contorno das louças tracejado (vaso, lavatório, ralo,
  cooktop, cubas).
- O DN aparece ao longo do trecho (`ø25`, `ø32`) com um pequeno marcador azul.
- O tubo é desenhado em 3D sombreado (marrom do PVC soldável), com conexões visíveis.
- O registro é desenhado como peça 3D, com rótulo `RG 3/4"` ou `RP 3/4"`.
- Cada isométrico traz uma tabela "Legenda das indicações": sigla e descrição com a conexão de
  ponta. Exemplos:
  - CH = Chuveiro 25 mm x 3/4";
  - DH = Ducha higiênica com joelho de 90° 32 mm x 1/2";
  - VS = Vaso com válvula de descarga 1 1/2".
- Trechos sob o piso levam a nota "Tubulação abaixo de piso (-20 cm)".
- Pontos de espera para o futuro levam nota própria ("Ponto água para futuras instalações").

## 3. Esgoto (planta e detalhe 1:25)

- O esgoto é desenhado em **faixa amarela e laranja**: contorno escuro, preenchimento claro e
  sombreado. A ventilação é desenhada em ciano.
- Cada trecho tem `øDN` e `i=1%` ou `i=2%`, com **seta verde** indicando o sentido do escoamento.
- **Ramais entram no subcoletor a 45°**, como já estava na regra anterior.
- As caixas são desenhadas em planta como quadrado com tampa:
  - CE = caixa de esgoto/inspeção;
  - CG = caixa de gordura;
  - CS = caixa sifonada;
  - CAG = caixa de águas pluviais/grelha.
- As caixas levam a cota da tampa e a cota do fundo na chamada (`CT:0` / `CF:-47.79`).
- A coluna de ventilação aparece em balão `CV-n / ø75`.
- O detalhe SAN do banheiro em 1:25 é cotado por pontos (eixo do vaso e do ralo a partir das
  paredes), com cadeia de cotas em vermelho.
- Notas de obra no próprio desenho, por exemplo "Criar sifonamento".
- A lista de materiais é separada por local ("Lista de materiais – Laje").

## 4. Detalhes padrão (repetidos de um projeto para outro)

- **Gabarito de altura das peças**, com louças de referência e medidas em cm.
- **Instalação do vaso sanitário**, com a relação de materiais numerada.
- **Pia com cuba, lavatório e tanque**, cada um com a relação de materiais numerada.
- **Caixa de passagem de esgoto 1:20**, em planta e corte:
  - alvenaria 40×40;
  - tampa de concreto 60×60;
  - fundo de concreto de 5 cm.
- **Ralo sifonado 1:10** e **montagem do vaso 1:25**.
- **Terminal de ventilação**, no mínimo 30 cm acima do telhado.
- **Dreno de split** embutido.
- **Abrigo do hidrômetro** (simples e duplo).

## 5. Tabelas e notas da folha

- Folha "Legendas e simbologias – Hidráulica", com estas seções:
  - indicações (AF-x, AL-x);
  - tubulação, com cor e seta de sentido;
  - abreviações;
  - conexões em planta (tê ou joelho que sobe ou desce);
  - registros;
  - diversos.
- **Tabela 1 (passagens em vigas e lajes)**: o furo tem o DN comercial seguinte. Por exemplo,
  ø25 pede passagem ø40 e ø50 pede ø75.
- **Tabela 2 (altura dos pontos)**, padrão do escritório, em cm:

| Ponto | Altura |
|---|---|
| Registro de gaveta | 180 |
| Chuveiro | 210 |
| Registro de pressão | 100 |
| Filtro | 140 |
| Lavatório adulto | 60 |
| Lavatório infantil | 45 |
| Pia de parede, tanque, mictório | 110 |
| Pia em bancada | 60 |
| Vaso sanitário | 30 |
| Válvula de descarga | 100 |
| Torneira de lavagem | 60 |
| Ducha higiênica | 45 |
| Bebedouro adulto | 88 |
| Bebedouro infantil | 57 |

- **Tabela de conversões**: CPVC, cobre, PVC soldável, PEX e polegadas.
- **Notas de água**, numeradas:
  - tubulação aparente pintada de verde;
  - tubos em PVC soldável;
  - as built a cargo da contratada;
  - valas com leito de areia;
  - normas NBR 5626/2020 e NBR 5651;
  - "vide detalhes".

## 6. Entrega (exigências dos contratantes)

- Nomenclatura rígida: `CLIENTE_DISC_FASE-XX_YY-PAV-R00`, por exemplo
  `HSLS_HID_PE-01_01-1SUB-R00`. Nos projetos residenciais: `RES-HID-01-PAV`, `RES-SAN-03-PLA`.
- Um arquivo DWG e um PDF por prancha, nas pastas `01_Pranchas DWG` e `02_Pranchas PDF`.
- O selo precisa de **quadro de revisões**: rev., descrição, revisor, aprovação e data. Também
  precisa aceitar logo do contratante, folha com numeração própria do contratante e disciplina
  editável.
- Os contratantes recusam notas do tipo "confirmar em projeto X" quando X faz parte da mesma
  entrega. A alternativa usada é "Cabe à contratada avaliar todas as pranchas…".
- **Planta-chave** (key plan) com a área de intervenção destacada, quando o projeto cobre só parte
  do edifício.

## 7. Comparação com o OpenHidro 0.8 e backlog

| # | Diferença | Prioridade |
|---|---|---|
| 1 | Isométrico sem cadeia de cotas verticais (piso → pontos → RG → forro) e sem cotas no piso | Alta |
| 2 | Isométrico sem desenho do piso com contorno das louças | Alta |
| 3 | Balão de coluna `AF-n / øDN` e de ventilação `CV-n` fora do padrão (falta a divisória) | Alta |
| 4 | Rótulo do trecho em planta sem `L=` (comprimento) | Alta |
| 5 | Retângulo tracejado `HID-n` na planta ligando o ambiente ao isométrico | Alta |
| 6 | Esgoto: faixa amarela, seta verde de sentido, cotas CT/CF nas caixas | Alta |
| 7 | Tabela "Legenda das indicações" por isométrico (sigla + DN x rosca + conexão de ponta) | Média |
| 8 | Folha de legendas e simbologias, Tabela 1 (passagens) e Tabela 2 (alturas) | Média |
| 9 | Biblioteca de detalhes padrão (vaso, pia, lavatório, tanque, caixa, ralo, terminal, hidrômetro) | Média |
| 10 | Alturas padrão dos pontos pela Tabela 2 (hoje são fixas no código) | Alta |
| 11 | Quadro de revisões no selo, logo do contratante, numeração de folha configurável | Média |
| 12 | Nomenclatura de arquivo configurável e exportação de uma prancha por arquivo | Média |
| 13 | Detalhe SAN 1:25 por ambiente (planta ampliada cotada) | Média |
| 14 | Planta-chave com área destacada | Baixa |
| 15 | Símbolos de tubulação que sobe, desce ou sobe e desce na planta | Média |
| 16 | Lista de materiais por local (laje, piso, parede) | Baixa |
