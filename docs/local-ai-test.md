# Catálogo SAP distribuído e ditado Windows

Usuários recebem a busca pronta junto com a atualização Windows: catálogo, índice, modelo EmbeddingGemma 2 e runtime CPU. A busca é automática no Enhancement Finder. Não há configuração de embeddings ou áudio em Features; essa aba mantém somente a compactação de contexto. O pacote não usa Supabase para armazenar ou consultar os vetores.

## Administrador

Em Configurações → Embeddings (visível somente para ADMIN/MASTER), ou pela seção Administração, o responsável pode importar BASE_BADI, escolher o runtime/modelo de preparação, indexar (CPU ou Vulkan) e preparar o pacote da atualização. Operações administrativas verificam a identidade e o papel no Supabase no processo principal. O runtime CPU selecionado é o distribuído aos clientes; o runtime Vulkan pode acelerar a indexação do administrador.

A preparação exige índice completo e compatível com o modelo. Produz uma pasta `local-search`, um `catalog-local-search.zip` e seu SHA-256. Preserva uma cópia do pacote anterior ao substituir uma publicação. A operação prepara os arquivos: a publicação do instalador segue o fluxo de releases.

Para trabalhar no computador de build:

- `node scripts/setup-local-ai.mjs`: prepara os runtimes/modelo de embeddings do administrador. Não baixa modelo de áudio.
- `pnpm catalog:prepare`: reaproveita a base e o índice locais já completos e gera `resources/local-search`.
- `pnpm catalog:archive`: gera `resources/catalog-local-search.zip` e imprime seu SHA-256.

O computador de preparação precisa do Visual Studio C++ com os redistribuíveis x64 (ou definir `ABAPFY_VC_REDIST_DIR` para a pasta oficial `Microsoft.VC143.CRT`). O script copia essas DLLs para o runtime distribuído; os usuários não precisam instalar o Visual C++ manualmente. Um runtime sem as DLLs exigidas impede a preparação.

Esses comandos de build pressupõem acesso aos arquivos locais de preparação. Os usuários finais não executam nenhum deles.

## Atualização e CI

O instalador Windows inclui `resources/local-search` como recurso externo ao ASAR. O hook de empacotamento verifica catálogo, dimensões, modelo, DLLs, licenças e checksums; pacote ausente ou inválido impede gerar o instalador. O índice é float32 little-endian (768 dimensões), sem caminhos ou datas da máquina do administrador. Os arquivos grandes são ignorados pelo Git.

Para a release automática no GitHub:

1. O responsável pela release publica `catalog-local-search.zip` como asset de uma release de dados do mesmo repositório, com tag fora do padrão `v*.*.*` (por exemplo, `catalog-AAAA-MM-DD`). A publicação dessa release de dados é uma ação administrativa separada, não executada pelo botão local.
2. Configura as repository variables `CATALOG_BUNDLE_TAG` (tag da release de dados) e `CATALOG_BUNDLE_SHA256` (checksum mostrado na preparação).
3. O workflow baixa o asset autenticado, verifica o checksum e os caminhos do ZIP, valida o conteúdo e o inclui no instalador da próxima versão.

Nenhuma release online é publicada pelos testes ou pelo comando de preparação. A validação de download/extract da CI deve ser conferida na primeira release com essas variables configuradas.

O pacote inicial contém 11.685 objetos e reutiliza o índice já calculado. O arquivo compactado preparado neste computador tem cerca de 321 MiB. As próximas atualizações Windows passam a incluir esse volume adicional.

## Ditado

O botão de microfone foca a mensagem e abre o painel nativo com Win + H. O usuário também pode pressionar o atalho diretamente. O aplicativo não grava o microfone nem executa transcrição local. O helper oculto valida que o Abapfy está em primeiro plano antes de enviar o atalho. O painel e a seleção do microfone são gerenciados pelo Windows; o ditado usa internet, conforme a [documentação Microsoft](https://support.microsoft.com/pt-br/accessibility/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc).

O helper foi compilado no Windows e sua estrutura INPUT x64 validada sem enviar teclas. A abertura do painel e a qualidade do ditado precisam ser conferidas no aplicativo com o microfone do usuário.

## Verificação

`node --test tests/*.test.mjs` verifica integridade, portabilidade, permissões administrativas, entrada Windows e regressões. `node tests/bundled-catalog-native-smoke.mjs` consulta o catálogo real com um perfil novo, sem importar/indexar/configurar runtimes, inclusive ignorando caminhos inválidos de configurações antigas. O teste encontrou ME_PROCESS_PO_CUST e BAPI_PO_CREATE1 por busca híbrida.
