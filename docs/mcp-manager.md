# Gerenciador MCP do Abapfy

## Organização

Em **Configurações → MCP**, MASTER/ADMIN selecionam um usuário, cadastram servidores Streamable HTTP ou `stdio`, ativam/desativam integrações e vinculam cada servidor aos agentes autorizados. Usuários comuns consultam as integrações recebidas e preenchem apenas os parâmetros da própria conexão local.

O administrador também pode importar uma configuração comum de clientes MCP com `mcpServers` ou `servers`, por exemplo `{"mcpServers":{"meu-servidor":{"command":"npx","args":["-y","meu-pacote"]}}}`. URL, comando e argumentos passam a fazer parte do cadastro administrado. Ao importar para a própria conta, `cwd`, `env` e `headers` vão ao JSON local. A importação de vários servidores é sequencial; se houver erro durante a gravação, os anteriores podem já ter sido criados e devem ser conferidos na lista.
Não inclua segredos na URL ou nos argumentos, pois esses campos são persistidos no Supabase e aparecem no retrato local. Use variáveis de ambiente ou headers locais para credenciais.
Referências comuns como `${input:github_mcp_pat}` e `${env:GITHUB_MCP_PAT}` são convertidas na importação para `${GITHUB_MCP_PAT}`; configure a variável no sistema antes de abrir o Abapfy. O transporte SSE legado não é aceito pelo importador.

O catálogo inclui SAP Docs, SAP ABAP, UI5, SAP CAP, SAP Fiori, SAP Developers, GitHub e Playwright. O MCP do ADT para VS Code não faz parte do catálogo. Cada cartão do catálogo aponta para a documentação do mantenedor. Os presets `stdio` exigem que o runtime correspondente esteja disponível no computador; `npx` pode baixar pacotes na primeira execução. Para ambientes controlados, o administrador pode trocar a versão do pacote nos argumentos administrados.

Servidores UI5, CAP e Fiori só entram nas conversas depois que o usuário escolhe e salva a pasta local do projeto. Isso evita que trabalhem por engano sobre a pasta de instalação do Abapfy. O preset GitHub usa o endpoint remoto com header `Authorization: Bearer ${GITHUB_MCP_TOKEN}`; configure essa variável no ambiente do sistema antes de abrir o aplicativo. A configuração local de cada usuário pode incluir variáveis de ambiente e headers em formato JSON.

## Persistência e permissões

O **catálogo e os vínculos** permanecem nas tabelas `mcp_servers` e `mcp_agent_bindings` do Supabase. As políticas da migração `025_admin_ai_integrations.sql` precisam estar aplicadas para que apenas MASTER/ADMIN possam alterar essas tabelas. O app não aplica migrações automaticamente.

Os **parâmetros da conexão** são salvos em um JSON por conta em `<userData>/mcp/<id-da-conta>.json`, no diretório de dados do Electron do sistema operacional. O arquivo contém versão, pasta local, perfil SAP, variáveis/headers e nomes de ferramentas desativadas. Também contém um retrato legível dos servidores e vínculos recebidos do Supabase na última carga. Esse retrato serve para inspeção e backup; a execução continua dependendo do catálogo e das permissões atuais do Supabase. URL, executável e argumentos gerais são definidos no cadastro administrado, para que um usuário comum não substitua a integração atribuída por outra.

Valores de ambiente e headers inseridos diretamente são criptografados antes da gravação usando `safeStorage` do Electron. Valores que referenciam variáveis do sistema, como `${TOKEN}`, ficam no JSON como referência, sem o valor da variável. Em Linux, se o backend disponível for `basic_text`, o aplicativo recusa gravar valores diretos que exigiriam proteção. O JSON continua sendo um arquivo local da conta do sistema operacional; a separação por conta Abapfy organiza as configurações dentro desse perfil de sistema.

## Execução e diagnóstico

O processo principal do Electron cria as conexões MCP. Antes de iniciar um servidor `stdio`, o aplicativo pede autorização para o executável, argumentos e pasta; a autorização vale até o aplicativo fechar. Chamadas classificadas como capazes de alterar dados também pedem confirmação. A classificação usa nome e anotações da ferramenta como sinais, não como garantia de segurança. O administrador deve conceder aos servidores e perfis SAP apenas os direitos necessários.

O botão **Testar e listar ferramentas** verifica a conexão e mostra ferramentas, recursos e prompts do servidor. Isso não comprova autenticação em um sistema SAP. Para testar uma operação real, use **Consultar** numa ferramenta de leitura, com os argumentos JSON exigidos por ela. Recursos podem ser lidos e prompts podem ser carregados no diagnóstico. É possível desativar ferramentas individualmente para aquela conta neste computador.

O runtime não repete automaticamente chamadas que falharam: uma operação pode ter sido concluída no servidor antes de a conexão falhar. Servidores HTTP remotos precisam usar HTTPS; HTTP permanece permitido apenas para localhost.
