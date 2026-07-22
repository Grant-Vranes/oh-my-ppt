import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  ensureHistoryBaselineSafeMock,
  recordHistoryOperationStrictMock,
  resolveGlobalModelTimeoutsMock,
  resolveModelConfigForTaskMock,
  resolvePageHtmlPathMock,
  runPageBeautifyAgentMock,
  replacePageContentFragmentMock
} = vi.hoisted(() => ({
  ensureHistoryBaselineSafeMock: vi.fn(),
  recordHistoryOperationStrictMock: vi.fn(),
  resolveGlobalModelTimeoutsMock: vi.fn(),
  resolveModelConfigForTaskMock: vi.fn(),
  resolvePageHtmlPathMock: vi.fn(),
  runPageBeautifyAgentMock: vi.fn(),
  replacePageContentFragmentMock: vi.fn()
}))

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('electron-log/main.js', () => ({ default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('../../../src/main/ipc/edit-jobs/page-beautify-agent', () => ({
  runPageBeautifyAgent: runPageBeautifyAgentMock
}))
vi.mock('../../../src/main/ipc/config/model-config-utils', () => ({
  resolveGlobalModelTimeouts: resolveGlobalModelTimeoutsMock,
  resolveModelConfigForTask: resolveModelConfigForTaskMock
}))
vi.mock('../../../src/main/ipc/generation/generation-utils', () => ({
  resolvePageHtmlPath: resolvePageHtmlPathMock
}))
vi.mock('../../../src/main/history/git-history-service', () => ({
  ensureHistoryBaselineSafe: ensureHistoryBaselineSafeMock,
  recordHistoryOperationStrict: recordHistoryOperationStrictMock
}))
vi.mock('../../../src/main/tools/page-writer', () => ({
  replacePageContentFragment: replacePageContentFragmentMock
}))

import {
  extractPageBeautifyContent,
  hasMeaningfulPageBeautifyChange,
  PageBeautifyJobService
} from '../../../src/main/ipc/edit-jobs/page-beautify-job-service'
import { SessionJobCoordinator } from '../../../src/main/ipc/edit-jobs/session-job-coordinator'

describe('page beautify layout review', () => {
  it('requires a re-layout instead of accepting text, animation, and data-attribute churn', () => {
    const original = `
      <section data-page-scaffold="1"><main data-role="content">
        <!-- original note --><div class="grid grid-cols-3 gap-4" data-block-id="content">
          <p data-block-id="summary">完整说明文字</p>
        </div>
      </main></section>
    `
    const superficial = `
      <section data-page-scaffold="1"><main data-role="content">
        <!-- rewritten note --><div class="grid grid-cols-3 gap-4" data-anim="fade-up">
          <p>修正后的说明文字</p>
        </div>
      </main></section>
    `
    const reflowed = `
      <section data-page-scaffold="1"><main data-role="content">
        <div class="grid grid-cols-2 gap-6"><p>摘要说明</p></div>
      </main></section>
    `

    expect(hasMeaningfulPageBeautifyChange(original, superficial)).toBe(false)
    expect(hasMeaningfulPageBeautifyChange(original, reflowed)).toBe(true)
  })
})

describe('PageBeautifyJobService guards', () => {
  const roots: string[] = []

  afterEach(async () => {
    ensureHistoryBaselineSafeMock.mockReset()
    recordHistoryOperationStrictMock.mockReset()
    resolveGlobalModelTimeoutsMock.mockReset()
    resolveModelConfigForTaskMock.mockReset()
    resolvePageHtmlPathMock.mockReset()
    runPageBeautifyAgentMock.mockReset()
    replacePageContentFragmentMock.mockReset()
    for (const root of roots.splice(0)) {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not start when another session write Job holds the lease', async () => {
    const sessionId = 'session-lease'
    const ctx = { sessionRunStates: new Map() }
    const coordinator = new SessionJobCoordinator(ctx as never)
    coordinator.reserve('deck-edit:start', sessionId)
    const service = new PageBeautifyJobService(ctx as never, coordinator)

    await expect(
      service.start({} as Electron.IpcMainInvokeEvent, {
        sessionId,
        selectedPageId: 'page-1'
      })
    ).resolves.toMatchObject({ success: true, alreadyRunning: true })
    expect(resolveModelConfigForTaskMock).not.toHaveBeenCalled()
  })

  it('does not create a Job when the target page disappears', async () => {
    const sessionId = 'session-missing-page'
    const updateSessionStatus = vi.fn(async () => undefined)
    resolveModelConfigForTaskMock.mockResolvedValueOnce({
      id: 'model-1',
      name: 'Model',
      provider: 'provider',
      model: 'model',
      apiKey: 'key',
      baseUrl: 'https://example.com',
      maxTokens: 1000
    })
    resolveGlobalModelTimeoutsMock.mockResolvedValueOnce({ agent: 1000 })
    const ctx = {
      sessionRunStates: new Map(),
      db: {
        getSession: vi.fn(async () => ({ status: 'completed' })),
        getProject: vi.fn(async () => ({ id: 'project-1' })),
        listSessionPages: vi.fn(async () => []),
        getOrCreateSessionStyleSnapshot: vi.fn(async () => ({
          styleId: 'style-1',
          styleKey: 'style',
          styleName: 'Style',
          styleSkill: 'style prompt',
          version: '1'
        })),
        getAllSettings: vi.fn(async () => ({ locale: 'zh' })),
        updateSessionStatus
      }
    }
    const service = new PageBeautifyJobService(
      ctx as never,
      new SessionJobCoordinator(ctx as never)
    )

    await expect(
      service.start({} as Electron.IpcMainInvokeEvent, {
        sessionId,
        selectedPageId: 'page-1'
      })
    ).rejects.toThrow('一键美化的目标页面不存在')

    expect(updateSessionStatus).not.toHaveBeenCalled()
    expect(runPageBeautifyAgentMock).not.toHaveBeenCalled()
  })

  it('exposes only the persisted page content to the beautify Agent', () => {
    const html = `<!doctype html><html><head><title>Injected shell</title></head><body>
      <main class="ppt-page-root" data-ppt-guard-root="1"><div class="ppt-page-fit-scope">
        <div class="ppt-page-content"><section data-page-scaffold="1"><main data-role="content"><h1>Current content</h1></main></section></div>
      </div></main><script id="ppt-page-fit">runtime</script></body></html>`

    const fragment = extractPageBeautifyContent(html)

    expect(fragment).toContain('Current content')
    expect(fragment).toContain('data-page-scaffold')
    expect(fragment).not.toContain('ppt-page-root')
    expect(fragment).not.toContain('ppt-page-fit-scope')
    expect(fragment).not.toContain('ppt-page-fit')
  })

  it('limits the history commit to the current page file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-page-beautify-history-'))
    roots.push(root)
    const targetPagePath = path.join(root, 'page-1.html')
    const originalHtml = `<!doctype html><html><body><main class="ppt-page-root" data-ppt-guard-root="1"><div class="ppt-page-fit-scope"><div class="ppt-page-content"><h1>Target</h1></div></div></main></body></html>`
    const updatedHtml = `<!doctype html><html><body><main class="ppt-page-root" data-ppt-guard-root="1"><div class="ppt-page-fit-scope"><div class="ppt-page-content"><h1>Target</h1><div class="grid"></div></div></div></main></body></html>`
    await writeFile(targetPagePath, originalHtml, 'utf-8')
    ensureHistoryBaselineSafeMock.mockResolvedValueOnce(undefined)
    runPageBeautifyAgentMock.mockResolvedValueOnce('<h1>Target</h1><div class="grid"></div>')
    replacePageContentFragmentMock.mockReturnValueOnce({
      html: updatedHtml,
      content: '<h1>Target</h1><div class="grid"></div>',
      repaired: false
    })
    recordHistoryOperationStrictMock.mockResolvedValueOnce(undefined)
    const sessionId = 'session-history-scope'
    const ctx = {
      sessionRunStates: new Map(),
      db: {
        upsertGenerationPage: vi.fn(async () => undefined),
        upsertSessionPage: vi.fn(async () => undefined),
        updateGenerationRunStatus: vi.fn(async () => undefined),
        updateProjectStatus: vi.fn(async () => undefined),
        updateSessionJobStatus: vi.fn(async () => undefined),
        updateSessionMetadata: vi.fn(async () => undefined),
        updateSessionStatus: vi.fn(async () => undefined)
      },
      createDeckProgressEmitter: vi.fn(() => vi.fn()),
      emitGenerateChunk: vi.fn(),
      getPageSourceUrl: vi.fn(() => 'file://page-1.html')
    }
    const coordinator = new SessionJobCoordinator(ctx as never)
    const reservation = coordinator.reserve('page-beautify:start', sessionId)
    if (reservation.alreadyRunning) throw new Error('Expected a new page-beautify lease')
    const service = new PageBeautifyJobService(ctx as never, coordinator)
    const context = {
      sessionId,
      runId: 'history-scope-run',
      previousSessionStatus: 'active',
      appLocale: 'zh',
      apiKey: 'key',
      model: 'model',
      modelTimeouts: { agent: 1000 },
      provider: 'provider',
      providerBaseUrl: 'https://example.com',
      maxTokens: 1000,
      styleId: 'style-1',
      styleKey: 'style',
      styleName: 'Style',
      styleVersion: '1',
      styleSkillPrompt: 'style prompt',
      slideSize: { id: 'wide-16-9', label: '16:9', width: 1600, height: 900 },
      projectDir: root,
      projectId: 'project-1',
      userMessage: '一键美化第 1 页',
      target: {
        id: 'page-record-1',
        legacyPageId: 'page-1',
        pageId: 'page-1',
        pageNumber: 1,
        title: 'Target',
        htmlPath: targetPagePath
      }
    }

    await (service as any).run({
      sessionId,
      runId: 'history-scope-run',
      lease: reservation.lease,
      context,
      targetPageId: 'page-1',
      targetPageNumber: 1,
      targetPagePath
    })

    expect(recordHistoryOperationStrictMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowedPaths: ['page-1.html'] })
    )
  })

  it('treats an unchanged agent fragment as completed without writing history or touching disk', async () => {    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-page-beautify-unchanged-'))
    roots.push(root)
    const targetPagePath = path.join(root, 'page-1.html')
    const originalHtml = `<!doctype html><html><body><main class="ppt-page-root" data-ppt-guard-root="1"><div class="ppt-page-fit-scope"><div class="ppt-page-content"><h1>Target</h1></div></div></main></body></html>`
    await writeFile(targetPagePath, originalHtml, 'utf-8')
    const originalFragment = extractPageBeautifyContent(originalHtml)
    ensureHistoryBaselineSafeMock.mockResolvedValueOnce(undefined)
    // Agent returns the same fragment it was given.
    runPageBeautifyAgentMock.mockResolvedValueOnce(originalFragment)
    replacePageContentFragmentMock.mockReturnValueOnce({
      html: originalHtml,
      content: originalFragment,
      repaired: false
    })
    const updateGenerationRunStatus = vi.fn(async () => undefined)
    const updateGenerationRunMetadata = vi.fn(async () => undefined)
    const updateSessionStatus = vi.fn(async () => undefined)
    const updateSessionJobStatus = vi.fn(async () => undefined)
    const emit = vi.fn()
    const sessionId = 'session-unchanged'
    const ctx = {
      sessionRunStates: new Map(),
      db: {
        updateGenerationRunStatus,
        updateGenerationRunMetadata,
        updateSessionStatus,
        updateSessionJobStatus
      },
      createDeckProgressEmitter: vi.fn(() => emit),
      emitGenerateChunk: vi.fn()
    }
    const coordinator = new SessionJobCoordinator(ctx as never)
    const reservation = coordinator.reserve('page-beautify:start', sessionId)
    if (reservation.alreadyRunning) throw new Error('Expected a new page-beautify lease')
    const service = new PageBeautifyJobService(ctx as never, coordinator)
    const context = {
      sessionId,
      runId: 'unchanged-run',
      previousSessionStatus: 'completed',
      appLocale: 'zh',
      apiKey: 'key',
      model: 'model',
      modelTimeouts: { agent: 1000 },
      provider: 'provider',
      providerBaseUrl: 'https://example.com',
      maxTokens: 1000,
      styleId: 'style-1',
      styleKey: 'style',
      styleName: 'Style',
      styleVersion: '1',
      styleSkillPrompt: 'style prompt',
      slideSize: { id: 'wide-16-9', label: '16:9', width: 1600, height: 900 },
      projectDir: root,
      projectId: 'project-1',
      userMessage: '一键美化第 1 页',
      target: {
        id: 'page-record-1',
        legacyPageId: 'page-1',
        pageId: 'page-1',
        pageNumber: 1,
        title: 'Target',
        htmlPath: targetPagePath
      }
    }

    await (service as any).run({
      sessionId,
      runId: 'unchanged-run',
      lease: reservation.lease,
      context,
      targetPageId: 'page-1',
      targetPageNumber: 1,
      targetPagePath
    })

    // Run is completed with outcome='unchanged' metadata.
    expect(updateGenerationRunStatus).toHaveBeenCalledWith('unchanged-run', 'completed', null)
    expect(updateGenerationRunMetadata).toHaveBeenCalledWith('unchanged-run', {
      outcome: 'unchanged'
    })
    expect(updateSessionJobStatus).toHaveBeenCalledWith('unchanged-run', 'finished')
    // No history commit, no rollback, no fake page_updated.
    expect(recordHistoryOperationStrictMock).not.toHaveBeenCalled()
    const pageUpdatedCall = emit.mock.calls.find((call) => call[0]?.type === 'page_updated')
    expect(pageUpdatedCall).toBeUndefined()
    const runCompletedCall = emit.mock.calls.find((call) => call[0]?.type === 'run_completed')
    expect(runCompletedCall?.[0]?.payload).toMatchObject({ outcome: 'unchanged' })
    // File on disk is unchanged.
    await expect(readFile(targetPagePath, 'utf-8')).resolves.toBe(originalHtml)
    // No .beautify-tmp leftover.
    await expect(
      readFile(`${targetPagePath}.beautify-tmp`, 'utf-8').catch(() => 'no-tmp')
    ).resolves.toBe('no-tmp')
  })

  it('emits a granular, monotonic progress sequence across every post-agent milestone', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-page-beautify-progress-'))
    roots.push(root)
    const targetPagePath = path.join(root, 'page-1.html')
    const originalHtml = `<!doctype html><html><body><main class="ppt-page-root" data-ppt-guard-root="1"><div class="ppt-page-fit-scope"><div class="ppt-page-content"><h1>Target</h1></div></div></main></body></html>`
    const updatedHtml = `<!doctype html><html><body><main class="ppt-page-root" data-ppt-guard-root="1"><div class="ppt-page-fit-scope"><div class="ppt-page-content"><h1>Target</h1><div class="grid"></div></div></div></main></body></html>`
    await writeFile(targetPagePath, originalHtml, 'utf-8')
    ensureHistoryBaselineSafeMock.mockResolvedValueOnce(undefined)
    runPageBeautifyAgentMock.mockImplementationOnce(async ({ onProgress }) => {
      onProgress?.(0.3)
      onProgress?.(0.6)
      onProgress?.(0.82)
      return '<h1>Target</h1><div class="grid"></div>'
    })
    replacePageContentFragmentMock.mockReturnValueOnce({
      html: updatedHtml,
      content: '<h1>Target</h1><div class="grid"></div>',
      repaired: false
    })
    recordHistoryOperationStrictMock.mockResolvedValueOnce(undefined)
    const emit = vi.fn()
    const sessionId = 'session-progress'
    const ctx = {
      sessionRunStates: new Map(),
      db: {
        upsertGenerationPage: vi.fn(async () => undefined),
        upsertSessionPage: vi.fn(async () => undefined),
        updateGenerationRunStatus: vi.fn(async () => undefined),
        updateProjectStatus: vi.fn(async () => undefined),
        updateSessionJobStatus: vi.fn(async () => undefined),
        updateSessionMetadata: vi.fn(async () => undefined),
        updateSessionStatus: vi.fn(async () => undefined)
      },
      createDeckProgressEmitter: vi.fn(() => emit),
      emitGenerateChunk: vi.fn(),
      getPageSourceUrl: vi.fn(() => 'file://page-1.html')
    }
    const coordinator = new SessionJobCoordinator(ctx as never)
    const reservation = coordinator.reserve('page-beautify:start', sessionId)
    if (reservation.alreadyRunning) throw new Error('Expected a new page-beautify lease')
    const service = new PageBeautifyJobService(ctx as never, coordinator)
    const context = {
      sessionId,
      runId: 'progress-run',
      previousSessionStatus: 'active',
      appLocale: 'zh',
      apiKey: 'key',
      model: 'model',
      modelTimeouts: { agent: 1000 },
      provider: 'provider',
      providerBaseUrl: 'https://example.com',
      maxTokens: 1000,
      styleId: 'style-1',
      styleKey: 'style',
      styleName: 'Style',
      styleVersion: '1',
      styleSkillPrompt: 'style prompt',
      slideSize: { id: 'wide-16-9', label: '16:9', width: 1600, height: 900 },
      projectDir: root,
      projectId: 'project-1',
      userMessage: '一键美化第 1 页',
      target: {
        id: 'page-record-1',
        legacyPageId: 'page-1',
        pageId: 'page-1',
        pageNumber: 1,
        title: 'Target',
        htmlPath: targetPagePath
      }
    }

    await (service as any).run({
      sessionId,
      runId: 'progress-run',
      lease: reservation.lease,
      context,
      targetPageId: 'page-1',
      targetPageNumber: 1,
      targetPagePath
    })

    const progresses = emit.mock.calls
      .map((call) => call[0]?.payload?.progress)
      .filter((value): value is number => typeof value === 'number')
    // The post-agent milestones must each be announced — not just 10 → 100.
    for (const expected of [5, 12, 20, 83, 87, 91, 95, 100]) {
      expect(progresses).toContain(expected)
    }
    // Strictly monotonic: the bar never moves backwards.
    for (let i = 1; i < progresses.length; i += 1) {
      expect(progresses[i]).toBeGreaterThan(progresses[i - 1])
    }
  })

  it('hydrates the unchanged outcome from generation_runs metadata after restart', async () => {
    const sessionId = 'session-hydrate'
    const ctx = {
      sessionRunStates: new Map(),
      db: {
        getLatestSessionJob: vi.fn(async () => ({
          id: 'hydrate-run',
          session_id: sessionId,
          status: 'finished',
          target_page_id: 'page-1',
          target_page_number: 1,
          previous_session_status: 'completed',
          abort_reason: null,
          activated_at: 1000,
          created_at: 1000,
          updated_at: 2000
        })),
        getGenerationRun: vi.fn(async () => ({
          id: 'hydrate-run',
          status: 'completed',
          error: null,
          metadata: JSON.stringify({ outcome: 'unchanged' })
        }))
      }
    }
    const service = new PageBeautifyJobService(ctx as never, new SessionJobCoordinator(ctx as never))

    const state = await service.getState(sessionId)

    expect(state).toMatchObject({
      status: 'completed',
      outcome: 'unchanged',
      targetPageId: 'page-1'
    })
  })

  it('defaults to outcome="changed" when a completed run has no outcome metadata', async () => {
    const sessionId = 'session-hydrate-changed'
    const ctx = {
      sessionRunStates: new Map(),
      db: {
        getLatestSessionJob: vi.fn(async () => ({
          id: 'changed-run',
          session_id: sessionId,
          status: 'finished',
          target_page_id: 'page-2',
          target_page_number: 2,
          previous_session_status: 'completed',
          abort_reason: null,
          activated_at: 1000,
          created_at: 1000,
          updated_at: 2000
        })),
        getGenerationRun: vi.fn(async () => ({
          id: 'changed-run',
          status: 'completed',
          error: null,
          metadata: null
        }))
      }
    }
    const service = new PageBeautifyJobService(ctx as never, new SessionJobCoordinator(ctx as never))

    const state = await service.getState(sessionId)

    expect(state.outcome).toBe('changed')
  })
})
