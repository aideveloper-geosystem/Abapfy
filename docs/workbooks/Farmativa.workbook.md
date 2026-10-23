# Workbook do cliente — Farmativa

Versão: 1.0 | Data: 23/10/2026 | Situação: base inicial para revisão.

## 1. Contexto confirmado

| Informação | Definição |
| --- | --- |
| Cliente | Farmativa |
| Sistema | SAP S/4HANA 2023 |
| ADT | Ativo, conforme informado pelo cliente |
| Cabeçalho de código | Autor, descrição, data e log de modificações |

Este workbook orienta os modelos nas demandas da Farmativa. As informações acima foram fornecidas pelo usuário. As demais convenções deste documento são propostas de padrão inicial, sujeitas à validação do responsável técnico; não representam políticas corporativas já confirmadas.

Não inferir módulos, processos de negócio, regras regulatórias ou estrutura organizacional a partir do nome do cliente.

## 2. Como atuar nas demandas

- Responder em português do Brasil, com explicações objetivas e voltadas à demanda.
- Considerar SAP S/4HANA 2023 como versão de referência; verificar a disponibilidade dos objetos e recursos utilizados no ambiente alvo.
- Distinguir informação confirmada, hipótese e pendência. Não inventar tabelas, campos, APIs, BAdIs, assinaturas ou regras funcionais.
- Reaproveitar o contexto do módulo, os arquivos selecionados e os objetos existentes antes de propor novos desenvolvimentos.
- Perguntar apenas o que bloquear uma decisão funcional ou técnica. Para exemplos, usar marcadores explícitos como `<PACOTE>` e `<AUTOR>`.
- Não declarar compilação, ativação, testes ou consultas SAP como realizados sem evidência da execução.
- ADT ativo indica disponibilidade informada, sem comprovar conexão, permissões ou acesso a um sistema específico. Acessar SAP somente quando solicitado na mensagem e com a conexão explicitamente selecionada e autorizada no aplicativo.
- Não incluir credenciais, tokens, senhas ou dados pessoais reais nos exemplos, comentários ou logs.

## 3. Cabeçalho e rastreabilidade — obrigatório

Incluir cabeçalho em cada objeto de código criado. Em alterações, preservar os dados originais e acrescentar uma entrada ao histórico, sem atribuir a criação do objeto ao autor da manutenção.

Modelo para fontes ABAP:

```abap
"======================================================================
" Cliente   : Farmativa
" Objeto    : <NOME_TECNICO_DO_OBJETO>
" Autor     : <NOME_OU_USUARIO_DO_RESPONSAVEL>
" Descrição : <OBJETIVO_FUNCIONAL_DO_OBJETO>
" Data      : <DD/MM/AAAA>
" Demanda   : <CHAMADO_OU_NAO_INFORMADO>
"----------------------------------------------------------------------
" Log de modificações
" Data       | Autor        | Demanda       | Descrição
" <DD/MM/AAAA> | <AUTOR>    | <CHAMADO>     | Criação inicial
"======================================================================
```

- Preencher autor com o responsável informado na demanda; não usar o nome da IA nem inventar um usuário SAP.
- Usar a data efetiva da criação ou alteração. Não reutilizar automaticamente a data deste workbook.
- Descrever a finalidade funcional no cabeçalho e o que mudou em cada entrada do log.
- Acrescentar o histórico em ordem cronológica, preservando as entradas anteriores.
- Se faltarem autor, data histórica ou chamado, sinalizar a pendência; não fabricar rastreabilidade.
- Para classes globais, usar o cabeçalho na fonte principal; documentar contratos públicos relevantes com ABAP Doc. Não repetir o histórico completo em cada método.
- Em CDS e outros tipos de fonte, adaptar o cabeçalho à sintaxe de comentário aceita pelo artefato.
- O log no código complementa o controle de versões e transportes.

## 4. Estilo de código — padrão base proposto

- Usar nomes descritivos, métodos com responsabilidade clara e organização consistente. Preferir orientação a objetos em novos desenvolvimentos quando adequada ao cenário.
- Sugerir identificadores novos em inglês e documentação funcional em português; preservar o idioma e o padrão de objetos existentes.
- Na ausência de convenção do cliente, sugerir `ZCL_` para classes e `ZIF_` para interfaces, sujeitos à confirmação de namespace, colisões e limites do objeto. Não tratar esses prefixos como nomes já aprovados.
- Usar formatação consistente pelo formatter/Pretty Printer do ADT, com palavras-chave em maiúsculas e indentação uniforme.
- Empregar sintaxe ABAP moderna quando compatível com o objeto e sua versão de linguagem. Não presumir ABAP Cloud ou ABAP clássico apenas pela versão do S/4HANA.
- Preferir tipos adequados ao domínio, constantes para valores técnicos e configuração para valores de negócio variáveis. Evitar códigos fixos de empresa, centro, organização ou usuário.
- Comentar decisões e restrições relevantes; evitar comentários que apenas repitam o código e trechos desativados acumulados.
- Preservar o estilo do legado ao corrigir um defeito; separar refatorações amplas do escopo solicitado.

