import { DEFAULT_COMPACTION, type CompactionSettings, type ContextSnapshot } from './compaction'

export interface LocalFeatureSettings {
  compaction: CompactionSettings
  embeddingExecutable: string
  embeddingModel: string
  embeddingBackend: 'cpu' | 'vulkan'
  embeddingVulkanExecutable: string
}

export const DEFAULT_LOCAL_FEATURES: LocalFeatureSettings = {
  compaction: DEFAULT_COMPACTION,
  embeddingExecutable: '',
  embeddingModel: '',
  embeddingBackend: 'cpu',
  embeddingVulkanExecutable: ''
}

export interface LocalFeatureStatus {
  settings: LocalFeatureSettings
  embeddingReady: boolean
  catalogCount: number
  indexedCount: number
  indexing: boolean
  indexError: string | null
  embeddingRuntime: string | null
}

export interface SapCatalogEntry {
  id: string
  type: 'badi' | 'bapi'
  name: string
  description: string
  package: string
  interface: string
  program: string
  relatedObjects: string[]
  source: string
}

export interface LocalSearchResult {
  mode: 'disabled' | 'hybrid' | 'lexical'
  query?: string
  results: Array<SapCatalogEntry & { score: number }>
  warning?: string
}

export interface LocalSearchActivity {
  query: string
  result: LocalSearchResult
}

export interface LocalFeaturesApi {
  setCompaction: (userId: string, settings: CompactionSettings) => Promise<LocalFeatureStatus>
  loadContext: (userId: string, chatId: string) => Promise<ContextSnapshot | null>
  saveContext: (userId: string, chatId: string, snapshot: ContextSnapshot) => Promise<void>
  status: (userId: string) => Promise<LocalFeatureStatus>
  windowsDictationSupported: boolean
  openWindowsDictation: () => Promise<void>
  setEmbeddingBackend: (
    userId: string,
    backend: 'cpu' | 'vulkan',
    token: string
  ) => Promise<LocalFeatureStatus>
  pickRuntimeFile: (
    userId: string,
    field: 'embeddingExecutable' | 'embeddingModel' | 'embeddingVulkanExecutable',
    token: string
  ) => Promise<LocalFeatureStatus>
  importCatalog: (userId: string, token: string) => Promise<LocalFeatureStatus>
  indexCatalog: (userId: string, token: string) => Promise<LocalFeatureStatus>
  publishCatalog: (
    userId: string,
    token: string
  ) => Promise<{
    directory: string
    version: string
    records: number
    archive: string
    sha256: string
  } | null>
  cancelIndex: (userId: string, token: string) => Promise<void>
  cancel: (userId: string) => Promise<void>
  search: (userId: string, query: string) => Promise<LocalSearchResult>
}
