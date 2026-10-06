# GitHub e release na organização da empresa

Origem: `esc4n0rx/abapfyv2`. Destino: `aideveloper-geosystem/Abapfy`.

A migração mantém o histórico Git de master, incluindo os 29 commits e as 20 tags existentes, sem reescrever seus objetos. Um novo commit de versão 1.0.1 inclui as alterações locais de interface, documentos, SAP, painel administrativo e os procedimentos de migração.

As tags antigas são importadas em um único push. A tag v1.0.1 é publicada separadamente, depois da configuração dos secrets, para gerar a nova release. Instaladores das releases antigas permanecem disponíveis no repositório antigo; essa cópia não recria issues, pull requests ou metadados de releases históricas.

## Build e distribuição

- `electron-builder.yml` aponta publicação e atualizações para o destino.
- Secrets de Actions `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` contêm a URL e a chave pública do novo Supabase. Nenhuma chave administrativa é entregue à build desktop.
- O workflow verifica tipos e testes antes de gerar instaladores Windows, macOS universal e Linux.
- macOS inclui DMG e ZIP; ZIP é necessário para o fluxo de atualização desse sistema.
- A release só é publicada depois que os três builds terminam e os manifests e instaladores exigidos estão presentes.
- Uma instalação antiga ainda contém o canal de atualização antigo. Instalar a 1.0.1 publicada no destino passa o aplicativo ao novo canal. Nenhuma release de transição é publicada na origem por este procedimento.

## Preservação local

Credenciais, backups de banco/Storage, configurações de ambiente e bundles Git ficam ignorados pelo Git. O histórico Git independente encontrado em Admin foi preservado em bundle e em seu diretório Git no backup local; o código do painel foi incluído como arquivos normais no repositório principal, sem gitlink ou dependência de checkout externo.

SMTP e recuperação por e-mail continuam adiados por escolha do usuário. Login e operação real devem ser testados com a nova instalação antes de desativar a instância Supabase antiga.

Referências: [duplicar repositório](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository), [eventos de Actions e importação de tags](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [atualização Electron](https://www.electron.build/auto-update.html).
