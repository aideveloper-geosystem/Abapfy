# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [1.0.0] - 2026-09-29

Primeira versão pública estável do Abapfy.

### Destaques

- Workspace desktop para equipes SAP organizado por cliente e módulo, com chats persistentes, drive compartilhado, projetos, tarefas, agentes e skills.
- Modelos OpenAI, Gemini e Claude autorizados por usuário; integrações MCP e contexto SAP GUI conforme a configuração do ambiente.
- Modal de configurações ampliado, com busca e seções organizadas. A nova aba Perfil reúne dados da conta, métricas de uso, atividade diária, conversas recentes e modelos utilizados.
- Aba Aparência com prévias dos temas SAP Horizon/Quartz e opções de alto contraste.
- Seletor de modelos refinado, com modelo ativo em destaque e controle de esforço para modelos Claude compatíveis. O nível Máximo exibe um efeito visual breve, respeitando a preferência de movimento reduzido.
- Marca mantida no cabeçalho da janela, com navegação lateral mais limpa.

### Configuração necessária

- O aplicativo não aplica migrações Supabase automaticamente. Administradores devem manter o projeto conectado atualizado conforme `supabase/README.md`, inclusive as migrações 032–034 para recursos introduzidos na versão anterior.

## [0.3.15] - 2026-09-29

### Adicionado

- Suporte aos modelos Claude Opus 5.5 e Sonnet 5.5 (migração `032`): thinking adaptativo sempre ativo, effort enviado explicitamente, novo nível de effort "Máximo" e fallback automático do servidor quando o modelo recusa por política de segurança.
- Animação "Pensando" durante o raciocínio do Claude, com contador e resumo recolhido em "Pensou por Xs", aberto somente ao clicar; o resumo fica salvo com a mensagem (migração `033`).
- Pesquisa web restrita à documentação SAP e leitura de links colados na conversa, com atividade no chat e fontes citadas ao fim da resposta.
- Painel de Inteligência Artificial redesenhado, com resumo e abas para provedores, comportamento, ferramentas e catálogo. Effort padrão, exibição do raciocínio e ferramentas cobradas à parte são configurados por usuário (migração `034`); as ferramentas pagas vêm desligadas por padrão.
- Verificação automática de atualizações ao abrir o app e a cada 4 horas, com aviso para baixar e reiniciar sem passar por Configurações → Atualizações.

### Alterado

- Cache de prompt automático nas chamadas ao Claude, reaproveitando agente, skills e histórico entre mensagens da mesma conversa e entre rodadas dos loops de ferramentas.
- A ação de controle do SAP GUI usa validação estrita de schema no Claude.

### Corrigido

- Modelos Claude legados (como Haiku 4.5) não recebem mais parâmetros de thinking e effort que eles não aceitam.
- Recusas do Claude aparecem como aviso legível no chat e no controle SAP, em vez de encerrar a resposta em silêncio.
- Os loops de ferramentas dos modelos 5.5 reservam espaço para o raciocínio antes da chamada da ferramenta.

## [0.3.14] - 2026-09-28

### Adicionado

- Gerenciador MCP por usuário com catálogo SAP/UI5/CAP/Fiori/SAP Developers/GitHub/Playwright, cadastro e importação de servidores HTTP ou stdio, vínculos por agente e inspeção de ferramentas, recursos e prompts.
- Parâmetros locais por conta em JSON; valores de ambiente e headers são protegidos pela criptografia do sistema operacional.
- Contexto visual SAP GUI em seção própria, com detecção de janela por processo, prévia, imagem efêmera no chat, skill nativa e atividade animada.
- Controle opcional da janela SAP GUI por clique, texto e teclas básicas, com autorização por ação ou permissão local persistente, nova captura após cada passo e limite de ações por mensagem.

### Corrigido

- Preset SAP Docs usa HTTPS; chamadas MCP com resultado incerto não são repetidas automaticamente.
- Servidores stdio exigem confirmação antes de qualquer operação e são encerrados ao sair da conta.
- O cadastro de presets MCP envia somente as colunas existentes em `mcp_servers`.
- A digitação no controle SAP usa a estrutura `INPUT` completa exigida pelo Windows; falhas nativas aparecem como mensagens legíveis no chat, sem XML do PowerShell.

## [0.3.13] - 2026-09-28

### Adicionado

- O Dtec entrega documentação técnica em PDF com seções organizadas, visualização paginada no
  aplicativo e opção de download.
