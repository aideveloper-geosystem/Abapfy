# Tarefas em grupo

Quadros compartilhados de tarefas para equipes do mesmo workspace (migração `044`). O quadro pessoal continua igual e convive com os quadros em grupo.

## Como funciona

- **Quadros:** na tela Tarefas, as abas no topo alternam entre "Meu quadro" e os quadros em grupo dos quais a pessoa participa. "Quadro em grupo" cria um novo, com nome, cliente e projeto opcionais e a escolha dos membros entre as pessoas do workspace. A criação é atômica (`create_task_board`) e já traz as quatro colunas padrão.
- **Membros:** quem está no quadro vê e edita todas as tarefas, subtarefas e colunas. Qualquer membro adiciona pessoas do workspace; cada pessoa pode sair; o criador, o proprietário e o administrador removem outras pessoas. Sair ou ser removido libera as tarefas daquela pessoa.
- **Responsável:** é uma pessoa do quadro (`tasks.assignee_id`). O card mostra o avatar, ou "Livre" com o botão **Assumir**. Assumir é atômico (`claim_task`): se duas pessoas clicam juntas, só a primeira leva e a outra recebe o aviso "Outra pessoa assumiu esta tarefa antes de você". **Liberar** só vale para quem assumiu; qualquer membro pode reatribuir pelo seletor. Filtros rápidos: Todas, Minhas e Sem responsável.
- **Tempo real:** tarefas, subtarefas, colunas, membros, histórico e comentários chegam por Supabase Realtime enquanto a tela está aberta. A RLS vale também para o Realtime. Quem está online no quadro aparece no topo, e os cards abertos por outras pessoas mostram os avatares delas.
- **Histórico:** o painel **Atividade** lista as últimas ações do quadro; a aba Histórico de cada tarefa mostra criação, mudança de coluna, atribuição, alterações de título, prioridade, prazo e descrição e subtarefas concluídas. Os eventos são gravados por gatilhos, com o autor vindo de `auth.uid()`.
- **Comentários:** existem apenas em tarefas de quadros em grupo. Só o autor apaga o próprio comentário (proprietário e administrador também).
- **Mover tarefa pessoal para o grupo:** no detalhe de uma tarefa do quadro pessoal, "Mover para um quadro em grupo…" (migração `045`, `move_task_to_board`). A tarefa mantém subtarefas e sessões; a coluna é mapeada (mesma chave, ou pela natureza: concluída, bloqueada, primeira aberta), o responsável fica livre e as dependências do quadro pessoal são removidas. Se o quadro tem cliente ou projeto fixo diferente do da tarefa, a mudança é recusada. Só o dono move, e não há volta.
- **Sessões do agente:** executar uma tarefa abre uma sessão em nome de quem executou. Sessões são abertas a todo o workspace, então os demais membros podem abrir o chat vinculado.

## Regras do banco

| Ação | Membro do quadro | Proprietário/administrador do workspace sem ser membro |
| --- | :---: | :---: |
| Ler e editar tarefas, subtarefas, comentários | sim | não |
| Criar, renomear e reordenar colunas | sim | não |
| Excluir colunas | não | sim |
| Excluir o quadro | não | sim |
| Ver o quadro, suas colunas e membros | sim | sim |

- Um quadro com cliente ou projeto força esses vínculos nas tarefas. Cliente e projeto precisam ser do workspace do quadro; o responsável precisa ser membro do quadro.
- `board_id` e `user_id` de uma tarefa não mudam depois de criada. Tarefas pessoais continuam restritas ao dono e não têm responsável por pessoa.
- A sessão vinculada a uma tarefa de quadro precisa ser de quem a vincula e do mesmo cliente.

## Como aplicar

No SQL Editor do Supabase, depois da 043: `supabase/sql/044_shared_task_boards.sql` e, para mover tarefas pessoais, `supabase/sql/045_move_task_to_board.sql`. Pode ser executada mais de uma vez e exige PostgreSQL 15 ou superior (`unique nulls not distinct`). Antes dela, o app funciona só com o quadro pessoal.

## Testes

- `tests/sql/task-boards-044.test.sql` (rodado por `tests/workspaces-sql.test.mjs`): criação do quadro, visibilidade, claim atômico, histórico, comentários, colunas e exclusão com cascata.
- `tests/shared-tasks.test.mjs`: store (escopo das mutações, claim, saída de membros).

## Ficou para depois

Notificação de menção/atribuição, arquivar quadros e permissões por papel dentro do quadro.
