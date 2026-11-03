# Subagentes e hooks — fluxo avançado opcional

## Configurar e usar

1. Em Configurações > Avançado > Preferências de fluxos, disponibilize o recurso no chat.
2. Na sidebar, abra **Fluxos** e crie um fluxo. A biblioteca permite pesquisar, duplicar e excluir fluxos, separados por conta e computador.
3. Na aba Orquestrador, escolha o modelo, as instruções e o acesso às ferramentas. Na aba Equipe, adicione e configure os especialistas.
4. Na aba Etapas, monte a sequência de trabalho e escolha os especialistas de cada etapa. Hooks e Limites têm abas próprias. Marque o fluxo como disponível e salve.
5. No chat, selecione o fluxo pelo nome. Escolher **Fluxo padrão** retorna à execução comum.

A configuração começa desativada, sem agentes ou hooks predefinidos. Habilitar nas configurações disponibiliza o seletor no chat; não executa um fluxo por conta própria. A configuração única da versão anterior é carregada como um fluxo da biblioteca, preservando equipe, modelos, hooks e limites. O registro original permanece intacto. Preferências são locais por conta e computador, sem nova migração Supabase. As chaves existentes e os bloqueios de modelo são respeitados; não são copiados para a configuração do fluxo.

O botão de exemplo preenche um rascunho Opus + Sonnet / Haiku usando os modelos encontrados no catálogo permitido. Não habilita nem salva o fluxo. Modelos ausentes precisam ser selecionados manualmente.

## Execução

Sem etapas ativas, o orquestrador escolhe quando delegar e informa subtarefas aos especialistas. Com etapas ativas, o aplicativo executa a sequência configurada: especialistas da mesma etapa trabalham em paralelo até o limite; a próxima etapa só começa quando a anterior termina. O orquestrador consolida ao final, sem novas delegações livres. Pedido original e resultados integrais das etapas anteriores ficam acessíveis por páginas na ferramenta interna flow_context. Subagentes não podem criar outros subagentes.

Cada especialista recebe as instruções e o contexto de cliente/skills da execução, mas somente a subtarefa delegada como conversa, sem copiar o histórico inteiro. O orquestrador deve incluir na subtarefa as evidências anteriores necessárias. O retorno contém conclusão, evidências de ferramentas, estado, erros e consumo em tokens. Falhas de um especialista não apagam os resultados dos outros. Não há troca silenciosa para o fluxo comum quando o fluxo avançado falha.

Os limites controlam simultaneidade, total de delegações, rodadas por participante, tokens máximos de saída por chamada e tempo máximo da execução (até 10 minutos, compatível com o grant ADT). Não representam um teto monetário. O botão de parar cancela o orquestrador, a fila e os especialistas em andamento. As atividades do chat mostram cada participante e seu consumo agregado de entrada/saída, sem estimar desconto monetário de cache.

O chat mostra um cartão compacto com estado, contadores e a operação atual. O histórico técnico e o progresso ficam recolhidos para consulta sob demanda. Os checkpoints de conclusão não despejam a resposta completa do especialista nas atividades. Textos extensos de atividades antigas são expandidos individualmente.

## Ferramentas e ADT

- Sem ferramentas: o participante trabalha somente com o contexto recebido.
- Somente leitura: arquivos do workspace e operações de leitura/validação ADT conhecidas. MCPs externos ficam fora desse modo, pois seus nomes não comprovam que sejam somente leitura.
- Ferramentas da sessão: utiliza o catálogo autorizado do agente principal da conversa, incluindo operações de alteração habilitadas. Não concede permissões novas à conexão.

O orquestrador também pode ficar restrito a coordenar ou consultar. A conexão ADT é a selecionada no chat e continua vinculada ao agente principal. Os participantes compartilham o grant e os snapshots de fontes da mesma execução; somente o orquestrador encerra o grant. Alterações invalidam os snapshots correspondentes e as operações avançadas continuam serializadas pelo processo principal. Leituras não pedem confirmação e alterações usam a autorização da sessão de conversa.

## Hooks disponíveis

A seção **Hooks prontos para usar** oferece oito modelos: planejamento, delegação com escopo/evidências, registro de conclusão, conferência dos especialistas, exigência de leitura real, revisão final, validação de sintaxe ADT e registro de edição. Cada cartão informa o evento, explica o efeito e permite consultar as instruções antes de adicionar. Clique em **Usar este hook**, ajuste os campos se necessário e salve. O catálogo não adiciona hooks automaticamente nem altera os já personalizados; um modelo já adicionado não é duplicado. Removê-lo permite adicionar novamente o original.

| Evento | Ações |
| --- | --- |
| Ao iniciar o fluxo | Instruções para o orquestrador; registro de progresso |
| Antes de delegar | Instruções para o especialista; registro de progresso |
| Ao concluir um subagente | Orientações para a consolidação; registro de progresso |
| Após editar fonte ADT | Registrar retorno; exigir validação de sintaxe inativa |
| Antes da resposta final | Solicitar revisão com instruções; exigir leitura de fonte/dados; registrar progresso |

Hooks são ações internas configuradas pelo usuário, sem execução de shell ou scripts arbitrários. Registros aparecem nas atividades da mensagem. O hook de evidência exige pelo menos uma leitura bem-sucedida nesta execução; não verifica cada afirmação nem substitui a revisão técnica. O hook de sintaxe exige Qualidade no catálogo ADT antes da gravação e aproveita a validação já executada no salvamento; erros ficam visíveis nos retornos. Não ativa automaticamente objetos.

## Validação

Testes simulam isolamento de contexto e conta, autorização de modelos, paralelismo, falhas parciais, cancelamento, limites, hooks, persistência local e compartilhamento do grant ADT. Os três provedores passam pelo mesmo mecanismo de ferramentas e hooks finais. Validação real com provedores pagos e SAP deve ser realizada pelo usuário em seu ambiente.
