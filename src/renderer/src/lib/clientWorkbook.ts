/** Guided structure of a client's Workbook.md, which is sent as context to new sessions. */
export const WORKBOOK_TEMPLATE = `# Contexto do cliente

## Ambiente SAP
- Produto e release (ECC, S/4HANA, versão do ABAP):
- Ambientes e rota de transporte:

## Convenções de desenvolvimento
- Nomenclatura de objetos Z/Y:
- Pacotes e classes de mensagem:
- Estilo ABAP exigido (ex.: Clean ABAP, sintaxe disponível):

## Objetos Z relevantes
| Objeto | Tipo | Para que serve |
|---|---|---|
|  |  |  |

## Regras de negócio
-

## Restrições e cuidados
-
`

/** Asks the agent for workbook additions; a workspace admin reviews and pastes them. */
export const WORKBOOK_SUGGESTION_PROMPT =
  'Com base somente nesta conversa, sugira acréscimos ao Workbook do cliente nas seções: Ambiente SAP, Convenções de desenvolvimento, Objetos Z relevantes, Regras de negócio e Restrições e cuidados. Inclua apenas fatos confirmados pelo usuário ou por arquivos lidos, indicando a origem de cada um. Omita seções sem fatos novos, não repita o que já está no workbook, não inclua senhas, chaves ou dados pessoais e não gere código. Responda em Markdown pronto para revisão.'
