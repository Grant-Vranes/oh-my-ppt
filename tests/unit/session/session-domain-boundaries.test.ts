import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const canonicalSessionFiles = [
  'src/main/session/handlers.ts',
  'src/main/session/import-handlers.ts',
  'src/main/session/save-as-new.ts',
  'src/main/session/page-assets.ts',
  'src/main/session/page-html-builders.ts',
  'src/main/session/page-management-handlers.ts',
  'src/main/session/page-management-service.ts',
  'src/main/session/page-merge-concurrency.ts',
  'src/main/session/page-merge-handlers.ts',
  'src/main/session/page-merge-rewriter.ts',
  'src/main/session/page-merge-service.ts',
  'src/main/session/page-outline-utils.ts',
  'src/main/session/presentation-handlers.ts',
  'src/main/session/preview-handlers.ts',
  'src/main/session/runtime-assets.ts',
  'src/main/session/template-builder.ts'
]

const removedSessionPaths = [
  'src/main/ipc/session/session-handlers.ts',
  'src/main/ipc/session/session-import-handlers.ts',
  'src/main/ipc/session/session-save-as-new.ts',
  'src/main/ipc/session/page-assets.ts',
  'src/main/ipc/session/page-html-builders.ts',
  'src/main/ipc/session/page-management-handlers.ts',
  'src/main/ipc/session/page-management-service.ts',
  'src/main/ipc/session/page-merge-concurrency.ts',
  'src/main/ipc/session/page-merge-handlers.ts',
  'src/main/ipc/session/page-merge-rewriter.ts',
  'src/main/ipc/session/page-merge-service.ts',
  'src/main/ipc/session/page-outline-utils.ts',
  'src/main/ipc/session/presentation-handlers.ts',
  'src/main/ipc/session/preview-handlers.ts',
  'src/main/ipc/session/runtime-assets.ts',
  'src/main/ipc/session/template-builder.ts'
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

describe('session domain boundaries', () => {
  it('owns session handlers, page management, merge, preview, and presentation in session/', () => {
    expect(canonicalSessionFiles.filter((filePath) => !fs.existsSync(filePath))).toEqual([])
  })

  it('removes legacy IPC session paths after every caller migrates', () => {
    expect(removedSessionPaths.filter((filePath) => fs.existsSync(filePath))).toEqual([])
  })

  it('does not let application code import an old IPC session path', () => {
    for (const { filePath, source } of readTypeScriptSources('src/main')) {
      expect(source, filePath).not.toContain('ipc/session')
    }
  })
})
