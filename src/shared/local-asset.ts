export function localAssetUrl(filePath: string): string {
  return `local-asset://${encodeURIComponent(filePath)}`
}
