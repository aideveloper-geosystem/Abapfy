# Clientes, código ABAP e tarefas pessoais

## Ativação

Aplicar, nesta ordem, no banco Supabase do projeto:

1. `supabase/sql/036_shared_client_parameters.sql`
2. `supabase/sql/037_personal_task_sessions.sql`

As migrations anteriores (incluindo suas políticas RLS) devem estar aplicadas. Reinicie o aplicativo após atualizar o código principal do Electron.

A 036 cria uma fonte compartilhada para fatores de cliente. Mantém as cópias antigas para recuperação e retira a escrita nelas. Para cada empresa, escolhe uma cópia priorizando MASTER, ADMIN e depois a atualização mais recente. Revise os fatores escolhidos após migrar se havia divergências. Estimativas por tipo/objeto/complexidade continuam com o comportamento anterior.

A 037 adiciona cliente, área, pasta e sessão da subtarefa, recuperando vínculos existentes de chats/projetos quando pertencem ao mesmo usuário. As políticas de tarefas e subtarefas continuam restritas ao proprietário, inclusive para administradores. Vincular um cliente compartilhado não compartilha o Kanban.

## Uso

- Em Configurações → Parâmetros → Clientes, todos consultam a mesma tabela; ADMIN e MASTER podem editar. A restrição também existe no banco.
- No chat, escolha cliente, área e pasta do drive. Blocos completos de código com linguagem `abap` ou `sap-abap` são salvos automaticamente ao terminar a resposta. Pastas vazias também podem receber entregas.
- Cada bloco gera um arquivo `.abap`, com nome inferido do programa/classe ou um nome sequencial. O original em UTF-8 e o conteúdo pesquisável são registrados no drive. Arquivos anteriores são preservados; respostas com erro ou interrompidas não geram artefatos.
- A atividade da resposta confirma os nomes salvos ou mostra a falha. O código permanece na conversa se o drive falhar. Repetir o mesmo trabalho de salvamento reutiliza o identificador e o binário; gerar outra resposta cria outra versão.
- Em Tarefas, selecione cliente, área e pasta no card. Use o filtro de clientes para organizar o quadro pessoal.
- Execute a tarefa completa ou uma subtarefa. As alterações do card são salvas antes do lançamento. Uma nova sessão recebe cliente, pasta, projeto, descrição e checklist; o roteador normal escolhe o agente. A sessão fica vinculada ao item para reabertura e continua no fluxo de processamento do chat enquanto o aplicativo está aberto.
- Revise a entrega antes de marcar o checklist como concluído. O lançamento de tarefa não ativa o acesso ao SAP automaticamente.

## Controle SAP

A ativação da janela tenta primeiro o foco direto e, quando necessário, conecta temporariamente as filas de entrada para a transferência de foco. Sempre desconecta as filas no bloco de limpeza. Verifica o foco antes de enviar entrada, mantém a validação da captura, geometria e processo, e não repete entradas com resultado incerto. Foi removida a espera fixa por caractere. O helper continua serializado e reutilizável.

Referências: [SetForegroundWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow) e [AttachThreadInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-attachthreadinput).

## Validação operacional pendente

Validar no ambiente autenticado: policies e migrations aplicadas, duas contas vendo somente suas próprias tarefas, usuário comum sem escrita em parâmetros, ADMIN/MASTER editando a mesma tabela, uploads na pasta correta e retomada da sessão vinculada. Validar também foco e digitação no SAP real com Abapfy em janela e maximizado, inclusive após uma aprovação. Os testes sintéticos de captura/enumeração não substituem essa verificação.
