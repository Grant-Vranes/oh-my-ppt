import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const canonicalConfigFiles = [
  'src/main/config/settings-handlers.ts',
  'src/main/config/image-model-handlers.ts',
  'src/main/config/locale-utils.ts',
  'src/main/config/model-config-utils.ts',
  'src/main/presentation/fonts/handlers.ts'
]

const removedConfigPaths = [
  'src/main/ipc/config/settings-handlers.ts',
  'src/main/ipc/config/image-model-handlers.ts',
  'src/main/ipc/config/locale-utils.ts',
  'src/main/ipc/config/model-config-utils.ts',
  'src/main/ipc/config/font-handlers.ts'
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

describe('config domain boundaries', () => {
  it('owns app configuration and font IPC registrations outside ipc/', () => {
    expect(canonicalConfigFiles.filter((filePath) => !fs.existsSync(filePath))).toEqual([])
  })

  it('removes legacy IPC config paths after every caller migrates', () => {
    expect(removedConfigPaths.filter((filePath) => fs.existsSync(filePath))).toEqual([])
  })

  it('does not let application code import an old config path', () => {
    for (const { filePath, source } of readTypeScriptSources('src/main')) {
      expect(source, filePath).not.toContain('ipc/config')
    }
  })

  it('registers canonical config and font handlers from IPC setup', () => {
    const setup = fs.readFileSync('src/main/ipc/index.ts', 'utf8')

    expect(setup).toContain("from '../config/settings-handlers'")
    expect(setup).toContain("from '../config/image-model-handlers'")
    expect(setup).toContain("from '../presentation/fonts/handlers'")
    expect(setup).not.toContain("from './config/settings-handlers'")
    expect(setup).not.toContain("from './config/image-model-handlers'")
    expect(setup).not.toContain("from './config/font-handlers'")
  })
})
