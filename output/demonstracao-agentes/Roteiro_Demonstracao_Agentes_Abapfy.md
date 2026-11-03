# Abapfy - roteiro de demonstração dos agentes

Apresentação: 08/10/2026 | Referência: v1.0.3 | Duração sugerida: 50 minutos

O time de compras perde tempo consolidando pedidos e quer consultar itens, corrigir um saldo de entrega e documentar a solução. O percurso começa no negócio, passa por especificação e estimativa e chega à geração, edição, revisão e documentação de código.

Cenário fictício: cliente Demo Compras, módulo MM, S/4HANA on-premise 2023 e ABAP 7.57. Use o produto/release real no seletor do app se for diferente. Os nomes Z são propostas de novos objetos, não objetos encontrados em um SAP.

Escopo: 10 agentes padrão versionados. O catálogo real pode ter agentes renomeados, desativados ou customizados; conferir na conta usada. Roteiro baseado nos contratos do código, sem consultar o catálogo autenticado ao vivo.

## Preparação

- Abrir a v1.0.3 e conferir a migração 035, modelo habilitado e chave Claude disponível para o router.
- Usar uma conta de usuário base e conferir agentes habilitados, modelo permitido e skills disponíveis. Preparar configurações administrativas antes.
- Selecionar cliente, módulo e pasta de demonstração acessíveis à conta; manter o contexto durante a geração de documento.
- Preparar o modelo DOCX na raiz do módulo EF/EFs; conferir gravação na pasta escolhida e abertura no Word.
- Revisar os parâmetros de estimativa. Não alterar valores reais da empresa apenas para ensaiar.
- Abrir novo chat e fixar o agente em cada demonstração. Reusar o chat apenas no acompanhamento daquele agente.
- Para o router, usar outro chat sem agente fixo, enviar o prompt do Abaper e conferir agente e skills. A seleção depende do catálogo habilitado.
- Manter uso do SAP desativado na demo central. Fontes são propostas didáticas, sem compilação ou execução SAP verificada.
- Ensaiar cada caso hoje. Guardar exemplos de reserva e identificar o que foi gerado ao vivo e o que já estava pronto.

## Ordem sugerida

| Etapa | Tempo |
| --- | --- |
| Abertura e router | 3 min |
| Consultor SAP | 4 min |
| Consultor de Customizing SAP | 4 min |
| EF Consultant | 5 min |
| Estimador de Esforço ABAP | 4 min |
| Abaper | 6 min |
| Editor SAP | 4 min |
| Code Review | 4 min |
| Performance Analyzer | 4 min |
| Enhancement Finder | 4 min |
| DTec Consultant | 4 min |
| Fechamento e dúvidas | 4 min |

## Condução

Selecione o agente e envie o prompt inicial. Mostre a resposta e envie o acompanhamento no mesmo chat. O terceiro prompt é reserva. Para CDS do Abaper, abra outro chat. Quando houver fonte de entrada, cole o arquivo inteiro imediatamente abaixo do prompt. Os fontes têm problemas intencionais; não são entregáveis de produção.

## 1. Consultor SAP

**Objetivo:** Organizar um pedido informal de negócio | **Tempo:** 4 min | **ID:** `consultor`

**Preparar:** Novo chat com agente fixado; nenhum arquivo necessário.

### Prompt inicial

> O pessoal de compras fica juntando várias planilhas pra acompanhar os pedidos. Quero uma consulta com pedido, item, fornecedor, material, quantidade e data de criação, filtrando por empresa, fornecedor e período. Estamos num S/4HANA on-premise 2023. Me ajuda a organizar isso e vê primeiro se dá pra atender com algo standard, antes de sair criando Z.

### Acompanhamento

> Boa. Pra primeira versão vamos só consultar e exportar o resultado, sem alterar pedido e sem mandar e-mail. Ajusta o escopo, separa o que já sabemos do que falta confirmar e coloca os critérios de aceite.