- MASTER e ADMIN podem editar nome, descrição e instruções dos agentes disponíveis na própria
  conta e ativar ou desativar agentes padrão ou importados. A indisponibilidade é respeitada
  no roteador, na escolha de novas sessões e nos envios de conversas anteriores.

### Corrigido

- O contexto escolhido no drive informa quantos arquivos foram incluídos e avisa quando o limite
  omite parte do conteúdo; solicitações encerradas sem resposta exibem erro claro.
- O streaming aceita separadores SSE com CRLF e informa erros enviados pelo provedor.
- O campo de mensagem cresce com o texto e passa a rolar ao atingir a altura máxima.
- A leitura de PDFs usa a distribuição compatível do PDF.js com o Electron; o visualizador do
  Dtec abre em um modal amplo acima de toda a interface.

### Configuração necessária

- Aplicar `supabase/sql/031_agent_management.sql` após a migração 030 para persistir edição e
  ativação de agentes por MASTER/ADMIN. Publicar os instaladores não executa SQL no Supabase.

## [0.3.12] - 2026-09-25

### Adicionado

- Catálogo de modelos de IA no Supabase: master e administradores podem cadastrar, editar,
  desativar e bloquear modelos por usuário. A seleção no aplicativo respeita essas regras.
- Portal Notícias com leitura e curtidas para usuários comuns; master e administradores podem
  publicar e editar artigos em Markdown e criar ou refinar o texto com a IA configurada.

### Corrigido

- Upload colaborativo do drive com validação do caminho cliente/módulo em função restrita;
  mensagens de erro distinguem validação, Storage e registro do arquivo.
- Políticas do Storage usam o caminho correto do objeto nas verificações de upload e limpeza.

### Configuração necessária

- Aplicar as migrações `supabase/sql/026_ai_model_catalog.sql` até
  `supabase/sql/030_client_drive_upload_check.sql` em ordem. A publicação do aplicativo
  não executa SQL automaticamente. O upload foi confirmado após a migração 030.

## [0.3.11] - 2026-09-24

### Adicionado

- Master e administradores podem selecionar usuários na aba Inteligência Artificial para
  provisionar chaves de API, ativar integrações MCP e vincular agentes. Usuários comuns
  consultam as integrações disponíveis e escolhem o modelo padrão.
- Nova marca Abapfy alinhada ao Horizon nas telas do aplicativo e nos ícones dos pacotes
  Windows, macOS e Linux.

### Segurança

- A migração `supabase/sql/025_admin_ai_integrations.sql` restringe a gravação de chaves e
  integrações a MASTER/ADMIN no banco. Administradores consultam apenas o estado das chaves
  de outras contas, sem receber os segredos.

### Configuração necessária

- Aplicar a migração 025 no Supabase após as migrações 021–024 para ativar a nova hierarquia
  de acesso. A publicação do aplicativo não aplica migrações automaticamente.

## [0.3.10] - 2026-09-24

### Corrigido

- Reúne os instaladores Windows, Linux e macOS em uma única release pública, criada após as
  três builds concluírem. O pacote macOS é universal para Intel e Apple Silicon.
- Inclui as melhorias de login, persistência, saída, marca GeoSystem e recuperação de senha
  introduzidas na versão 0.3.8. O envio do código requer o SMTP e o template documentados em
  `supabase/email-templates/README.md`.

## [0.3.9] - 2026-09-24

### Corrigido

- Publica os quatro pacotes da versão em sequência para evitar releases duplicadas e artefatos
  divididos entre elas. Inclui as melhorias de autenticação, recuperação de senha e marca da
  versão 0.3.8.

## [0.3.8] - 2026-09-24

### Adicionado

- Recuperação de senha por código enviado ao e-mail, com verificação e definição da nova senha
  dentro do aplicativo.
- Template de recuperação GeoSystem - Abapfy com nome e empresa quando disponíveis nos
  metadados da conta.

### Corrigido

- Login com erro permanece na tela de entrada e exibe a mensagem; a tela principal exige
  sessão autenticada e o botão Sair retorna ao login.
- Header e tela de abertura exibem a marca GeoSystem em duas cores.

### Configuração necessária

- O envio do código depende da ativação do SMTP personalizado e da instalação do template
  `supabase/email-templates/recovery.html` no projeto Supabase.

## [0.3.6] - 2026-08-31

### Corrigido

- Injeta a configuração pública do Supabase no renderer durante as builds de release,
  evitando que o aplicativo instalado abra em uma janela branca.
- Interrompe a compilação quando a URL ou a chave anônima do Supabase não estiverem
  configuradas, impedindo a publicação de instaladores inválidos.

