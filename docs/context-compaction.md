# Compactação de contexto

Disponível em Configurações → Features → Compactação de contexto. Usa o modelo de router já configurado no aplicativo (`ROUTER_MODEL`), com chave Claude e verificação de acesso ao modelo. A geração de resumo consome tokens da API; não utiliza o modelo local de embeddings.

Padrão: automática ligada, orçamento de entrada de 64.000 tokens, gatilho em 70%, quatro trocas completas recentes preservadas e resumo de até 2.048 tokens estimados. A solicitação atual e suas fontes são preservadas. Os campos permitem personalização e restauração do padrão. O orçamento é escolhido pelo usuário e deve reservar espaço para respostas e ferramentas dentro da janela do modelo usado.

O indicador no input mostra uma estimativa do contexto de envio. Inclui histórico, resumo existente, rascunho/anexos e as instruções/fontes da última solicitação preparada. Perto do gatilho, chamadas Claude também consultam o [endpoint oficial de contagem de tokens](https://platform.claude.com/docs/en/build-with-claude/token-counting), utilizando o modelo selecionado. Ferramentas e fontes que ainda serão obtidas durante uma execução podem acrescentar tokens. Sem contagem disponível, utiliza estimativa local conservadora por caracteres; o indicador não representa uma medição exata da janela do modelo.

## Funcionamento

- Antes do envio, o histórico antigo é resumido em objetivo, fatos/fontes, decisões, restrições, correções, identificadores técnicos, pendências e incertezas.
- Lotes são integrados sequencialmente ao resumo anterior. O resumo só passa a valer após validação de JSON, identificadores presentes na fonte, tamanho e redução do contexto, além de gravação local bem-sucedida.
- Código e anexos originais permanecem no histórico. Referências a identificadores/arquivos e pedidos de revisão de código recuperam fontes originais relevantes; o agente é orientado a não reconstruir assinaturas a partir do resumo.
- A animação e a atividade no chat mostram o andamento, conclusão ou falha. A atividade concluída permite inspecionar o resumo e a redução estimada de tokens.
- Não compacta no meio de uma execução de ferramentas ou de uma resposta JSON. Novas evidências são incorporadas e o orçamento é reavaliado antes do envio ao agente. Continuações de respostas também verificam orçamento.

`/compact` compacta manualmente a conversa aberta, mesmo com o automático desligado, sem enviar uma pergunta ao agente. O botão no indicador tem o mesmo efeito. Não compacta durante uma resposta em andamento. Se ainda não houver histórico antigo além das trocas preservadas, informa que não há mensagens elegíveis.

Mensagens originais permanecem no Supabase. O snapshot usado para preparar o contexto fica neste computador, separado por conta/chat em `userData/local-features/contexts`, sem migration nem upload do catálogo. A atividade visível da compactação, incluindo o resumo exibido e as contagens, acompanha a mensagem salva no Supabase. Reabrir o chat valida o hash do conteúdo original antes de reutilizar o snapshot local. Em outro computador o snapshot é recriado quando necessário.

Cancelamento, troca de conta, erro do router, resumo inválido e falha de gravação preservam o contexto anterior. Uma falha automática permite continuar com o contexto anterior somente se ele couber no orçamento; caso contrário o envio para e informa o motivo. Resumo sem redução também é descartado.

## Teste no aplicativo

1. Reinicie o modo de desenvolvimento para carregar os novos handlers de Electron.
2. Abra uma conversa com mais de quatro trocas completas e envie `/compact`. Confira animação, atividade concluída e resumo dentro de Atividade. Pergunte por uma decisão/correção anterior e confira a fidelidade.
3. Reabra o chat: o resumo deve ser reutilizado, mantendo todas as mensagens visíveis. Peça revisão de um identificador de código antigo e confira a recuperação da fonte original.
4. Para disparar automaticamente em uma conversa menor, configure temporariamente orçamento de 8.000, gatilho de 40% e duas trocas preservadas. Use histórico com volume suficiente e deixe espaço para as instruções atuais. Depois restaure o padrão.
5. Desligue o automático e confirme que `/compact` continua funcionando. Teste Cancelar durante a compactação: a conversa deve permanecer íntegra.

Testes automatizados exercitam o router com respostas simuladas; a qualidade semântica do resumo real precisa ser conferida no aplicativo com o acesso e a chave do usuário.
