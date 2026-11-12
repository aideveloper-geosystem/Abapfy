# Workspaces e nova interface

Este documento descreve o modelo de workspaces (migração `041`), os temas (migração `042`) e o novo layout do app.

## Modelo de workspaces

Um workspace reúne pessoas e clientes. Cada pessoa pertence a **um** workspace (`unique(user_id)` em `workspace_members`; a restrição pode ser removida se um dia houver mais de um por pessoa).

| Ação | Proprietário | Administrador | Membro |
| --- | :---: | :---: | :---: |
| Ler clientes, módulos, projetos, sessões e drive | sim | sim | sim |
| Enviar arquivos ao drive e criar pastas | sim | sim | sim |
| Criar e editar clientes e módulos | sim | sim | não |
| Arquivar e desarquivar clientes | sim | sim | não |
| Criar e editar projetos | sim | sim | não |
| Editar e mover arquivos, restaurar da lixeira | sim | sim | não |
| Excluir clientes, módulos, projetos e pastas | sim | **não** | não |
| Mover arquivos para a lixeira e esvaziá-la | sim | **não** | não |
| Aprovar ou recusar pedidos de entrada, gerar código | sim | sim | não |
| Remover pessoas e alterar papéis | sim | não | não |
| Sair do workspace | sim | sim | sim |

Sessões (chats) ficam abertas a todos os membros, porque são a forma de trabalhar. Mover arquivo para a lixeira conta como exclusão, então o administrador não faz isso; ele consegue restaurar o que o proprietário apagou. Criar pasta fica liberado para qualquer membro porque os fluxos de envio e a geração de documentos pelo agente criam pastas.

A matriz é aplicada por RLS e gatilhos na migração `043_workspace_role_permissions.sql` e espelhada na interface por `clientPermissions` (`src/renderer/src/lib/workspaceAccess.ts`). A interface esconde o que seria recusado, mas nunca é a única barreira. Parâmetros compartilhados de cliente, conhecimento de projeto e acesso ao workspace continuam com as regras anteriores e ficam para uma segunda etapa.

Regras que o banco garante: o workspace sempre tem ao menos um proprietário; o proprietário não pode ser removido por outra pessoa; só o proprietário concede `ADMIN`; qualquer pessoa pode sair.

### Entrada

1. Quem se cadastra sem workspace vê a tela "Escolha seu workspace".
2. **Criar workspace**: vira `OWNER`.
3. **Entrar com código**: informa o código de 10 caracteres que um administrador compartilhou e, se quiser, uma mensagem. O pedido fica `PENDING` até um proprietário ou administrador decidir. O acesso é liberado assim que o pedido é aprovado (botão "Verificar agora").
4. O código pode ser regenerado na tela Workspace; o código anterior deixa de valer.

O código só é lido por proprietário e administrador, por `my_workspace()`. A coluna `join_code` não tem `SELECT` direto para membros comuns.

### Conteúdo

- `clients.workspace_id` é obrigatório e imutável. O nome do cliente é único por workspace.
- Projetos, sessões (`chats`), mensagens, arquivos, pastas, eventos da lixeira, presença, documentos de projeto e arquivos do bucket `client-files` herdam o workspace pelo cliente.
- O isolamento usa políticas `RESTRICTIVE`. Todas as políticas anteriores continuam valendo e passam a ser filtradas também pela participação no workspace.
- Cada sessão trabalha dentro de um cliente (e módulo) e pode ter um projeto específico ou não. O drive do cliente é compartilhado entre os membros do workspace e continua disponível ao agente.
- As funções `is_workspace_member`, `is_workspace_admin`, `can_access_client` e similares são `SECURITY DEFINER` para evitar recursão de RLS.

### Papéis globais

`app_roles` (MASTER/ADMIN) continua sendo o papel da plataforma: catálogo de agentes, chaves de IA, modelos e notícias. Ele **não** é sincronizado com o papel no workspace, para que um administrador criado por um novo usuário não ganhe poder sobre dados globais.

## Migração dos usuários existentes

`041_workspaces.sql` cria o workspace **Geral** quando ainda não existe nenhum e move todos os usuários para ele:

| Situação atual | Papel no workspace |
| --- | --- |
| `app_roles.role = 'MASTER'` | `OWNER` |
| `app_roles.role = 'ADMIN'` | `ADMIN` |
| sem registro em `app_roles` | `MEMBER` |