Referência de estilo: [Clean ABAP — SAP](https://github.com/SAP/styleguides/blob/main/clean-abap/CleanABAP.md). As escolhas locais de cabeçalho, idioma e nomenclatura são propostas deste workbook.

## 5. Acesso a dados e desempenho — padrão base proposto

- Selecionar os campos necessários e restringir o volume de dados com filtros coerentes com a regra funcional.
- Evitar acessos repetidos ao banco dentro de loops; avaliar operações em conjunto sem alterar a semântica esperada.
- Usar `SELECT SINGLE` quando a intenção e a chave identificarem o registro esperado; se houver múltiplos candidatos, definir um critério determinístico.
- Ao usar `FOR ALL ENTRIES`, verificar se a tabela de entrada está preenchida e avaliar duplicidades e volume.
- Escolher tabelas internas e chaves conforme o padrão de acesso. Não introduzir otimizações complexas sem necessidade demonstrada.
- Evitar leituras irrestritas de grandes volumes. Considerar paginação ou processamento em pacotes quando necessário.
- Preferir ABAP SQL e recursos de dados adequados ao cenário; justificar Native SQL, AMDP e dependências específicas do banco.
- Em recomendações de desempenho, separar expectativa de melhoria de resultado medido e informar como validar.

## 6. Integridade, segurança e extensibilidade — padrão base proposto

- Verificar autorizações no ponto adequado antes de expor dados ou executar ações; não confiar apenas em controles da interface.
- Não atualizar diretamente tabelas standard de negócio. Avaliar APIs e pontos de extensão suportados para o processo e o ambiente.
- Confirmar existência, assinatura, disponibilidade e restrições de uso de BAPIs, classes, CDS e BAdIs antes de apresentar uma solução como pronta para ativação.
- Definir quem controla a transação; não incluir `COMMIT WORK` ou `ROLLBACK WORK` em componentes reutilizáveis sem conhecer o contrato do chamador.
- Tratar bloqueios, concorrência e falhas parciais quando houver alteração de dados.
- Tratar exceções e retornos de erro explicitamente. Evitar capturas vazias, descarte de mensagens e mensagens de sucesso sem confirmação.
- Usar mensagens compreensíveis, com contexto suficiente para diagnóstico e sem exposição de dados sensíveis.
- Avaliar alternativas de extensão antes de modificar objetos standard. Mudanças invasivas exigem decisão explícita do responsável técnico.

## 7. Entrega e validação — padrão base proposto

Ao entregar uma solução, apresentar:

1. Objetivo e comportamento esperado.
2. Objetos criados ou alterados e dependências.
3. Código com cabeçalho e histórico aplicáveis; identificar trechos incompletos como exemplos ou pendências.
4. Pressupostos, parâmetros e decisões que precisam de confirmação.
5. Cenários de teste e resultados efetivamente obtidos.

Validar sintaxe e ativação no ambiente autorizado, aplicar verificações ATC disponíveis e testes ABAP Unit quando pertinentes à lógica. Não afirmar aprovação nessas verificações sem executá-las.

Cobrir os cenários aplicáveis: sucesso, ausência de dados, entrada inválida, autorização insuficiente, duplicidade, bloqueio, erro de integração e volume. Informar quais dependem de homologação funcional ou execução no SAP.

Não definir pacotes, requests, destinos, mandantes ou etapas de transporte por suposição. Não ativar, transportar ou executar operações de escrita além do escopo autorizado.

## 8. Informações a confirmar conforme a demanda

| Informação pendente | Orientação provisória |
| --- | --- |
| Modalidade de implantação e versão de linguagem ABAP | Não presumir on-premise, private/public cloud ou ABAP Cloud |
| SID, mandante e conexões de desenvolvimento/homologação | Usar apenas a conexão selecionada e autorizada |
| Módulos e processos atendidos | Considerar somente os informados na demanda |
| Namespace, nomenclatura e pacotes | Preservar padrões existentes; novos nomes são sugestões |
| Autor responsável e identificação de chamados | Solicitar quando necessário para a entrega final |
| Política de transportes e aprovações | Seguir o fluxo informado pelo cliente |
| Variante ATC e critérios de qualidade | Confirmar a variante disponível e os bloqueios definidos |
| Política de extensibilidade e APIs permitidas | Validar antes de escolher a implementação |
| Requisitos de auditoria e retenção de logs | Não presumir requisitos setoriais |

## 9. Histórico deste workbook

| Data | Versão | Alteração |
| --- | --- | --- |
| 23/10/2026 | 1.0 | Base Farmativa com S/4HANA 2023, ADT ativo, cabeçalho obrigatório e propostas de boas práticas |
