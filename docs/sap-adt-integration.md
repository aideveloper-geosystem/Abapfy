# Integração SAP ADT no Abapfy

Implementação na branch `codex/sap-adt-integration`, utilizando `abap-adt-api` no processo principal do Electron. Não depende de VS Code aberto. Os agentes OpenAI, Claude e Gemini recebem ferramentas conforme as permissões da conexão e o agente selecionado.

## Configuração

1. Abra **Configurações > Integrações > SAP · ADT**.
2. Com sua conta autenticada, cadastre URL do servidor, usuário SAP, mandante, idioma e ambiente. ADT deve estar disponível em `/sap/bc/adt` pela rede/VPN.
3. Prefira HTTPS, informando a CA interna em PEM quando necessário. HTTP exige habilitação explícita e transmite credenciais e dados sem criptografia. Certificados TLS continuam sendo validados.
4. Informe a senha SAP, protegida pelo `safeStorage` do sistema operacional. Trocar servidor, usuário ou mandante exige informar novamente a senha.
5. Selecione os agentes e habilite a conexão. Habilite somente os grupos de ferramentas desejados.
6. Salve e use **Testar conexão salva**. O teste confirma autenticação e descoberta ADT, não a autorização de todas as ferramentas.
7. No chat, use **Ambiente SAP** para selecionar uma conexão pelo nome, ambiente e mandante. O agente recebe somente as ferramentas dessa conexão. **Sem conexão SAP** desativa o acesso. A seleção permanece entre mensagens da conversa; ao trocar ou iniciar uma conversa, selecione novamente. O botão ao lado abre o gerenciamento das conexões.

Os metadados e permissões são locais por conta e computador. A configuração de conexões não é sincronizada no Supabase. Qualquer usuário autenticado pode criar, editar, testar e remover suas próprias conexões e configurar seus vínculos com agentes. Não há acesso às conexões de outra conta, mesmo informando diretamente seu identificador. Essas permissões são verificadas no processo principal usando a sessão autenticada do Abapfy.

## Permissões

| Permissão | Ferramentas |
| --- | --- |
| Conexão habilitada + agente vinculado | Pesquisa de objetos |
| Leitura de fonte | Fontes ativas e inativas, paginação e busca literal |
| Consulta de tabelas | SELECT com colunas explícitas, filtros de igualdade e até 200 registros |
| Qualidade | Estrutura, where-used, sintaxe, ABAP Unit e ATC |
| Escrita | Alteração de trecho exato de fonte sob lock |
| Criação | Esqueletos de classes, interfaces, programas, includes, CDS, DCL e extensões CDS |
| Ativação | Ativação explícita da fonte inativa revisada |
| Requests | Listagem, detalhes, informações de transporte de objeto, criação, responsável e usuários/tarefas |
| Liberação | Liberação de requests/tarefas, sem ignorar locks ou ATC; exige Requests |
| Debug | Sessão interativa do próprio usuário, breakpoints, espera, stack, variáveis, passos e encerramento |

As permissões avançadas começam desligadas, inclusive nas conexões antigas. Escrita e ativação exigem também leitura de fonte. Uma lista de tabelas vazia permite qualquer tabela solicitada e autorizada pelo SAP; uma lista preenchida restringe a nomes exatos.

## Leitura de fontes

`read_source` usa `version: active | inactive`, por padrão `active`. Cada página tem até 12.000 caracteres e limite adicional de tamanho JSON. `nextOffset` permite continuar; `search` localiza texto literal, como `METHOD nome_do_metodo`. O resultado contém `sourceHash`, offsets e linhas. Até quatro fontes ficam em snapshots efêmeros por mensagem. O ciclo tem até 16 rodadas de ferramentas; fontes muito grandes exigem leitura direcionada ou outra mensagem. Não se deve afirmar leitura completa se apenas parte foi consultada.

## Edição e ativação

1. Pesquisar o objeto e ler a versão apropriada na mesma mensagem.
2. Consultar `object_transport` para verificar pacote, requests e locks.
3. Chamar `edit_source` com `expectedHash` retornado pela leitura, trecho original exato, trecho novo e request existente. A alternativa `$TMP` só é aceita quando o próprio SAP confirma objeto local.
4. A aprovação mostra servidor, mandante, ambiente, hash, trechos anterior/proposto e request. O lock só é obtido depois da aprovação.
5. Sob lock, a fonte é relida para impedir sobrescrita concorrente. Uma fonte inativa diferente da ativa é preservada: o agente precisa lê-la e editá-la explicitamente.
6. A gravação é feita como fonte inativa e seu conteúdo é conferido por nova leitura. Não há ativação automática.
7. Para ativar, ler a fonte inativa, executar sintaxe quando desejado e chamar `activate_object` com o hash dessa versão. Há nova aprovação, lock e verificação da versão ativa.

Falhas após envio de gravação/ativação retornam estado incerto, sem repetir automaticamente. A liberação do lock é tentada no `finally`; falhas de limpeza são informadas. Sessões de escrita usam modo stateful para impedir o retry de gravações por renovação automática de login da biblioteca.

