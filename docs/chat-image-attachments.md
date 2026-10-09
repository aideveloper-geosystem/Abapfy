# Imagens no chat

Cole uma captura com Ctrl+V no campo de mensagem ou selecione PNG, JPEG ou WebP no menu de anexos. O compositor mostra a prévia, o nome e a opção de remover. Texto colado normalmente continua funcionando; uma imagem inválida gera erro no anexo.

Cada mensagem aceita até três imagens. Arquivos de até 15 MiB são decodificados no navegador e, se necessário, reduzidos para 3072 px no maior lado e aproximadamente 2 MiB. O envio usa blocos multimodais de cada provedor, incluindo a contagem de contexto Claude e as consultas MCP. Imagens da captura SAP permanecem independentes e podem acompanhar os anexos.

As imagens ficam em memória na sessão e aparecem também na mensagem enviada. O Supabase conserva o texto e os nomes dos anexos, sem armazenar os bytes. Reabrir o aplicativo não recupera as imagens: anexe novamente se precisar de uma nova análise visual. A compactação conserva as imagens dos turnos recentes e resume o conteúdo textual dos turnos antigos e suas respostas.

Validação: testes do clipboard, transporte multimodal Claude/OpenAI/Gemini e preservação de imagens recentes; teste em Chrome headless com DataTransfer, FileReader, Image e canvas reais. A suíte completa passou com 95 testes. Não foi feita chamada autenticada a um modelo para validar a interpretação de uma captura.
