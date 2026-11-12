# Workspaces e nova interface

Este documento descreve o modelo de workspaces (migração `041`), os temas (migração `042`) e o novo layout do app.

## Modelo de workspaces

Um workspace reúne pessoas e clientes. Cada pessoa pertence a **um** workspace (`unique(user_id)` em `workspace_members`; a restrição pode ser removida se um dia houver mais de um por pessoa).

| Papel | Pode |
| --- | --- |
| `OWNER` (proprietário) | Tudo do administrador, mais alterar papéis, remover administradores e promover a proprietário. |
| `ADMIN` (administrador) | Ver e gerar o código de entrada, aprovar ou recusar pedidos (como membro), remover membros, criar, editar e excluir clientes, esvaziar a lixeira do drive. |
| `MEMBER` (membro) | Usar clientes, projetos, sessões e o drive compartilhado. |

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

Enquanto a 041 não estiver aplicada, o app detecta a ausência da função `my_workspace` e funciona no modo anterior (sem tela de workspace e com permissões pelos papéis globais).

## Testes

- `tests/workspaces-sql.test.mjs` sobe um PostgreSQL temporário (`initdb` em pasta temporária) e executa `tests/sql/workspaces-pre041.sql` (esquema simplificado antes da 041), `tests/sql/workspaces-seed.sql` (MASTER, ADMIN e dois usuários comuns com conteúdo), a migração e `tests/sql/workspaces-041.test.sql`. Cobre migração de usuários, idempotência, isolamento entre workspaces, fluxo de pedido e aprovação, regras de papéis e leitura do código de entrada. O teste é ignorado quando não há binários do PostgreSQL; use `PG_BIN` para apontar a pasta `bin`.
- `tests/workspaces.test.mjs` cobre as regras de acesso, a store e os temas.

## Interface

### Navegação

- Sidebar à esquerda: cabeçalho com o nome do workspace, **Nova sessão**, **Pesquisa**, **Projetos**, **Clientes**, **Fluxos** e "Mais" (Tarefas, Skills, Agentes, Notícias). Abaixo, as sessões agrupadas por cliente e a lista de projetos.
- **Pesquisa** abre uma paleta de comandos (também por Ctrl+K) sobre sessões, projetos e clientes.
- Perfil na base: menu com Configurações, Uso, Workspace, Changelog (notas da versão) e Sair.

### Painel direito

No chat, o painel de contexto fica acoplado à direita (largura `--context-panel-width`) e lembra se estava aberto. Seções: Sessão (cliente, módulo, projeto, agente), Ambiente (conexão SAP), Contexto (uso em %, compactação, arquivos) e Conectores (skills e MCP). Abaixo de 1100px ele sobrepõe o chat em vez de reservar espaço.

### Temas

Dois temas, definidos em `src/renderer/src/lib/themes.ts`: `abapfy-dark` (padrão) e `abapfy-light`. Todo componente consome tokens CSS (`--color-*`, `--radius-*`, `--shadow-*`, `--duration-*`), inclusive chat e cartões de resultado. Os tokens de apoio ao layout são `--color-sidebar`, `--color-panel`, `--color-hover`, `--color-selected` e `--color-accent-soft`. Ids antigos (SAP Horizon e Quartz) são convertidos para o tema escuro ou claro equivalente, no cliente e pela migração 042. Animações usam `--ease-out` e durações curtas e respeitam `prefers-reduced-motion`.
