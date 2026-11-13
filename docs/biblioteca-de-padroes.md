# Biblioteca de padrões aprovados por cliente

Código ABAP aprovado pela equipe vira referência para o agente nas sessões daquele cliente (migração `046`).

## Fluxo

1. O agente gera um bloco `abap` no chat. O código continua sendo salvo no drive como antes, mas **só entra na biblioteca quando alguém aprova**.
2. No cabeçalho do bloco, o atalho **Aprovar** abre um pequeno formulário: título (sugerido pelo nome do programa ou classe), "quando usar" e tags. O botão fica desabilitado enquanto a resposta ainda está sendo escrita, para não aprovar um bloco incompleto.
3. A aprovação grava o padrão (`client_code_patterns`) e guarda uma cópia no drive do cliente, na pasta **Padrões aprovados** do módulo da sessão. Se a cópia no drive falhar, a aprovação vale e o erro é mostrado.
4. Blocos já aprovados mostram o selo **Aprovado**.
5. A cada mensagem da sessão, o app busca os padrões ativos do cliente e envia ao agente até 5 deles (limite de 8 mil caracteres), escolhidos pela afinidade com o pedido (título, tags, descrição e identificadores) e, em empate, os mais recentes. O agente é instruído a seguir nomenclatura, tratamento de erros, BAPIs e estrutura quando fizer sentido, sem copiar o que não se aplica, e a dizer qual padrão seguiu. Se a biblioteca estiver indisponível, a mensagem segue sem ela.

## Gestão

Aba **Padrões** na página do cliente: busca, ver e copiar o código, editar título, descrição e tags, **revogar** (o agente deixa de usar) e excluir.

| Ação | Quem aprovou | Outros membros | Proprietário/administrador |
| --- | :---: | :---: | :---: |
| Aprovar | sim | sim | sim |
| Ler a biblioteca | sim | sim | sim |
| Editar detalhes e revogar | sim | não | sim |
| Excluir definitivamente | não | não | sim |

- O texto aprovado não muda. Para corrigir, revogue e aprove a nova versão.
- O mesmo código só tem uma aprovação ativa por cliente. Revogado, pode ser aprovado de novo.
- A revogação é carimbada pelo servidor (quem e quando).

## Aplicar

No SQL Editor do Supabase, depois da 045: `supabase/sql/046_client_code_patterns.sql`. Antes dela, o botão Aprovar mostra o erro do banco e o chat segue normal.

## Testes

- `tests/sql/code-patterns-046.test.sql`: aprovação, autor vindo do servidor, duplicidade, imutabilidade, revogação e exclusão por papel.
- `tests/code-patterns.test.mjs`: tipo e título sugeridos, tags, escolha por relevância e orçamento, bloco de contexto e fluxo de aprovação (incluindo falha do drive).

## Ficou para depois

Busca semântica (hoje é por palavras), revisão antes de aprovar, versões de um mesmo padrão e visão global entre clientes.
