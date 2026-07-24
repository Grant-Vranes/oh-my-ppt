import fs from 'fs'
import path from 'path'

const dynamicAllowedRoots = new Set<string>()

export const normalizeExistingPath = (filePath: string): string => {
  const resolved = path.resolve(filePath)
  try {
    return fs.realpathSync(resolved)
  } catch {
    return resolved
  }
}

export function allowLocalAssetRoot(rootPath: string): void {
  if (!rootPath.trim()) return
  dynamicAllowedRoots.add(normalizeExistingPath(rootPath))
}

export function getDynamicAllowedLocalAssetRoots(): string[] {
  return [...dynamicAllowedRoots]
}
