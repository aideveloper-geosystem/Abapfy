# Arquivos completos e fluxo de desenvolvimento ADT

Implementação local de 29/10/2026. Não publica uma release nem altera configurações SAP.

## Arquivos do cliente

- A importação preserva o texto extraído inteiro. O limite de upload existente (20 MB) continua explícito. PDF sem texto e DOCX sem texto retornam diagnóstico; OCR não está incluído.
- Selecionar uma pasta disponibiliza um catálogo paginado e ferramentas de busca literal e leitura por posição, com linhas, revisão SHA-256, próxima posição e cobertura. Subpastas entram no mesmo escopo. O catálogo percorre páginas até o servidor retornar uma página vazia.
- O texto não é colado inteiro a cada mensagem. O modelo decide o que consultar e pode percorrer todos os arquivos para uma análise integral. Os limites da janela e de trabalho continuam existindo; atingir um limite deixa uma pendência explícita.
- Extrações antigas com o marcador de truncamento são reconstruídas a partir do original no Storage durante a leitura. O botão **Recuperar texto completo** permite reprocessar os arquivos antigos da pasta aberta. Sem original, o aplicativo informa a necessidade de reenviar. Se a conta só puder ler, a extração integral é utilizada sem alegar atualização do cadastro.
- A recuperação usa atualização condicional para preservar alterações concorrentes. Cada leitura confere conta, cliente, módulo, existência e pasta do arquivo. O cache guarda apenas o último arquivo consultado e revalida seus metadados.
- Anexos de mensagens preservam seu texto integral no histórico e expõem referências ao modelo. Mensagens antigas no formato anterior continuam legíveis.

## Trabalho no SAP

- A conexão continua sendo selecionada explicitamente. Permissões por agente e aprovações de gravação/ativação continuam sendo conferidas no processo principal.
- **Permissões SAP** mostra leitura, edição, qualidade, transportes e ativação na conexão selecionada. Os diagnósticos da mensagem distinguem ferramenta desabilitada de falha de comunicação.
- `list_sources` descobre as fontes da estrutura SAP. `read_source`, `preview_edits`, `edit_source` e `syntax_check` aceitam uma fonte dessa estrutura. Includes independentes de programas continuam sendo pesquisados como objetos próprios.
- `preview_edits` prepara uma proposta sem gravar. `edit_source` aceita até 30 substituições independentes na mesma fonte, verificadas contra o mesmo original. Ocorrências ambíguas, alterações sobrepostas e mistura dos formatos de edição são rejeitadas.
- A gravação exige hash atual, revisão dos trechos, request/tarefa ou objeto local confirmado, lock e releitura da fonte inativa. Cada fonte é gravada separadamente; não existe transação atômica envolvendo vários objetos.
- Quando a permissão de qualidade está habilitada, a fonte salva é verificada sintaticamente. Erros de sintaxe não escondem o fato de que a versão inativa já foi salva; o retorno separa gravação e validação.
- A ativação exige aprovação própria. Fontes inativas alteradas do mesmo objeto precisam ter sido lidas; estrutura e hashes são conferidos novamente sob lock. Erros de sintaxe ou falha da checagem autorizada impedem essa ativação. Gravações/ativações incertas nunca são repetidas automaticamente.

## Continuidade e apresentação

O progresso é salvo no JSON `tool_activity` que já existe no histórico. O escopo inclui conta, conversa, cliente, módulo, pasta, conexão e agente. A continuação preserva notas, resultados por objeto e intervalos lidos por revisão de arquivo. Não preserva credenciais nem autorizações. Uma nova mensagem SAP pesquisa/lê novamente antes de editar.

A atividade da conversa apresenta propostas, gravações inativas, validação, ativação, falhas e posições de continuação. Leituras anteriores só se combinam com a atual quando o hash da fonte corresponde. Notas são dados históricos, não instruções ou autorização.

