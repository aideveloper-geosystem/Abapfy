# Migração completa do Supabase para a empresa

Status em 2026-10-06: banco e Storage copiados de `jdopopitychhcouhsyoj` para `xkgrddkgopoqggcbfsnm`. Destino inspecionado vazio antes da restauração; origem preservada. Google e URLs configurados pelo usuário; habilitação do Google confirmada por API. Usuário confirmou ausência de Edge Functions e hooks de Auth na origem. SMTP e template de recuperação adiados por escolha explícita do usuário. Cópia concluída; testes de uso pendentes da troca de variáveis na etapa 2.

## Resultado da cópia e validação

- PostgreSQL 17.6 na origem e 17.11 no destino; clientes locais PostgreSQL 18.6. Conexões feitas via Session pooler.
- 34 tabelas públicas, 3 usuários e 4 identidades de Auth copiados. Contagens e checksums completos de 60 tabelas de public/Auth coincidem. Histórico de migrações interno de Auth permaneceu próprio do destino.
- 11 arquivos do bucket privado `client-files` copiados e verificados individualmente por SHA-256. Caminhos, IDs, proprietários e timestamps dos objetos preservados; bucket mantém limite de 20 MiB e acesso privado.
- Funções do aplicativo, grants, RLS, gatilhos, constraints e sequências comparados sem diferenças. Três policies em schemas gerenciados e dois gatilhos em auth.users recriados. Não havia tabelas em publicações Realtime.
- Extensão vector habilitada. Vault estava vazio; não foi necessária transferência de chave de criptografia.
- Restauração de public/Auth foi transacional. Função padrão public.rls_auto_enable e defaults do papel gerenciado supabase_admin foram preservados no destino. Grants extras de funções criados pelos defaults do destino foram removidos; permissões efetivas das funções coincidem com a origem.
- Backups, bytes dos arquivos, manifestos SHA-256 e relatórios ficaram em `.supabase-migration/`, ignorado pelo Git. Nenhum segredo foi adicionado a arquivos versionados.
- Etapa 2: variáveis locais atualizadas em `.env`, `Admin/.env.local` e `external/.env.local`. Chave pública publishable fornecida pelo usuário validada com o SDK instalado; chave administrativa ficou nos servidores dos painéis. Configurações anteriores preservadas em backup local ignorado pelo Git. Leitura pública de profiles sem login retornou zero registros; leitura administrativa funcionou. Validador de ambiente e build local Electron/Vite passaram. Login real e acesso de usuários ainda precisam ser testados no aplicativo reiniciado.
- Etapa 3: secrets de CI do Supabase configurados em `aideveloper-geosystem/Abapfy`, versão 1.0.1 e canal de atualização preparados para a empresa. Procedimento de importação do histórico e nova release em `docs/github-company-migration.md`. A build local não muda o instalador já distribuído.

## Pendências de configuração pelo painel

1. Google: usuário confirmou configuração pelo painel; consulta de Auth confirmou provider habilitado em ambos. Callback de destino informado: `https://xkgrddkgopoqggcbfsnm.supabase.co/auth/v1/callback`. Login real ainda será testado depois da troca das variáveis.
2. Confirmação de e-mail: consulta de Auth confirmou mailer_autoconfirm=true em ambos; configuração agora coincide com a origem.
3. Site URL/redirect URLs: usuário confirmou configuração no painel; valores não foram inspecionados por API de gerenciamento. SMTP/remetente, templates, validade de OTP e limites de envio: configuração adiada pelo usuário. Entrega e recuperação por e-mail ainda não validadas.
4. Usuário conferiu no Dashboard e confirmou ausência de Edge Functions e hooks de Auth na origem. Nenhuma função ou hook adicional a migrar.
5. Após configurar Auth e conectar o aplicativo ao destino na etapa 2, testar login por senha e Google, acesso de MASTER/ADMIN/usuário comum, abertura de arquivos e recuperação de senha. Esses testes de uso ainda não foram executados.

O usuário confirmou pausa de uso/uploads na origem durante a cópia final. Evitar novas gravações na origem antes do corte para o destino; se houver novas gravações, será necessário reconciliar os dados antes de disponibilizar a nova instância.

## Etapa 1A — criar o destino