### Variação / teste extra

> O usuário quer ver tudo de todas as empresas. Como eu trato esse ponto sem ignorar as autorizações?

### O que mostrar

- Contexto, processo atual e desejado, regras, riscos e pontos em aberto organizados.
- Avaliação do standard antes de desenvolvimento, sem garantir disponibilidade no cliente.
- Escopo de consulta e autorização explícitos; critérios de aceite testáveis.

### Conferir

- Não assumir que um Z já foi aprovado ou que uma transação foi encontrada no sistema.
- Não inventar prazo, esforço, empresas ou regras de negócio.

**Fala sugerida:** Aqui a ideia ainda está informal. O agente ajuda a transformar o pedido em um escopo que o funcional e o técnico conseguem discutir.

## 2. Consultor de Customizing SAP

**Objetivo:** Orientar configuração standard | **Tempo:** 4 min | **ID:** `customizing_consultant`

**Preparar:** Novo chat. Não precisa abrir ou operar um SAP para esta demonstração.

### Prompt inicial

> No nosso cenário de treinamento em MM, quero orientar a criação de um grupo de compradores no S/4HANA on-premise 2023. Me mostra o caminho do SPRO bem organizado, a transação direta se você tiver certeza, os pré-requisitos e como validar depois no DEV/QAS. Por enquanto só quero o roteiro, sem executar nada.

### Acompanhamento

> Agora transforma isso num checklist simples pro funcional: o que configurar, o que testar e o que conferir no transporte. Se tiver algo que depende do nosso ambiente, deixa bem marcado.

### Variação / teste extra

> A opção não aparece no meu IMG. O que eu preciso te mandar pra você investigar sem chutar o caminho?

### O que mostrar

- Caminho IMG em níveis; transações, pré-requisitos, passos e validação separados.
- Impactos e transporte conforme evidência disponível.
- Lacunas a confirmar, sem afirmar configuração aplicada.

### Conferir

- Não transformar a configuração em ABAP, BAdI ou tabela Z automaticamente.
- Não sugerir alteração direta em tabela nem dizer que acessou o DEV.

**Fala sugerida:** Esse agente é focado em parametrização. A demonstração mostra orientação organizada; execução no SAP é um fluxo separado.

## 3. EF Consultant

**Objetivo:** Gerar EF no modelo Word do cliente | **Tempo:** 5 min | **ID:** `ef_consultant`

**Preparar:** Cliente selecionado; módulo EF/EFs com default.docx ou base.docx na raiz; pasta ativa e permissão de gravação. Use o modelo real do cliente.

### Prompt inicial

> Preciso montar a EF da Consulta de Itens de Pedido de Compra pro cliente Demo Compras, módulo MM. A primeira versão vai filtrar empresa, fornecedor e data de criação e mostrar pedido, item, fornecedor, material, quantidade e unidade. É só leitura, sem atualizar pedido. O acesso tem que respeitar as autorizações do usuário. Gera a EF completa no modelo Word desse cliente, com fluxo, regras, exceções, critérios de aceite e pontos a confirmar. Ainda não definimos quais tabelas ou CDS vão ser usadas.

### Acompanhamento

> Me explica rapidinho os critérios de aceite que você colocou e quais decisões ainda dependem do cliente. Só explica aqui no chat, não precisa gerar outro Word.

### Variação / teste extra

> Agora revisa a EF completa pra incluir tratamento de filtro sem resultado e mensagem clara pro usuário. Gera a versão revisada no modelo do cliente.

### O que mostrar

- EF com objetivo, escopo, regras, fluxo, exceções, aceite e pendências.
- DOCX com modelo do cliente salvo na pasta ativa; abrir e conferir capa, tabelas e cabeçalho.
- Acompanhamento respondido no chat, sem gerar documento novo automaticamente.

### Conferir

