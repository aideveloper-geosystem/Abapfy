# Organização do conteúdo compartilhado

A navegação distingue autoria sem alterar a visibilidade pública entre usuários autenticados nem as permissões existentes.

- Sidebar: Meus chats (padrão), Equipe e Todos, com contagem dos recentes carregados, autor e cliente. O título ocupa até duas linhas; o tooltip inclui a data de atualização. A busca considera nome, autor e cliente, inclusive chats de projetos já carregados.
- A sidebar carrega até 30 chats sem projeto do usuário e 30 de outras pessoas em consultas separadas. A atividade da equipe não remove os próprios chats desse orçamento. Chats dentro de projetos continuam organizados em Meus chats/Equipe.
- Clientes: busca e filtro de criador para o catálogo; nome e data do criador aparecem nos clientes e módulos. A autoria usa created_by existente, sem presumir que o autor do cliente também criou um módulo.
- Conteúdo: filtro por usuário atual, outras pessoas, pessoa específica ou autoria desconhecida; busca local nos itens carregados. Pastas e a árvore de módulos permanecem disponíveis para navegar até conteúdo de qualquer criador.
- Chats do módulo: consulta direta ao cliente/módulo, incluindo chats de projetos e antigos, em páginas de 50. O filtro de autor é aplicado antes da paginação. Carregar mais busca a próxima página; falhas permitem tentar novamente.
- IDs de criador sem perfil legível aparecem como Usuário mais um identificador abreviado. Registros sem ID de criador mostram Autoria não informada; não há backfill inventado.
- O carregamento ignora respostas atrasadas após troca de conta ou módulo. Metadados de perfis são consultados em lotes e não incluem e-mail.

Não há migração de banco nem mudança de RLS neste ajuste. Testes locais cobrem agrupamento, orçamento dos recentes, escopo do módulo/autor, paginação, erros e troca de conta. A revisão visual usa componentes reais com dados simulados e não comprova as políticas ou os dados da instância Supabase em produção.
