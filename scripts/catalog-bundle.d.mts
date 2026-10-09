import type { SapCatalogEntry } from '../src/shared/localFeatures'
export interface BundleManifest { version: string; algorithm: string; dimensions: number; records: number; modelSha256: string; files: Record<string, { sha256: string; bytes: number }> }
export interface LoadedBundle { manifest: BundleManifest; catalog: SapCatalogEntry[]; vectors: number[][]; embeddingExecutable: string; embeddingModel: string }
export function loadBundle(root: string): Promise<LoadedBundle>
export function validateBundle(root: string, verifyHashes?: boolean): Promise<{ manifest: BundleManifest; catalog: SapCatalogEntry[] }>
export function publishBundle(args: { catalogPath: string; indexPath: string; modelPath: string; executablePath: string; output: string; version: string; legalDirectory?: string }): Promise<{ directory: string; version: string; records: number }>
export function hashFile(file: string): Promise<string>
export const ALGORITHM: string