- Modelo ausente, módulo ambíguo ou falta de permissão deve ser informado.
- Tabelas/CDS sugeridas não podem aparecer como mapeamento confirmado.

**Fala sugerida:** O ganho aqui é sair da conversa para uma especificação no padrão documental do cliente, com pendências visíveis.

## 4. Estimador de Esforço ABAP

**Objetivo:** Estimar com parâmetros e mostrar recálculo | **Tempo:** 4 min | **ID:** `effort_estimator`

**Preparar:** Parâmetros de estimativa revisados na conta e fatores do cliente conferidos. Sem cadastro, mostrar a pendência, não números inventados.

### Prompt inicial

> Me ajuda a estimar essa entrega: um report novo em MM, só consulta, com filtro de empresa, fornecedor e período, leitura de cabeçalho e itens e saída ALV. Sem interface, sem tabela Z, sem job e sem alteração de pedido. Usa os parâmetros cadastrados e monta os três cenários. O cliente é Demo Compras; se ele não tiver fator cadastrado, deixa essa premissa explícita.

### Acompanhamento

> A leitura ficou mais simples do que eu pensei. Como isso muda a estimativa? Se faltar uma combinação nos parâmetros, me mostra a pendência em vez de inventar horas.

### Variação / teste extra

> Além do desenvolvimento, já combinamos 2 horas de acompanhamento. Inclui isso como atividade adicional explícita e explica como entrou na conta.

### O que mostrar

- Objetos sustentados pelo requisito; cenários Agressiva, Segura e Tranquila.
- Horas dos parâmetros; multiplicadores 0,75 / 1,00 / 1,35 e premissas visíveis.
- Alterar a complexidade na interface para outra opção cadastrada e conferir o recálculo.

### Conferir

- Somar fases e conferir totais; fator ausente deve ser declarado.
- Sem parâmetros, não apresentar zero horas como estimativa pronta; não inventar objetos ou fases extras.

**Fala sugerida:** Aqui a IA organiza o escopo, mas as horas têm uma base cadastrada e os cenários podem ser revisados pelo usuário.

## 5. Abaper

**Objetivo:** Criar REPORT e CDS com pedido informal | **Tempo:** 6 min | **ID:** `abaper`

**Preparar:** Duas conversas independentes: REPORT e CDS. Os objetos gerados são propostas; ativação não faz parte da demo no Abapfy.

### Prompt inicial

> Faz um report ZREPORT_DEMO_COMPRAS pra mim, bem direto, em ABAP 7.57. Quero selecionar empresa, fornecedor e data de criação e listar pedido, item, material, quantidade e unidade num ALV. Usa EKKO e EKPO como origem informada pra esse exemplo, seleciona só os campos necessários e não faz SELECT dentro de LOOP. Se não vier nada, mostra uma mensagem amigável. Não precisa inventar tela nem OO desnecessário. Me entrega o código completo e deixa claro o que preciso validar de autorização e ativação no SAP.

### Acompanhamento

> Ficou legal. Agora adiciona um filtro opcional por material, mantendo a mesma abordagem do programa. Explica quais blocos mudaram.

### Variação / teste extra

> Agora quero uma CDS view entity chamada ZI_DemoPurchaseOrderItem em ABAP 7.57. Pro exemplo, use EKKO e EKPO como origens informadas e faça o vínculo por EBELN. Quero uma linha por pedido e item, com empresa, fornecedor, material, quantidade e unidade. Não calcula saldo pendente porque não forneci o histórico de recebimentos. Cuida da relação quantidade/unidade, explica as chaves e marca os requisitos de autorização e ativação. Sem OData por enquanto.

### O que mostrar

- REPORT completo, filtros coerentes, leitura sem N+1 e uma única abordagem de ALV.
- CDS com fonte DDL, chaves e relação quantidade/unidade coerentes, sem saldo inventado.
- Dependências e validações de release, DDIC e autorização explícitas.