## [0.3.5] - 2026-08-31

### Corrigido

- Substitui os usos de `__dirname` no processo principal por caminhos derivados de
  `import.meta.url`, permitindo iniciar corretamente o bundle ES module instalado.

## [0.3.4] - 2026-08-31

### Corrigido

- Atualiza o gerador NSIS para eliminar a violação de acesso em `System.dll` que encerrava
  instalações por usuário logo após a escolha de "somente para mim" no Windows.
- Restringe o pacote desktop aos artefatos compilados e recursos necessários, evitando a
  inclusão de caches, arquivos de ambiente, fontes auxiliares e dependências já incorporadas
  ao bundle do processo principal.

## [0.3.3] - 2026-08-28

### Corrigido

- Incorpora todas as dependências JavaScript do processo principal ao bundle, eliminando
  falhas sequenciais de módulos transitivos ausentes em instalações geradas com pnpm,
  incluindo `cross-spawn` e `fs-extra`.

## [0.3.2] - 2026-08-28

### Corrigido

- Impede que o instalador atualize apenas o registro do Windows enquanto processos de uma
  versão anterior ainda mantêm `abapfy.exe` e `app.asar` bloqueados.
- Adota o instalador assistido da versão legacy, permitindo confirmar o diretório e exibindo
  uma orientação clara para fechar o Abapfy antes de substituir os arquivos.

## [0.3.1] - 2026-08-28

### Corrigido

- Incorpora o runtime do cliente MCP ao processo principal para impedir a falha
  `ERR_MODULE_NOT_FOUND` de `cross-spawn` ao abrir o aplicativo instalado.
- O Agente de Especificação Funcional volta a gerar o Word a partir do modelo base,
  inclusive quando a resposta do provedor vier em Markdown em vez do JSON esperado.
- Preenche o campo de consultor e preserva o espaçamento do texto justificado no documento EF.

## [0.3.0] - 2026-08-22

### Adicionado

- Base de conhecimento por projeto com documentos versionados, recuperação semântica via
  `pgvector`, fallback textual, RLS e fontes com confiança no contexto do agente.
- Seletor de ambiente SAP no composer, persistido por chat e enviado ao roteador e ao agente.
- Kanban avançado com colunas configuráveis, calendário, labels, módulo, responsável,
  projeto/chat, dependências, esforço, lembretes, recorrência e criação assistida por IA.

### Alterado

- Interface adota SAP Morning Horizon claro como padrão e oferece Evening Horizon, Quartz e
  variantes de alto contraste nas configurações.

## [0.2.1] - 2026-08-22

### Corrigido

- Inclui `cross-spawn` como dependência direta do aplicativo para impedir a falha `ERR_MODULE_NOT_FOUND` ao iniciar o processo principal após a instalação.
- Publica releases geradas por tag diretamente como release final do GitHub, em vez de deixá-las como rascunho invisível ao atualizador.

## [0.2.0] - 2026-08-22

### Adicionado

- Quadro pessoal de tarefas Kanban com prioridades, prazos, ordenação por arrastar e soltar e checklist de subtarefas.
- Painel de contexto da sessão com arquivos anexados, agente ativo, skills carregadas e servidores MCP vinculados.
- Seletor de agente no composer, mantendo o modo Automático e permitindo fixar um agente antes da primeira mensagem.
- Gerenciamento persistido de servidores MCP e vínculos N:N com agentes, com confirmação para operações sensíveis.
- Estrutura administrativa Supabase e componentes do dashboard externo.

### Alterado

- Estimador de Esforço ABAP agora recarrega parâmetros por solicitação, apresenta os objetos identificados em tabela e recalcula os três cenários ao editar a complexidade.
- Premissas e riscos das estimativas passaram a ser recolhíveis para manter os cards compactos e alinhados.
- Seleção manual de agente usa um classificador separado apenas para skills, sem permitir substituição do agente escolhido.

### Corrigido

- Compatibilidade de respostas MCP que retornam conteúdo estruturado divergente do schema declarado.
- Empacotamento e atualização automática para builds macOS e Windows.

## [0.1.0] - 2026-07-27

### Adicionado

- Primeira versão pública do Abapfy: cliente desktop de chat com ferramentas para o ecossistema SAP/ABAP.
- Configurações com temas, seleção de provedor/modelo de IA e chaves de API.
- Nova aba de Atualizações nas Configurações, com verificação e instalação de novas versões diretamente pelo app.
