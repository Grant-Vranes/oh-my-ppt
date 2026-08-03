import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const readTypeScriptSources = (directory: string): Array<{ filePath: string; source: string }> => {
  const sources: Array<{ filePath: string; source: string }> = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      sources.push(...readTypeScriptSources(filePath))
      continue
    }
    if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      sources.push({ filePath, source: fs.readFileSync(filePath, 'utf8') })
    }
  }
  return sources
}

const importPathPattern = (pathFragment: string): RegExp =>
  new RegExp(`(?:from|import)\\s*['\"][^'\"]*${pathFragment}`)

const extractImportPaths = (source: string): string[] =>
  Array.from(source.matchAll(/(?:from|import)\s*['\"]([^'\"]+)['\"]/g)).map((match) => match[1])

describe('Runtime dependency boundaries', () => {
  it('keeps Agent Runtime independent from IPC', () => {
    for (const { filePath, source } of readTypeScriptSources('src/main/agent-runtime')) {
      expect(source, filePath).not.toMatch(importPathPattern('/ipc/'))
    }
  })

  it('keeps Agent Runtime independent from the database implementation', () => {
    for (const { filePath, source } of readTypeScriptSources('src/main/agent-runtime')) {
      expect(source, filePath).not.toMatch(importPathPattern('/db/'))
    }
  })

  it('keeps presentation and product skills independent from Runtime and IPC', () => {
    for (const directory of ['src/main/presentation', 'src/main/product-skills']) {
      for (const { filePath, source } of readTypeScriptSources(directory)) {
        expect(source, filePath).not.toMatch(importPathPattern('/agent-runtime'))
        expect(source, filePath).not.toMatch(importPathPattern('/ipc/'))
      }
    }
  })

  it('makes IPC use only Agent Runtime public entries', () => {
    const allowedEntries = new Set([
      'agent-runtime',
      'agent-runtime/agent',
      'agent-runtime/model',
      'agent-runtime/prompt',
      'agent-runtime/provider/image',
      'agent-runtime/provider/vision',
      'agent-runtime/skills',
      'agent-runtime/tools'
    ])

    for (const { filePath, source } of readTypeScriptSources('src/main/ipc')) {
      for (const importPath of extractImportPaths(source)) {
        const entryStart = importPath.indexOf('agent-runtime')
        if (entryStart === -1) continue
        expect(allowedEntries, `${filePath}: ${importPath}`).toContain(
          importPath.slice(entryStart)
        )
      }
    }
  })

  it('keeps the Thinking compatibility facade model-only', () => {
    const source = fs.readFileSync('src/main/agent.ts', 'utf8')

    expect(source).toContain("export { resolveModel } from './agent-runtime/model/resolve'")
    expect(source).not.toContain("from './tools'")
    expect(source).not.toContain("from './agent-runtime/agent'")
    expect(source).not.toContain("from './agent-runtime/prompt'")
    expect(source).not.toContain("from './agent-runtime/skills'")
  })

  it('keeps ResourceLock internal to JobCoordinator', () => {
    const source = fs.readFileSync('src/main/agent-runtime/index.ts', 'utf8')

    expect(source).not.toContain("export * from './lock/resource-lock'")
  })

  it('removes obsolete non-Thinking Runtime facades after their callers migrate', () => {
    const removedPaths = [
      'src/main/model-runtime.ts',
      'src/main/model-usage.ts',
      'src/main/openai-model-options.ts',
      'src/main/openai-responses-compat.ts',
      'src/main/utils/vision-model.ts',
      'src/main/utils/design-contract.ts',
      'src/main/image-generation/providers.ts',
      'src/main/image-generation/types.ts',
      'src/main/tools/index.ts',
      'src/main/skills/index.ts'
    ]

    expect(removedPaths.filter((filePath) => fs.existsSync(filePath))).toEqual([])
  })

  it('keeps IPC domains named by their product responsibility', () => {
    const expectedPaths = [
      'src/main/ipc/runtime/context.ts',
      'src/main/ipc/runtime/event-bridge.ts',
      'src/main/ipc/runtime/event-contract.ts',
      'src/main/generation/handlers.ts',
      'src/main/generation/agent-runner.ts',
      'src/main/session/template-builder.ts',
      'src/main/element-editor/handlers.ts'
    ]
    const removedDirectories = [
      'src/main/ipc/engine',
      'src/main/ipc/editor',
      'src/main/ipc/config',
      'src/main/ipc/edit-jobs',
      'src/main/ipc/element-editor',
      'src/main/ipc/generation',
      'src/main/ipc/history',
      'src/main/ipc/html-editor',
      'src/main/ipc/image-generation',
      'src/main/ipc/io',
      'src/main/ipc/session',
      'src/main/ipc/speech',
      'src/main/ipc/templates'
    ]
    const ipcIndex = fs.readFileSync('src/main/ipc/index.ts', 'utf8')

    expect(expectedPaths.filter((filePath) => !fs.existsSync(filePath))).toEqual([])
    expect(removedDirectories.filter((directory) => fs.existsSync(directory))).toEqual([])
    expect(ipcIndex).toContain("from '../generation/handlers'")
    expect(ipcIndex).toContain("from '../element-editor'")
    expect(ipcIndex).toContain("from './runtime/event-bridge'")
  })

  it('keeps presentation, generation, and Agent-run context types out of Agent tool adapter types', () => {
    const source = fs.readFileSync('src/main/agent-runtime/tools/types.ts', 'utf8')

    expect(source).not.toContain("from '@shared/generation'")
    expect(source).not.toContain('interface DesignContract')
    expect(source).not.toContain('interface OutlineItem')
    expect(source).not.toContain("type DeckEditScope = 'page' | 'deck' | 'presentation-container'")
    expect(source).not.toContain('export type { DeckEditScope, DesignContract, OutlineItem }')
    expect(source).not.toContain('interface SessionDeckGenerationContext')
  })

  it('keeps presentation filesystem capabilities out of LangChain tool adapters', () => {
    for (const filePath of [
      'src/main/agent-runtime/tools/page-writer.ts',
      'src/main/agent-runtime/tools/deck-tools.ts'
    ]) {
      const source = fs.readFileSync(filePath, 'utf8')
      expect(source, filePath).not.toMatch(/from ['"]fs['"]|\bfs\./)
      expect(source, filePath).not.toContain('serializedWrite(')
    }
  })
})