### Conferir

- Não afirmar compilação ou ativação sem evidência do SAP/ADT.
- Não confundir fonte CDS com REPORT; sintaxe, chaves e autorização exigem revisão no ambiente.

**Fala sugerida:** Com um pedido simples, o agente monta uma primeira versão técnica. A pessoa continua responsável por revisar e validar no ambiente.

## 6. Editor SAP

**Objetivo:** Corrigir um programa pronto com escopo pequeno | **Tempo:** 4 min | **ID:** `editor`

**Preparar:** Copiar o fonte ZREPORT_DEMO_SALDO_COM_ERROS.abap integralmente após o primeiro prompt.

### Prompt inicial

> Esse programinha de demo tá calculando o saldo errado. No FORM calcular_saldo, corrige só a busca do recebimento e o cálculo. Cada item tem um único recebimento consolidado. Não quero refatorar o resto nem trocar o WRITE por ALV agora. Se não achar recebimento, considera zero. Me devolve só o bloco alterado e explica o que mudou. Segue o programa:

### Acompanhamento

> Agora quero uma mudança pequena no FORM exibir_resultado: mostrar só os itens com saldo maior que zero. Mantém o restante do programa como está e devolve só esse bloco.

### Variação / teste extra

> E se o recebido for maior que o pedido? Ajusta só o cálculo pra não mostrar saldo negativo. É uma regra nova do nosso exemplo.

### O que mostrar

- Correção usa pedido e item como chave; trata recebimento ausente sem reutilizar o anterior.
- Saldos esperados: 6, 0 e 5, na ordem dos itens do exemplo.
- Na segunda edição, saída tem apenas os itens com saldo 6 e 5, sem reescrever o programa.

### Conferir

- Preservar dados fictícios, nomes e estilo; editar apenas os FORMs solicitados.
- Edição proposta no chat não significa alteração ou ativação no SAP.

**Fala sugerida:** O Editor atende uma manutenção pontual. Aqui eu já indiquei o trecho e pedi uma correção.

## 7. Code Review

**Objetivo:** Revisar código e separar achados de propostas | **Tempo:** 4 min | **ID:** `code_review`

**Preparar:** Usar ZREPORT_DEMO_SALDO_COM_ERROS.abap original, não a versão corrigida pelo Editor.

### Prompt inicial

> Dá uma revisada nesse report de demo como se fosse antes de mandar pra homologação. Quero bugs e riscos primeiro, com o trecho original e a sugestão lado a lado. Os dados são fictícios e ficam em memória; não tem SELECT nem gravação no banco. Não reescreve o programa inteiro. Segue o código:

### Acompanhamento

> Qual problema você corrigiria primeiro e qual caso de teste prova que ele foi resolvido? Se algo depende de contexto que eu não mandei, deixa isso claro.

### Variação / teste extra

> Agora olha só o FORM exibir_resultado. Dá pra melhorar a legibilidade sem mudar o comportamento?

### O que mostrar

- Identifica chave incompleta e risco de reaproveitar recebimento do item anterior.
- Achados com evidência, severidade justificada e comparação de trechos.
- Não atribui riscos de banco ou acesso a dados SAP ao exemplo em memória sem contexto.

### Conferir

- Linhas só quando identificáveis no fonte; confiança e limitações explícitas.
- Não dizer que correções foram aplicadas; não classificar todo achado como crítico.

**Fala sugerida:** O Review faz uma avaliação independente. Ele aponta evidências e propostas para o desenvolvedor decidir o que incorporar.

## 8. Performance Analyzer

**Objetivo:** Diagnosticar N+1 sem inventar ganho medido | **Tempo:** 4 min | **ID:** `performance_analyzer`

**Preparar:** Copiar ZREPORT_DEMO_PERFORMANCE.abap. Código de leitura com problemas intencionais; usar só para análise estática, sem executar na demo.

### Prompt inicial