Objetos novos devem usar nome Z/Y ou namespace de cliente. Pacote e request são explícitos e revisados. A criação gera o esqueleto, não ativa e não executa o objeto.

## Requests e qualidade

- Requests e tarefas são obtidas do SAP. Não inventar números, pacotes ou descrições.
- Criação, mudança de responsável, adição de usuários e liberação exigem aprovação específica. Liberação não comprova importação em outro sistema; consulte o retorno e o estado atual.
- Não há exclusão de requests nem liberação ignorando ATC/locks.
- Sintaxe pode consultar fonte ativa ou inativa, sem gravar.
- ABAP Unit executa apenas testes classificados como `harmless`, curtos ou médios. A classificação não garante ausência de efeitos no código do cliente; a execução requer aprovação.
- ATC usa variante existente, limita achados e retorna um `runId`; `atc_results` lê os achados do run retornado naquela mensagem. O resultado não é presumido como aprovado.

## Debug interativo

O tool `debug` usa as ações:

1. `start`: abre sessão persistente própria, com validade de 10 minutos.
2. `breakpoints`: objeto pesquisado e até 20 linhas. O Abapfy mantém identificadores exclusivos da sua sessão.
3. Execute o programa ou transação pelo SAP GUI/Fiori; o conector não dispara transações automaticamente.
4. `wait`: espera até 25 segundos por uma parada do próprio usuário e mandante. Se houver parada, anexa ao programa. Conflitos são informados.
5. `stack` e `variables`: inspecionam o estado atual e podem enviar dados ao provedor de IA.
6. `step`: `stepInto`, `stepOver`, `stepReturn` ou `stepContinue`.
7. `stop`: tenta desanexar, remover seus breakpoints/listener e fazer logoff. Também existe **Encerrar debug desta conexão** nas configurações.

Todas as ações de debug requerem aprovação. A sessão persiste entre mensagens, mas é encerrada em logout, alteração/remoção da conexão, troca de credenciais, recarga/fechamento da janela ou expiração. Ao desanexar, o programa pode continuar executando: a aprovação informa esse comportamento. O Abapfy não altera variáveis, não termina o programa à força e não depura outro usuário. Se a limpeza falhar, o usuário deve conferir o estado no SAP; após a revisão manual, `acknowledge_cleanup` permite reconhecer as pendências com aprovação explícita.

## Segurança, diagnóstico e limites

- O controle visual/computer use foi removido: não há captura automática de janelas, mouse, teclado, configuração visual ou canais IPC SAP GUI. O acesso SAP usa ADT.
- Cada autorização de mensagem exige o ID da conexão selecionada e valida sua propriedade, estado e vínculo com o agente no processo principal. Não há seleção automática nem fallback para outras conexões. O chat lista as ferramentas e os motivos de indisponibilidade.
- Credenciais e grants internos não são incluídos nos schemas enviados ao modelo. Conteúdo SAP é tratado como dados, não como instruções ou autorização.
- Autorizações das ferramentas são validadas novamente no processo principal, inclusive após aprovação e mudança de configuração. As operações avançadas de uma conexão são serializadas.
- Metadados: `<userData>/sap-adt/<user-id>.json`; senha cifrada, sem fallback em texto puro.
- Auditoria local: `<userData>/sap-adt/<user-id>.audit.jsonl`, com data, conexão, ferramenta e estado. Não contém fontes, tabelas, filtros, senha ou token. Reinicia após 1 MB e não é uma trilha inviolável.
- Transporte restrito à origem configurada, sem redirecionamentos, com validação TLS, limite de resposta de 5 MB e métodos/endpoints separados por escopo e permissão. Não há endpoint HTTP genérico para o modelo.
- Autorizações reais do usuário SAP continuam obrigatórias. A classificação DEV/QA/PRD é informada pelo administrador, não detectada pelo sistema.
- Ainda não há fluxo SSO/SAML/OAuth, destinos BTP, proxy explícito ou certificados de cliente.
- Não há SQL de escrita, manutenção genérica de dados de negócio, execução arbitrária de ABAP, exclusão de objetos, debugger gráfico completo ou controle de importação de transportes.

## Validação

`node --test tests/*.test.mjs`, `pnpm typecheck` e `pnpm build` validam código, políticas e fluxos simulados. Os testes incluem transporte HTTP real contra servidor simulado, bloqueio de endpoints, aprovação, conflitos de fonte, locks, incerteza após gravação, ativação, requests e persistência/limpeza de sessão de debug.

O usuário validou autenticação, pesquisa, leitura e consulta de tabelas em seu SAP. As novas operações de escrita, requests, qualidade e debug precisam de validação operacional em um sistema de desenvolvimento. Testes locais e build não comprovam execução dessas operações no SAP nem homologação visual autenticada.

Avisos de licença da biblioteca e dependências estão em `resources/sap-adt-licenses/`, incluídos no pacote do aplicativo. Referências: https://github.com/marcellourbani/abap-adt-api e https://github.com/marcellourbani/vscode_abap_remote_fs.
