import { archiveCatalog } from './catalog-archive.mjs'
console.log(JSON.stringify(await archiveCatalog(process.argv[2] || 'resources/local-search')))
