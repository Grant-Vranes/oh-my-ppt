import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const removedStylePaths = [
  'src/main/utils/style-import.ts',
  'src/main/utils/style-image-import.ts',
  'src/main/utils/style-pptx-import.ts',
  'src/main/utils/style-preview-generator.ts',
  'src/main/utils/style-skills.ts',
  'src/main/ipc/config/style-handlers.ts',
  'src/main/ipc/config/style-preview-handlers.ts'
]

const canonicalStyleFiles = [
  'src/main/styles/catalog.ts',
  'src/main/styles/handlers.ts',
  'src/main/styles/import/file.ts',
  'src/main/styles/import/image.ts',
  'src/main/styles/import/pptx.ts',
  'src/main/styles/preview/generator.ts',
  'src/main/styles/preview/handlers.ts'
]

const readTypeScriptSources = (directory: string): Array<{ filePath: string; source: string }> => {
  const sources: Array<{ filePath: string; source: string }> = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      sources.push(...readTypeScriptSources(filePath))
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      sources.push({ filePath, source: fs.readFileSync(filePath, 'utf8') })
    }
  }
  return sources
}

describe('styles domain boundaries', () => {
  it('keeps the style catalog, imports, preview, and IPC registrations in styles/', () => {
    expect(canonicalStyleFiles.filter((filePath) => !fs.existsSync(filePath))).toEqual([])
  })

  it('removes legacy style paths after every caller migrates', () => {
    expect(removedStylePaths.filter((filePath) => fs.existsSync(filePath))).toEqual([])
  })

  it('does not let application code import an old style path', () => {
    const removedFragments = [
      'utils/style-import',
      'utils/style-image-import',
      'utils/style-pptx-import',
      'utils/style-preview-generator',
      'utils/style-skills',
      'config/style-handlers',
      'config/style-preview-handlers'
    ]
    for (const { filePath, source } of readTypeScriptSources('src/main')) {
      for (const fragment of removedFragments) {
        expect(source, `${filePath}: ${fragment}`).not.toContain(fragment)
      }
    }
  })
})