O proprietário "fundador" é o MASTER mais antigo. Sem MASTER, usa o ADMIN mais antigo; sem ADMIN, o usuário mais antigo. Todos os clientes existentes passam para o Geral. A migração só cria o workspace se a tabela estiver vazia, então reexecutar não duplica nem reorganiza nada.

## Como aplicar

No SQL Editor do Supabase, nesta ordem:

1. `supabase/sql/041_workspaces.sql`
2. `supabase/sql/042_abapfy_themes.sql`
3. `supabase/sql/043_workspace_role_permissions.sql`

Enquanto a 041 não estiver aplicada, o app detecta a ausência da função `my_workspace` e funciona no modo anterior (sem tela de workspace e com permissões pelos papéis globais).

## Testes

- `tests/workspaces-sql.test.mjs` sobe um PostgreSQL temporário (`initdb` em pasta temporária) e executa `tests/sql/workspaces-pre041.sql` (esquema simplificado antes da 041), `tests/sql/workspaces-seed.sql` (MASTER, ADMIN e dois usuários comuns com conteúdo), a migração e `tests/sql/workspaces-041.test.sql`. Cobre migração de usuários, idempotência, isolamento entre workspaces, fluxo de pedido e aprovação, regras de papéis e leitura do código de entrada. O teste é ignorado quando não há binários do PostgreSQL; use `PG_BIN` para apontar a pasta `bin`.
- `tests/workspaces.test.mjs` cobre as regras de acesso, a store e os temas.

## Tela de Clientes

- **Catálogo:** tabela densa (cliente, projetos, sessões, arquivos, última atividade, criador) com ordenação por coluna e alternador para grade, que o app lembra. Chips Todos, Meus, Favoritos e Arquivados com contagem; busca por nome, descrição e criador; criador como filtro avançado em popover. Favoritar é por usuário (`client_favorites`). "Nova sessão" em cada linha abre a Nova sessão já no cliente.
- **Página do cliente:** cabeçalho com nome, criador, selo do papel e ações permitidas, e abas Visão geral (números, descrição, workbook, módulos), Drive (módulos, arquivos, pastas e lixeira), Projetos e Sessões.
- **Arquivar:** proprietário e administrador arquivam e desarquivam (`clients.archived_at`, com autor registrado pelo servidor). Só o proprietário exclui definitivamente. Cliente arquivado fica fora de Todos e continua legível.
- **Novo cliente:** nome, módulos (Programas, EFs e DTECs vêm do modelo padrão; outros opcionais) e, se quiser, copiar o workbook de outro cliente.
- **Segunda etapa:** parâmetros do cliente, template de EF, aba de acesso por cliente e arquivamento de projetos.

## Interface

### Navegação

- Sidebar à esquerda: cabeçalho com o nome do workspace, **Nova sessão**, **Pesquisa**, **Projetos**, **Clientes**, **Fluxos** e "Mais" (Tarefas, Skills, Agentes, Notícias). Abaixo, as sessões agrupadas por cliente e a lista de projetos.
- **Pesquisa** abre uma paleta de comandos (também por Ctrl+K) sobre sessões, projetos e clientes.
- Perfil na base: menu com Configurações, Uso, Workspace, Changelog (notas da versão) e Sair.

### Painel direito

No chat, o painel de contexto fica acoplado à direita (largura `--context-panel-width`) e lembra se estava aberto. Seções: Sessão (cliente, módulo, projeto, agente), Ambiente (conexão SAP), Contexto (uso em %, compactação, arquivos) e Conectores (skills e MCP). Abaixo de 1100px ele sobrepõe o chat em vez de reservar espaço.

### Temas

Dois temas, definidos em `src/renderer/src/lib/themes.ts`: `abapfy-dark` (padrão) e `abapfy-light`. Todo componente consome tokens CSS (`--color-*`, `--radius-*`, `--shadow-*`, `--duration-*`), inclusive chat e cartões de resultado. Os tokens de apoio ao layout são `--color-sidebar`, `--color-panel`, `--color-hover`, `--color-selected` e `--color-accent-soft`. Ids antigos (SAP Horizon e Quartz) são convertidos para o tema escuro ou claro equivalente, no cliente e pela migração 042. Animações usam `--ease-out` e durações curtas e respeitam `prefers-reduced-motion`.
