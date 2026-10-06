# Interface IA — adaptação para 1.0.1

Referência examinada: [Beautiful UI](https://www.beautifului.dev/), catálogo de 21 componentes, em 06/10/2026. Implementação própria em React, com os tokens do DESIGN.md e sem dependências adicionais. A referência está disponível sob [licença MIT](https://www.beautifului.dev/license).

## Cobertura do catálogo

| Referência | Aplicação no Abapfy |
| --- | --- |
| Loading State | Indicador em grade com tempo decorrido durante roteamento e espera pela primeira resposta. |
| Thinking | Resumo recolhível, duração e região acessível; usa somente o resumo fornecido pelo provedor. |
| Streaming Text | Streaming existente com cópia, fontes recolhíveis e sugestões contextuais opcionais. |
| Approval Card | Opções de esclarecimento selecionáveis com confirmação explícita; solicitação MCP com detalhes e aprovação existentes. |
| Tool Chips | Atividade agrupada e recolhível, com estados reais de execução e autorização. |
| Task Rows | Etapas SAP existentes, resumo de atividade e tarefas em lista com progresso de subtarefas. |
| Chat | Integração no chat existente, preservando conversas e execução em segundo plano. |
| Prompt Bar | Sugestões SAP, comandos `/`, pastas de contexto com `@`, seleção de modelo e dicas de teclado. Voz permanece indisponível. |
| Recommendation Card | Proposta com evidência, alternativas e confiança opcional declarada pelo agente. |
| Context Cards | Recursos da sessão em cards e trechos efetivamente recuperados da base do projeto com documento, versão, atualização e relevância. |
| Diff Table | Comparação de campos antes/depois com justificativa, apresentada como proposta. |
| Records Table | Tabela de resposta com busca, ordenação numérica/textual e seleção local de linhas. |
| Filter Table | Filtros de tarefas por status com contagem, busca e lista, aplicados também ao quadro e calendário. |
| Sidebar Nav | Recolhimento com navegação por ícones, rótulos acessíveis e menus existentes. |
| Search | Busca local de chats recentes e projetos carregados; comandos e tabelas com estado vazio. |
| Flowchart | Etapas de entrada, ação e condição, com ramificações descritivas em canvas pontilhado; sem motor de execução. |
| Insight Cards | Indicadores com origem e limitações; valores desconhecidos aparecem como “A confirmar”. |
| Code Block | Numeração, cópia com tratamento de falhas, cores dos temas e comparação unificada na revisão. |
| Fine-tune Card | Resumo dos ajustes de profundidade e visibilidade do raciocínio, ligado às preferências reais da IA. |
| Selection Actions | Explicar, melhorar ou resumir um trecho da resposta selecionado pelo usuário. |
| Agent Screen | Prévia recolhível da captura SAP já consultada, mantida apenas em memória e identificada como captura da interação. |

## Integração de respostas

O renderer reconhece apenas blocos explicitamente cercados com linguagem `ai-ui`. O contrato opcional é anexado ao prompt de execução; contratos especializados de EF, DTec, estimativa, revisão, customizing e esclarecimento continuam prioritários. A versão do payload é 1.

`aiPresentation.ts` valida com Zod cinco tipos: `recommendation`, `records`, `diff`, `insights` e `flow`. Payloads inválidos permanecem legíveis como código. Há limites de tamanho, quantidade de blocos, registros, colunas e etapas. Não há HTML bruto ou código executável nos cards.

As propostas e sugestões preparam texto no compositor, preservando um rascunho existente. O usuário revisa e envia. Isso não autoriza MCP ou SAP e não aplica dados diretamente. A seleção de tabela é local e não altera registros. Comandos apenas preparam pedidos; `@` oferece pastas reais do módulo selecionado, usando o carregamento e os limites de contexto já existentes.

As capturas SAP são efêmeras, não entram nas mensagens persistidas e não são capturadas novamente ao expandir a prévia. A prévia não é uma transmissão ao vivo nem prova de sucesso. Trechos de conhecimento ficam disponíveis na mensagem em execução; a persistência existente não foi ampliada nesta adaptação.

Os indicadores e a confiança são informações fornecidas pelo modelo, não métricas verificadas pelo renderer. O contrato exige evidências e proíbe inventar dados. O sistema não acrescenta confiança quando ela não foi fornecida.

## Validação

Testes automatizados: `node --test --test-isolation=none tests/ai-presentation.test.mjs`. Cobrem os cinco tipos, valores desconhecidos, conteúdo inválido, limites, inconsistência de colunas e comparação de código.

Verificação visual local realizada com os componentes reais e fixtures identificadas como dados de QA: temas Horizon claro e escuro, busca e recolhimento da sidebar, lista e filtro de tarefas, busca/ordenação/seleção da tabela de resposta, confirmação de opções, comparação de código e ação sobre trecho selecionado. Os 15 testes de apresentação e regressão de agentes/customizing passaram. Typecheck completo, lint dos arquivos alterados e build Electron/renderer passaram.

Essa verificação não substitui uma sessão autenticada, emissão real de respostas pelo provedor ou controle SAP em execução. Nenhuma publicação de release faz parte desta alteração.