> Esse report tá demorando e o cliente falou que pode chegar a uns 50 mil pedidos no filtro. Não rodei ST05 nem SAT ainda. Olha o código e me mostra os candidatos a gargalo, principalmente o acesso aos itens. Sugere uma alternativa mantendo uma linha por pedido e item e sem alterar dado nenhum. Não inventa percentual de ganho porque ainda não medi. Segue o código:

### Acompanhamento

> Como eu provo que a melhoria ficou melhor sem mudar o resultado? Me passa um plano de comparação antes/depois: mesma seleção, contagem de linhas, conteúdo e métricas que devo coletar.

### Variação / teste extra

> Quero evitar SELECT dentro de LOOP. Compara JOIN e busca em lote pro caso em que também preciso listar pedidos sem itens, e explica como preservar essa regra.

### O que mostrar

- Localiza SELECT dentro de LOOP, SELECT * e custos potenciais de volume.
- Proposta considera cardinalidade e resultado funcional; pedidos sem itens requerem regra explícita.
- Distingue análise estática de medição; plano de comparação antes/depois.

### Conferir

- Não inventar tempo, plano, índice ou percentual de ganho.
- Nota não é benchmark; sem dados suficientes, nota pode ficar a confirmar.

**Fala sugerida:** Esse agente levanta hipóteses técnicas e sugere como medir. A otimização vira ganho comprovado depois da comparação.

## 9. Enhancement Finder

**Objetivo:** Pesquisar um ponto de extensão sem inventar assinatura | **Tempo:** 4 min | **ID:** `enhancement_finder`

**Preparar:** Pesquisa sobre ME21N sem acesso ao SAP. Referência pública confirma a existência da BAdI, não sua ativação no cliente.

### Prompt inicial

> Preciso estudar uma validação antes de salvar um pedido na ME21N: no nosso exemplo, grupo de compras vazio tem que gerar erro. É S/4HANA on-premise 2023. Achei ME_PROCESS_PO_CUST na documentação e quero avaliar se ela atende. Pra este exercício, considera só essa candidata. Explica o que preciso confirmar no SE18/SE19 e como escolher o momento da validação. Não gera implementação se a assinatura não estiver confirmada e não confunde isso com uma BAPI ou outro canal de criação.

### Acompanhamento

> Não tenho a assinatura do método aqui. Me diz exatamente o que eu preciso coletar no sistema pra você montar a proposta depois, sem inventar interface ou parâmetro.

### Variação / teste extra

> Depois também quero cobrir criação por interface. Dá pra assumir que o mesmo ponto é chamado? Se não, organiza o que precisa ser verificado por canal.

### O que mostrar

- Avalia a candidata informada, explicita contexto e dependências de método e release.
- Pede assinatura, evidência da chamada, implementação existente e cenário de teste.
- Compatibilidade sem prova fica a confirmar; não gera código com assinatura inventada.

### Conferir

- Não inventar várias BAdIs só para preencher a resposta.
- Não afirmar que o enhancement foi encontrado, implementado ou acionado no cliente.

**Fala sugerida:** O valor aqui é diminuir o caminho de pesquisa e organizar o que precisa ser confirmado antes da implementação.

## 10. DTec Consultant

**Objetivo:** Documentar exatamente o código fornecido | **Tempo:** 4 min | **ID:** `dtec_consultant`

**Preparar:** Usar o fonte final corrigido do Editor em novo chat. Reserva: usar o original e documentar o comportamento existente.

### Prompt inicial

> Monta a documentação técnica desse report pro time conseguir manter depois. É um exemplo de treinamento com pedidos e recebimentos fictícios em memória, sem leitura nem gravação em tabela SAP. Documenta os tipos, os FORMs, o fluxo, o cálculo de saldo, a saída e os testes. Lista os objetos que você realmente analisou. Não documenta ALV, filtro ou autorização como implementados se eles não estiverem nesse código. Segue o programa completo:

