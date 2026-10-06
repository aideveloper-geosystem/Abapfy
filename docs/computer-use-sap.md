# Computer use SAP

O modelo principal selecionado conduz a janela SAP GUI por imagens e entrada nativa Windows. SAP GUI Scripting não é necessário. O subagente Haiku foi removido deste fluxo; o router de agentes e skills continua independente.

## Configuração

Em Configurações → Computer use · SAP, ative o contexto visual, selecione a janela, confira a prévia e escolha o modo. Desativado permite somente leitura visual.

| Modo | Aprovação |
| --- | --- |
| Básico | Cada clique, digitação e tecla. |
| Automático | Escritas e ações incertas: cliques, texto e teclas além de Tab. Observar e mover foco com Tab seguem automaticamente. |
| Full | Alerta nativo ao ativar; nenhuma aprovação por ação. |

A imagem não permite garantir que um clique apenas consulta. Por isso, Automático é conservador e não aceita uma classificação de segurança fornecida pelo modelo. F5/F6/F7/F8 podem executar código.

## Conversa contínua

O principal recebe a captura inicial, decide uma ação e declara o resultado visual esperado. A ferramenta devolve o resultado do envio e uma nova captura. A chamada seguinte preserva o histórico de ferramentas, resultados e assinaturas de raciocínio do provedor, removendo apenas imagens antigas para reduzir custo. Apenas uma captura atual é enviada por decisão.

O modelo deve avaliar a ação anterior como progresso, sem progresso ou incerta. Pode atualizar a captura sem enviar entrada, ou encerrar como concluído, bloqueado ou precisando de ajuda. O chat distingue entrada enviada de resultado observado pelo modelo. Uma diferença na imagem é apenas um indício; não prova sucesso da tarefa.

Capturas são enviadas ao provedor do modelo principal. São efêmeras e não são incluídas no histórico persistido do chat.

## Captura e coordenadas

Captura e entrada usam a geometria física da mesma janela Windows, com consciência de DPI. PrintWindow captura apenas a janela selecionada. PNG preserva detalhes; imagens grandes são reduzidas proporcionalmente até 2048 × 1536, respeitando o limite de 6 MB.

O modelo informa pixels da imagem, com origem no canto superior esquerdo. O processo principal converte esses pixels em coordenadas físicas, inclusive em monitores com origem negativa. Cada entrada exige o identificador da captura atual, de uso único. Se a janela mudar de posição ou tamanho, o identificador expirar ou outra captura substituir a anterior durante a aprovação, a entrada será bloqueada. Capturas vazias, uniformes e janelas minimizadas também são rejeitadas.

## Progresso e interrupção

Limites por interação: 24 entradas, 32 decisões e dez minutos; cada chamada ao provedor tem limite de 90 segundos. Parar no chat cancela o controle. Mudanças de configuração, revogação do modelo, perda da janela ou falhas encerram o fluxo preservando o relato parcial.

Cliques próximos sem progresso são interrompidos na terceira tentativa. Digitação ou execução idêntica com resultado incerto não é repetida. O principal deve mudar a estratégia ou pedir ajuda. Um clique de foco pode não alterar a imagem: confirmar foco e digitar é preferível a continuar clicando.

## Auxiliar Windows

Um processo PowerShell oculto prepara a integração uma vez e recebe requisições JSON serializadas. O script fixo é enviado separadamente dos dados; campos do modelo nunca são interpolados em código PowerShell. Cada ação verifica janela, processo, geometria e foco. Antes de um clique, também verifica se outra janela está cobrindo o ponto de destino. Cancelamento encerra o auxiliar e nenhuma entrada é repetida automaticamente. Ao sair do Abapfy, o auxiliar é encerrado.

Configurações anteriores migram ask → Básico e always → Automático. Full não é ativado por migração. A opção antiga de executor é descartada. A ponte IPC usa versão 4: reinicie o aplicativo depois da atualização.

## Validação

- node --test --test-isolation=none tests/sap-control.test.mjs: política, migração, pixels, histórico dos três provedores, capturas, limites, cancelamento e protocolo.
- node tests/sap-native-smoke.mjs: enumeração real e reutilização do auxiliar Windows, sem enviar entradas.
- node tests/sap-native-capture-smoke.mjs: captura de uma janela sintética fora da área visível, sem interagir com SAP.

Essas verificações não substituem o teste de uma transação ou debug no SAP real, com o modelo configurado e uma sessão de teste.
