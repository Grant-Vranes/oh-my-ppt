import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { IpcContext } from '../../../src/main/ipc/context'
import { persistManagedPages, type ManagedPage } from '../../../src/main/session/page-management-service'

const mocks = vi.hoisted(() => ({
  ensureSessionRuntimeCompatible: vi.fn(),
  buildProjectIndexHtml: vi.fn(() => '<html><body>new index</body></html>'),
  carryIndexTransitionConfig: vi.fn((_previous: string, next: string) => next)
}))

vi.mock('../../../src/main/session/runtime-assets', () => ({
  ensureSessionRuntimeCompatible: mocks.ensureSessionRuntimeCompatible
}))

vi.mock('../../../src/main/session/template-builder', () => ({
  buildProjectIndexHtml: mocks.buildProjectIndexHtml
}))

vi.mock('../../../src/main/session/index-transition', () => ({
  carryIndexTransitionConfig: mocks.carryIndexTransitionConfig
}))

const createdDirectories: string[] = []

const createProjectDirectory = async (): Promise<string> => {
  const projectDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ohmyppt-page-management-'))
  createdDirectories.push(projectDir)
  return projectDir
}

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true, force: true })))
  vi.clearAllMocks()
})

describe('persistManagedPages', () => {
  it('restores page HTML when page-order persistence fails', async () => {
    const projectDir = await createProjectDirectory()
    const firstPath = path.join(projectDir, 'page-first.html')
    const secondPath = path.join(projectDir, 'page-second.html')
    const firstHtml = '<html><head></head><body><main class="ppt-page-root" data-ppt-guard-root="1"></main></body></html>'
    const secondHtml = '<html><head></head><body><main class="ppt-page-root" data-ppt-guard-root="1"></main></body></html>'
    await Promise.all([
      fs.promises.writeFile(firstPath, firstHtml, 'utf-8'),
      fs.promises.writeFile(secondPath, secondHtml, 'utf-8')
    ])
    const context = {
      db: {
        getSession: vi.fn().mockResolvedValue({
          slideSizeId: 'wide-16-9',
          slideWidth: 1600,
          slideHeight: 900,
          metadata: '{}'
        }),
        persistSessionPageState: vi.fn().mockRejectedValue(new Error('database unavailable'))
      }
    } as unknown as IpcContext
    const pages: ManagedPage[] = [
      { id: 'second', pageId: 'page-second', pageNumber: 2, title: 'Second', htmlPath: secondPath },
      { id: 'first', pageId: 'page-first', pageNumber: 1, title: 'First', htmlPath: firstPath }
    ]

    await expect(
      persistManagedPages(context, {
        sessionId: 'session-1',
        projectDir,
        indexPath: path.join(projectDir, 'index.html'),
        deckTitle: 'Deck',
        pages,
        operation: 'reorder',
        prompt: 'reorder'
      })
    ).rejects.toThrow('database unavailable')

    await expect(fs.promises.readFile(firstPath, 'utf-8')).resolves.toBe(firstHtml)
    await expect(fs.promises.readFile(secondPath, 'utf-8')).resolves.toBe(secondHtml)
    await expect(fs.promises.access(path.join(projectDir, 'index.html.tmp'))).rejects.toThrow()
  })
})