### Acompanhamento

> Agora explica em linguagem simples o FORM calcular_saldo e me diz quais mudanças futuras exigiriam revisar essa DTec.

### Variação / teste extra

> Se eu te mandar só um FORM, documenta esse trecho e marca a cobertura como parcial, sem assumir o que os outros blocos fazem.

### O que mostrar

- DTec com estrutura, dependências, parâmetros existentes, fluxo e limitações.
- Cobertura compatível com o que foi enviado; trecho isolado implica cobertura parcial.
- Conferir a resposta estruturada e o PDF técnico no recurso de exportação disponível no app.

### Conferir

- Sem ALV, SELECT ou filtros no fonte, não apresentar essas funções como implementadas.
- Includes ausentes são lacunas, não prova de que um comportamento não existe.

**Fala sugerida:** A documentação acompanha o que existe no código. Isso ajuda na transferência de conhecimento e evita misturar desejo com implementação.

## Material A - programa para Editor e Code Review

Fonte: `ZREPORT_DEMO_SALDO_COM_ERROS.abap`. Dados fictícios em memória; recebimentos já consolidados por pedido e item. Não trata devoluções, estornos ou histórico real SAP. Sintaxe e execução não verificadas no SAP.

```abap
REPORT zreport_demo_saldo_com_erros.

* Dados ficticios. Bugs intencionais. Sem acesso a tabelas SAP.
* ABAP 7.50+; sintaxe e execucao nao validadas no ambiente.
TYPES: BEGIN OF ty_item,
         ebeln TYPE c LENGTH 10,
         ebelp TYPE n LENGTH 5,
         texto TYPE c LENGTH 30,
         pedido TYPE p LENGTH 8 DECIMALS 3,
         recebido TYPE p LENGTH 8 DECIMALS 3,
         saldo TYPE p LENGTH 8 DECIMALS 3,
       END OF ty_item.
TYPES: BEGIN OF ty_recebimento,
         ebeln TYPE c LENGTH 10,
         ebelp TYPE n LENGTH 5,
         quantidade TYPE p LENGTH 8 DECIMALS 3,
       END OF ty_recebimento.
DATA: lt_itens TYPE STANDARD TABLE OF ty_item,
      ls_item TYPE ty_item,
      lt_recebimentos TYPE STANDARD TABLE OF ty_recebimento,
      ls_recebimento TYPE ty_recebimento.

START-OF-SELECTION.
  PERFORM carregar_demo.
  PERFORM calcular_saldo.
  PERFORM exibir_resultado.

FORM carregar_demo.
  CLEAR: lt_itens, lt_recebimentos.
  lt_itens = VALUE #(
    ( ebeln = '4500000100' ebelp = '00010'
      texto = 'Teclado' pedido = 10 )
    ( ebeln = '4500000100' ebelp = '00020'
      texto = 'Mouse' pedido = 20 )
    ( ebeln = '4500000200' ebelp = '00010'
      texto = 'Monitor' pedido = 5 ) ).
  lt_recebimentos = VALUE #(
    ( ebeln = '4500000100' ebelp = '00010' quantidade = 4 )
    ( ebeln = '4500000100' ebelp = '00020' quantidade = 20 ) ).
ENDFORM.

FORM calcular_saldo.
  LOOP AT lt_itens INTO ls_item.
    READ TABLE lt_recebimentos INTO ls_recebimento
      WITH KEY ebeln = ls_item-ebeln.
    ls_item-recebido = ls_recebimento-quantidade.
    ls_item-saldo = ls_item-pedido - ls_item-recebido.
    MODIFY lt_itens FROM ls_item.
  ENDLOOP.
ENDFORM.

FORM exibir_resultado.
  WRITE: / 'Pedido', 15 'Item', 24 'Descricao',
           58 'Pedido', 77 'Recebido', 96 'Saldo'.
  LOOP AT lt_itens INTO ls_item.
    WRITE: / ls_item-ebeln, 15 ls_item-ebelp,
             24 ls_item-texto, 58 ls_item-pedido,
             77 ls_item-recebido, 96 ls_item-saldo.
  ENDLOOP.
ENDFORM.
```

