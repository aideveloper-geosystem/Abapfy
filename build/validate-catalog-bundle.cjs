module.exports = async function validateCatalog(context) {
  if (context.electronPlatformName !== 'win32') return
  const { pathToFileURL } = require('node:url')
  const path = require('node:path')
  const { validateBundle } = await import(pathToFileURL(path.join(context.packager.projectDir, 'scripts/catalog-bundle.mjs')).href)
  await validateBundle(path.join(context.packager.projectDir, 'resources/local-search'))
  console.log('[Abapfy] Catálogo, índice, modelo e runtime validados para distribuição.')
}
