# Como contribuir

1. Abra uma *issue* descrevendo a melhoria ou o erro (para erro de tabela: norma, edição, tabela,
   valor correto).
2. Faça um *fork*, crie um ramo (`git checkout -b agua-quente`) e trabalhe nele.
3. Rode os testes: `python -m pytest -q`. Todo cálculo novo precisa de um teste com um exemplo
   resolvido à mão.
4. Abra um *Pull Request*. Mudanças em tabelas normativas são revisadas por um engenheiro.

## Usando o Claude para contribuir

Cada colaborador usa a própria conta. Ao abrir o repositório no Claude Code, o arquivo
`CLAUDE.md` é lido automaticamente e traz as regras do projeto. Peça, por exemplo:

> "Implemente o dimensionamento de calhas da NBR 10844 seguindo o CLAUDE.md, com testes."

Revise o que o Claude escrever antes de abrir o PR — especialmente valores de tabelas.

## Regra de sala limpa

Não copie código, bibliotecas de peças, formatos de arquivo internos nem telas de softwares
comerciais. Use apenas normas, literatura técnica, catálogos públicos e seu conhecimento.