Gabarito após a primeira correção: saldos 6, 0 e 5. Busca precisa considerar pedido e item, com tratamento da ausência de recebimento. O gabarito é deste cenário simplificado, não uma regra SAP standard.

## Material B - programa para Performance Analyzer

Fonte: `ZREPORT_DEMO_PERFORMANCE.abap`. SELECT * e leitura de itens dentro de LOOP são intencionais. Usar para análise estática, não executar na apresentação. Nenhuma medição foi feita.

```abap
REPORT zreport_demo_performance.

* Analise estatica; problemas intencionais. Nao executar na demo.
* Validar release, DDIC e autorizacoes antes de uso no SAP.
TABLES ekko.
SELECT-OPTIONS: s_bukrs FOR ekko-bukrs OBLIGATORY,
                s_bedat FOR ekko-bedat OBLIGATORY.
DATA: lt_ekko TYPE STANDARD TABLE OF ekko,
      ls_ekko TYPE ekko,
      lt_ekpo TYPE STANDARD TABLE OF ekpo,
      ls_ekpo TYPE ekpo.

START-OF-SELECTION.
  SELECT * FROM ekko INTO TABLE lt_ekko
    WHERE bukrs IN s_bukrs AND bedat IN s_bedat.
  IF lt_ekko IS INITIAL.
    WRITE / 'Nenhum pedido encontrado.'.
    RETURN.
  ENDIF.

  LOOP AT lt_ekko INTO ls_ekko.
    CLEAR lt_ekpo.
    SELECT * FROM ekpo INTO TABLE lt_ekpo
      WHERE ebeln = ls_ekko-ebeln.
    LOOP AT lt_ekpo INTO ls_ekpo.
      WRITE: / ls_ekko-ebeln, ls_ekpo-ebelp,
               ls_ekpo-matnr, ls_ekpo-menge, ls_ekpo-meins.
    ENDLOOP.
  ENDLOOP.
```

## Checklist de aceite e reserva

- Por caso, registrar: passou / parcial / falhou; agente; modelo; tempo observado; evidência e ajuste necessário.
- Guardar o primeiro prompt e a resposta para comparação; não esperar reprodução palavra por palavra.
- Saldo após correção: 4500000100/00010 = 6; 4500000100/00020 = 0; 4500000200/00010 = 5.
- Após o filtro do Editor: duas linhas, teclado com saldo 6 e monitor com saldo 5. Saldo zero sai da exibição.
- Para testar saldo mínimo zero, mudar apenas a massa fictícia para recebido maior que pedido.
- Conferir valores e objetos gerados; apresentação bonita não substitui validação funcional.
- Se houver demora ou falha, explicar e abrir o exemplo de reserva. Não anunciar execução SAP ou gravação no drive sem conferir.
- Mensagem para o público: a IA prepara propostas; revisão, autorização, ativação e homologação continuam com a equipe.

## Referências

- Catálogo: `supabase/sql/006_default_agents_seed.sql` e `012_customizing_consultant_agent.sql`.
- Contratos atuais: `src/renderer/src/lib/agentRefinements.ts`, fluxo de EF e parâmetros do app.
- EF usa o modelo DOCX do drive do cliente; comentário antigo da migração 008 sobre modelo embutido não descreve o fluxo atual.
- SAP Help confirma a existência e o escopo geral da candidata ME_PROCESS_PO_CUST: https://help.sap.com/docs/SUPPORT_CONTENT/spmm/3362167798.html
- Assinatura, disponibilidade e ponto de chamada no ambiente do cliente permanecem a confirmar.
