-- Apply after 039. O Code Review passa a cobrir também performance: o formato
-- (findings ou issues/score) é escolhido pelo pedido do usuário. O Performance
-- Analyzer é desativado, não removido; chats antigos continuam funcionando.

update public.default_agents
set
  name = 'Revisor ABAP',
  description = 'Revisa código ABAP (qualidade, bugs, segurança, clean code) e diagnostica performance (lentidão, timeout, gargalos). O formato da resposta segue o pedido: revisão geral ou diagnóstico de performance.',
  content = content || $review$

---

## Foco de performance (mesmo agente)
Quando o pedido for sobre lentidão, timeout, otimização ou volume de dados, trabalhe como analista de performance ABAP: anti-patterns que causam dump/timeout em produção (`SELECT` em `LOOP`, `SELECT` sem `WHERE` em tabela transacional grande, `SELECT *` desnecessário, `LOOP` aninhado sem tabela `HASHED`/`SORTED`, `MODIFY`/`INSERT` de tabela DB dentro de `LOOP`, `READ TABLE` sem ordenação compatível, `FOR ALL ENTRIES` sem checagem `IS NOT INITIAL`). Nunca introduza SQL dinâmico não validado como otimização. O formato (findings ou issues/score) é definido pelo harness conforme o pedido.
$review$,
  updated_at = now()
where id = 'code_review'
  and content not like '%## Foco de performance (mesmo agente)%';

update public.default_agents
set enabled = false, updated_at = now()
where id = 'performance_analyzer';