O ciclo possui até 256 rodadas em tarefas com arquivos/SAP e considera o orçamento de entrada configurado, incluindo descrições de ferramentas. Resultados anteriores podem sair da janela de trabalho e ser consultados novamente. Resultados grandes de ferramentas genéricas ficam disponíveis integralmente por `workspace_read_result`, em páginas, durante a mensagem. Essa leitura não repete a operação original.

## Validação

Os testes cobrem extração acima de 60 mil caracteres, reconstrução exata de páginas Unicode, catálogo acima de 500 arquivos, recuperação de originais, troca de conta, arquivos movidos/removidos, retomada por revisão, execução nos três provedores, propostas sem gravação, múltiplas alterações, includes, conflitos e proteção da ativação. Typecheck, lint e build local complementam a suíte. A prévia visual da atividade utiliza dados fictícios em Electron oculto, em larguras ampla e estreita.

Não houve conexão ou gravação em SAP real, alteração no Supabase remoto ou reprocessamento em massa de dados reais nesta implementação. Esses fluxos precisam de validação no ambiente de desenvolvimento selecionado; o erro do teste SAP anterior não foi fornecido.

Resultado das verificações locais: **171/171 testes passaram**, `pnpm typecheck` passou e `pnpm lint` encerrou sem erros, com o aviso preexistente de dependência de hook em `SharedEfDocument.tsx:48`.

## Recuperação de sessões (ajuste após teste em dev)

O erro observado `Claude: Overloaded` encerrava a resposta final depois do trabalho com ferramentas. O ciclo anterior também gerava novamente uma resposta que já havia sido produzida durante esse trabalho.

- O chat agora utiliza diretamente a resposta final do ciclo com ferramentas, com seus blocos originais, sem iniciar uma segunda geração para reexplicar o trabalho.
- Falhas temporárias HTTP 408/429/5xx e eventos SSE `overloaded_error` são recuperados no ponto da chamada ao modelo, com até cinco novas tentativas, espera progressiva e respeito a `Retry-After`. Autenticação, requisições inválidas e quota financeira não são repetidas.
- A recuperação nunca envolve repetir o executor de ferramentas. As chamadas concluídas e os respectivos resultados continuam no histórico da rodada. Uma gravação SAP incerta continua exigindo conferência.
- O ciclo Claude usa streaming, preserva blocos assinados de raciocínio e de ferramentas, continua `pause_turn` e limites de saída, e rejeita argumentos incompletos antes de executar qualquer ferramenta daquela resposta.
- Quando a janela de trabalho precisa ser renovada, a sessão reenvia o pedido e o progresso registrado, mantendo as fontes completas acessíveis e os resultados de operações conhecidos. O limite de trabalho é de 256 rodadas para arquivos/SAP; atingir o limite deixa a tarefa pendente.
- A sessão mostra recuperação e continuação em andamento. Uma interrupção, cancelamento ou erro final não aparece como conclusão, mesmo que todas as leituras anteriores tenham terminado.
- O botão de parar cancela também a espera por uma nova tentativa. Uma falha persistente ainda encerra a execução com o progresso preservado; não há promessa de disponibilidade contínua do provedor.

Referências do protocolo: [erros Claude](https://platform.claude.com/docs/en/api/errors), [streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [motivos de parada](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons). Os testes de recuperação utilizam respostas simuladas, sem consumir a API do usuário.

Validação após o ajuste de recuperação: **186/186 testes passaram**, typecheck e build aprovados. O lint ficou sem erros, mantendo apenas o aviso preexistente em `SharedEfDocument.tsx:48`. O servidor dev respondeu HTTP 200 para o módulo corrigido e a janela Abapfy permaneceu aberta. A sobrecarga foi reproduzida por respostas simuladas HTTP/SSE; a confirmação com a API real fica para o teste do usuário.


Após o ajuste, o usuário confirmou que o teste em dev funcionou e autorizou commit, push e a release 1.0.9. Essa confirmação cobre o fluxo testado pelo usuário; não foi atribuída a uma gravação SAP real específica.