1. No Dashboard do Supabase, selecionar a organização da empresa e criar um projeto vazio.
2. Escolher a região de acordo com a política da empresa, preferencialmente igual à origem para evitar uma mudança simultânea de região. Verificar capacidade e plano para o volume real do inventário; não contratar add-ons apenas para iniciar a preparação.
3. Guardar a senha de banco no gerenciador de senhas. Não colocá-la no chat, no `.env` do renderer ou no Git.
4. Aguardar o projeto ficar disponível e obter a referência pública (Project Ref).
5. Ainda não aplicar os scripts SQL do repositório, criar tabelas, importar agentes ou apontar o aplicativo para o destino. A restauração deve partir de um destino vazio, preservando a estrutura e os dados reais da origem.

## Etapa 1B — inventariar origem e definir acesso

Executar `scripts/supabase-migration-inventory.sql` no SQL Editor da origem. Ele é somente leitura e não retorna dados pessoais ou segredos. Executar também as consultas de contagem geradas para ter contagens exatas por tabela.

Inventário local do repositório: scripts SQL 001–034, RLS em arquivos separados, extensão `vector`, triggers próprios em `auth.users` e policies próprias em `storage.objects`. Isso descreve o código versionado; ainda é necessário verificar o estado real do banco.

O renderer usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. A migração administrativa precisa de acesso próprio ao banco; a chave pública do aplicativo não permite fazer um dump completo. A cópia do Storage precisa de acesso administrativo específico às duas instâncias. Configurações e credenciais serão fornecidas localmente, sem incluí-las em comandos expostos ou arquivos versionados.

Os utilitários nativos PostgreSQL 18.6 estão disponíveis nesta máquina. Supabase CLI e Docker não foram encontrados no PATH. A escolha do método será feita depois de conferir versões dos bancos e os objetos existentes.

## Etapa 1C — copiar e restaurar

- Preservar schema, dados, funções, índices, sequências, permissões, políticas RLS e IDs de registros.
- Migrar dados de Auth, incluindo contas, identities e hashes de senha, antes de disponibilizar o app. IDs de `auth.users` não podem mudar: perfis, chats, tarefas e permissões dependem deles.
- Revisar papéis e objetos administrados pelo Supabase. Não substituir indiscriminadamente o DDL de `auth` e `storage`; customizações próprias nesses schemas exigem tratamento separado.
- Conferir extensões e versão do PostgreSQL. Se houver Vault ou colunas criptografadas, tratar a chave de criptografia antes da restauração; o dump lógico sozinho não resolve esse caso.
- Copiar todos os arquivos de Storage com caminhos preservados, inclusive arquivos na lixeira que ainda tenham conteúdo armazenado. O bucket privado `client-files` guarda PDFs, DOCX e modelos usados pelo Abapfy. Metadados SQL não são os bytes dos arquivos.
- Definir uma janela final sem novas escritas/uploads na origem para manter banco e arquivos consistentes. Uma cópia inicial pode acontecer antes, mas não é o corte final.
- Preservar a origem durante a validação. Backups e relatórios administrativos ficam em `.supabase-migration/`, ignorado pelo Git; a configuração secreta local pode ficar em `.env.supabase-migration.local`, também ignorado. Não transferir esses arquivos para o novo GitHub.

## Etapa 1D — reconfigurar e validar

Reconfigurar SMTP, template de recuperação de senha de `supabase/email-templates/`, URLs de Auth, provedores de login utilizados, Realtime, restrições de rede, funções e secrets externos existentes. Não presumir que essas configurações são copiadas pelo dump.

Manter as chaves de assinatura próprias do destino e validar novo login; não transportar sessões ativas só para evitar reautenticação. As senhas dos usuários podem ser preservadas pela migração dos dados de Auth.

Comparar contagens exatas e estrutura. Conferir relações com usuários, permissões MASTER/ADMIN e usuário comum, isolamento de acesso, chats, tarefas, agentes, base de conhecimento e arquivos. Verificar caminhos, tamanhos e integridade dos arquivos e abrir amostras PDF/DOCX. Conferir recuperação de senha por SMTP. A etapa 1 só termina após a validação no projeto de destino.

Depois disso: etapa 2 altera as variáveis do aplicativo; etapa 3 trata GitHub, secrets de CI e build/release. Essas etapas ainda não foram iniciadas.

## Referências oficiais

- [Backup e restauração pela CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Migração de usuários Auth](https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects)
- [Transferência entre organizações](https://supabase.com/docs/guides/platform/project-transfer) — alternativa se a intenção mudar de copiar para transferir o mesmo projeto.
