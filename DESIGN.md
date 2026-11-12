# Abapfy Design System — Graphite

## Direção

O Abapfy usa uma linguagem visual sóbria, inspirada em apps desktop de macOS e no app Claude
Code: sidebar à esquerda, área de trabalho no centro e painel de contexto à direita. A experiência
é densa e orientada a trabalho: navegação estável, hierarquia por camadas de superfície, bordas
finas, cantos arredondados e animações curtas. O tema escuro é o padrão.

## Temas

- `abapfy-dark` — **Escuro**, padrão. Grafite em camadas (`#1c1c1e` a `#3a3a3c`) com azul de sistema.
- `abapfy-light` — **Claro**. Cinza suave, cartões brancos e o mesmo azul.

Os dois temas definem exatamente os mesmos tokens (há teste para isso). Todos os componentes
devem consumir somente os tokens de `src/renderer/src/styles/theme.css`; os valores por tema ficam
em `src/renderer/src/lib/themes.ts`. Não use cor fixa para texto, fundo ou borda. Cores fixas são
permitidas apenas como valores de configuração de uma label/coluna e sempre com contraste garantido
pela superfície. Temas antigos (SAP Horizon e Quartz) são convertidos para o equivalente claro ou escuro.

## Tokens essenciais

- Ação principal: `--color-primary`, `--color-primary-hover`, `--color-on-primary`.
- Texto: `--color-ink`, `--color-ink-muted`, `--color-ink-subtle`, `--color-ink-tertiary`.
- Superfícies: `--color-canvas`, `--color-surface-1` até `--color-surface-4`.
- Chrome do app: `--color-sidebar`, `--color-sidebar-ink`, `--color-panel`.
- Interação: `--color-hover`, `--color-selected`, `--color-accent-soft`.
- Divisores: `--color-hairline`, `--color-hairline-strong`.
- Estados: `--color-semantic-success`, `--color-semantic-warning`,
  `--color-semantic-danger`, `--color-semantic-info`.
- Elevação: `--shadow-card`, `--shadow-popover`, `--shadow-modal`.
- Movimento: `--ease-out`, `--duration-fast` (120ms), `--duration-base` (200ms), `--duration-slow` (320ms).
- Medidas: `--sidebar-width`, `--context-panel-width`, `--titlebar-height`.

## Tipografia e densidade

- Pilha de sistema em `--font-text` e `--font-display` (San Francisco no macOS, Segoe UI Variable no Windows).
- Corpo padrão: 14px; metadados: 10–12px; títulos de página: 24px com espaçamento levemente negativo.
- Controles têm 32–40px no desktop e mínimo de 44px em interfaces touch.
- Títulos devem descrever o objeto ou a ação, evitando slogans dentro da área operacional.

## Layout

- Sidebar fixa à esquerda (`--color-sidebar`): workspace, navegação principal (Nova sessão, Pesquisa,
  Projetos, Clientes, Fluxos), "Mais", sessões agrupadas por cliente e menu do perfil na base.
- Área de trabalho usa `--color-canvas`; no chat, o painel de contexto acopla à direita (`--color-panel`).
- Cards, modais e painéis usam `--color-surface-1` e borda hairline; `--color-surface-2` diferencia
  cabeçalhos, filtros e grupos internos.
- Azul de sistema identifica foco, links e ação principal; seleção em listas usa `--color-selected`
  e estados ativos suaves usam `--color-accent-soft`. Não preencher grandes áreas com azul.
- Listas e tabelas devem priorizar alinhamento, escaneabilidade e cabeçalhos persistentes.

## Componentes

### Botões

- Primário: fundo `--color-primary`, texto `--color-on-primary`, raio `--radius-md`.
- Secundário: superfície 2, borda hairline e texto muted.
- Perigoso: texto/fundo derivados de `--color-semantic-danger`.
- Toda ação precisa de estado hover, disabled e `:focus-visible`.

### Formulários

- Labels ficam acima do campo.
- Inputs usam superfície 1 ou 2 e borda strong; foco usa primary-focus.
- Erros ficam próximos do campo e usam danger sem depender apenas da cor.
- Valores SAP devem ser legíveis, com release e descrição; não usar identificadores internos.

### Modais e painéis

- Cabeçalho fixo com título, contexto e fechar.
- Conteúdo rolável; ações ficam no fim do fluxo.
- Confirmações são obrigatórias para exclusões, escrita SAP e conteúdo gerado por agente que
  altere cards, subtarefas ou artefatos.

## IA, evidências e confiança

- Mostre agente, modelo, skills, MCPs e ambiente SAP usados.
- Conteúdo da base de conhecimento deve trazer documento, versão, atualização, trecho e confiança.
- Texto carregado pelo usuário é evidência, nunca instrução de sistema.
- Se ambiente, Support Package ou add-on não estiver definido, apresente `A CONFIRMAR`.

## Acessibilidade

- `:focus-visible` deve permanecer evidente em todos os temas.
- Não comunicar status somente por cor; use ícone ou texto.
- Respeitar contraste WCAG nos dois temas; texto secundário nunca abaixo de `--color-ink-tertiary` sobre a superfície.
- Animações respeitam `prefers-reduced-motion` (regra global em `global.css`).
- Não desabilitar zoom, seleção de conteúdo ou navegação por teclado em áreas de leitura.

## Responsividade

- Abaixo de 1050px, Kanban e tabelas mantêm largura útil com rolagem horizontal.
- Abaixo de 900px, formulários de quatro colunas passam para duas.
- Abaixo de 720px, barras de upload e ações quebram em linhas sem esconder funções.

## Checklist de entrega visual

1. Validar o tema escuro e o tema claro.
2. Verificar estados hover, focus, disabled, loading, empty e error.
3. Testar textos longos, nomes de arquivos e releases SAP extensas.
4. Confirmar que nenhuma superfície ficou com cor fixa incompatível com light mode.
5. Executar typecheck e build antes do handoff.
