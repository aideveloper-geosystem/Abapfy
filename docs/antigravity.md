# Integração com o Antigravity

Configurações → Integrações → **Antigravity** permite usar os modelos **Gemini** do Antigravity IDE no
chat do Abapfy, com o login do próprio IDE (sem chave de API).

## Como funciona

```
Abapfy (renderer) ──IPC──> main/antigravity.ts ──> language_server.exe agentapi ──> daemon do IDE (logado) ──> modelo
                                    │                                     
                                    └─ lê a resposta em ~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl
```

- O IDE precisa estar **aberto e logado**. O Abapfy só fala com o daemon local; nenhum token da conta é
  lido, copiado ou salvo. A porta e o token CSRF do daemon (`~/.gemini/antigravity/daemon/hub_*.json`)
  ficam no processo principal e nunca chegam ao renderer.
- `agentapi` é executado direto pelo `language_server.exe`, **sem `cmd.exe`**: o texto do usuário nunca
  passa por um shell. Prompts acima de ~24 mil caracteres (limite de linha de comando do Windows) vão
  para um arquivo temporário que o modelo é instruído a ler; o arquivo é apagado ao final.
- Cada resposta cria uma conversa chamada “Abapfy” no IDE e consome a cota do plano.

## Ao ligar

- O chat usa **somente** os modelos Gemini liberados na conta (lista vinda do IDE; `orchestrator` fica
  de fora). As APIs com chave própria (OpenAI/Gemini/Claude), o router Claude e os fluxos avançados ficam
  desativados enquanto a integração estiver ligada. Desligar volta ao modelo padrão por API.
- A preferência (ligado + modelo) é local por usuário e computador: `userData/antigravity/<userId>.json`.
- Notícias e o assistente de tarefas também passam a usar o modelo do Antigravity.
- O resumo de compactação de contexto usa o mesmo modelo Gemini (em vez do router Claude).

## Ferramentas e contexto

O `agentapi` só recebe texto e devolve texto: não há function calling nativo. As ferramentas (SAP ADT,
MCP, arquivos do cliente, checkpoint de progresso) são anunciadas no prompt e o modelo as chama com
blocos `<tool_call>{"name": ..., "arguments": {...}}</tool_call>`. O Abapfy executa cada chamada pelo
mesmo caminho de sempre (permissões por agente, confirmações, cache de leituras, limites de rodadas) e
devolve `<tool_result>` na rodada seguinte. Detalhes em `src/shared/antigravityProtocol.ts`. Cada rodada é
uma conversa nova no IDE com o histórico completo.

Limitações:

- Imagens anexadas não são enviadas (o chat avisa o modelo).
- A resposta chega inteira, sem streaming.
- O agente do próprio IDE tem ferramentas (editar arquivos, executar comandos). O prompt instrui o modelo
  a não usá-las, mas essa instrução não é uma barreira técnica.
- `agentapi` e o formato do transcript não são documentados e foram verificados no IDE **2.35.0**; podem
  mudar em outras versões.

## Cota

A tela consulta o daemon (`GetUserStatus`) a cada 30 s com a aba aberta e mostra, por família (Gemini,
Claude, outros), a fração restante e o horário de renovação informados pelo IDE, além do plano. Mostra
também o uso do Abapfy na sessão (chamadas e tokens; inclui o contexto interno do IDE, ~14 mil tokens por
chamada). Apenas a família Gemini é utilizável no Abapfy.
