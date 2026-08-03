import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createDeepAgentMock, resolveModelMock, attachProductSkillsBackendMock } = vi.hoisted(() => ({
  createDeepAgentMock: vi.fn(),
  resolveModelMock: vi.fn(() => ({ provider: 'test' })),
  attachProductSkillsBackendMock: vi.fn(() => ({
    backend: { __isMockBackend: true },
    middleware: [],
    skillSource: '/.ohmyppt-skills/page-beautify/',
    enabled: true
  }))
}))

vi.mock('deepagents', () => ({
  createDeepAgent: createDeepAgentMock,
  FilesystemBackend: class {
    constructor(public options: unknown) {}
  }
}))
vi.mock('../../../src/main/agent-runtime/model', () => ({ resolveModel: resolveModelMock }))
vi.mock('../../../src/main/agent-runtime/skills', () => ({
  attachProductSkillsBackend: attachProductSkillsBackendMock
}))

import { runPageBeautifyAgent } from '../../../src/main/edit-jobs/page-beautify-agent'

describe('page beautify Agent', () => {
  const tmpRoots: string[] = []

  afterEach(async () => {
    createDeepAgentMock.mockReset()
    resolveModelMock.mockReset()
    attachProductSkillsBackendMock.mockReset()
    attachProductSkillsBackendMock.mockReturnValue({
      backend: { __isMockBackend: true },
      middleware: [],
      skillSource: '/.ohmyppt-skills/page-beautify/',
      enabled: true
    })
    for (const root of tmpRoots.splice(0)) {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reads the full page HTML from disk, exposes only read_page_html + save_current_page_content, and returns the submitted fragment', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-beautify-agent-'))
    tmpRoots.push(root)
    const targetHtmlPath = path.join(root, 'page-1.html')
    const fullPageHtml =
      '<!doctype html><html><head><link rel="stylesheet" href="./assets/inter.css"></head><body><main class="ppt-page-root" data-ppt-guard-root="1"><div class="ppt-page-content"><h1>Current</h1></div></main></body></html>'
    await writeFile(targetHtmlPath, fullPageHtml, 'utf-8')

    let agentOptions: { tools: Array<{ name: string; invoke: (input: unknown) => Promise<unknown> }> } | null =
      null
    let readResult: unknown = undefined
    let taskMessage = ''
    createDeepAgentMock.mockImplementation((options) => {
      agentOptions = options
      return {
        stream: async (input: { messages?: Array<{ content?: unknown }> }) => {
          taskMessage = String(input?.messages?.[0]?.content || '')
          const readTool = options.tools.find((candidate: { name: string }) => candidate.name === 'read_page_html')
          const saveTool = options.tools.find((candidate: { name: string }) => candidate.name === 'save_current_page_content')
          readResult = await readTool.invoke({})
          // Second read must be a no-op hint, not the full HTML again.
          const secondRead = await readTool.invoke({})
          expect(typeof secondRead).toBe('string')
          expect(secondRead as string).toMatch(/already read the full page HTML/)

          return (async function* () {
            yield ['page-beautify', 'updates', { model: {} }]
            yield ['page-beautify', 'updates', { model: {} }]
            await saveTool.invoke({ content: '<section class="grid"><h1>Current</h1></section>' })
            yield ['page-beautify', 'updates', { model: {} }]
          })()
        }
      }
    })

    const onProgress = vi.fn()
    const content = await runPageBeautifyAgent({
      provider: 'provider',
      apiKey: 'key',
      model: 'model',
      baseUrl: 'https://example.com',
      maxTokens: 1000,
      modelTimeoutMs: { agent: 1000 },
      signal: new AbortController().signal,
      styleKey: 'editorial',
      styleName: 'Editorial',
      styleSkillPrompt: 'Use an editorial hierarchy.',
      styleCase: '',
      slideSize: { id: 'wide-16-9', label: '16:9', width: 1600, height: 900 },
      layoutSkillName: 'oh-my-ppt-layout',
      layoutAudit: 'Canvas: 1600px x 900px.\nMeasured defects:\n- [text-overflow] <p>: text needs 86px more width',
      targetPageId: 'page-1',
      targetPageNumber: 1,
      targetHtmlPath,
      onProgress
    })

    expect(content).toBe('<section class="grid"><h1>Current</h1></section>')
    // The agent gets the exact fixed render bounds before the COMPLETE persisted
    // HTML (head + fonts + body + scripts), so a long document cannot bury the
    // fact that overflow is clipped by the host canvas.
    expect(readResult).toContain('fixed 16:9 canvas: 1600px wide x 900px high')
    expect(readResult).toContain('x=0..1599, y=0..899')
    expect(readResult).toContain(fullPageHtml)
    expect(agentOptions?.tools.map((tool) => tool.name)).toEqual([
      'read_page_html',
      'save_current_page_content'
    ])
    // The layout skill for this slide size is attached read-only via the same
    // product-skills backend used by the deck/edit pipelines, so the model can
    // read_file SKILL.md and references on demand instead of being handed a
    // pre-stuffed prompt.
    expect(attachProductSkillsBackendMock).toHaveBeenCalledTimes(1)
    expect(resolveModelMock).toHaveBeenCalledWith(
      'provider',
      'key',
      'model',
      'https://example.com',
      0.5,
      1000,
      undefined
    )
    const skillCall = attachProductSkillsBackendMock.mock.calls[0]
    expect(skillCall[1]).toBe('page-beautify')
    expect(skillCall[2]).toEqual(['oh-my-ppt-layout'])
    // The prompt tells the model to read the layout skill before re-layouting.
    expect(agentOptions?.systemPrompt).toMatch(/oh-my-ppt-layout/)
    expect(agentOptions?.systemPrompt).toMatch(/read_file/)
    expect(agentOptions?.systemPrompt).toContain('creative version upgrade within the selected style')
    expect(agentOptions?.systemPrompt).toContain('text needs 86px more width')
    expect(agentOptions?.systemPrompt).toContain('fixed 16:9 canvas: 1600px wide x 900px high')
    expect(agentOptions?.systemPrompt).toContain('overflow:hidden')
    expect(taskMessage).toContain('Produce a visibly new creative version')
    expect(taskMessage).toContain('within its established style')
    expect(taskMessage).toContain('audit the finished composition')
    expect(taskMessage).toContain('browser-measured layout audit')
    expect(taskMessage).toContain('This is not proofreading')
    const ratios = onProgress.mock.calls.map((call) => call[0])
    expect(ratios.length).toBeGreaterThanOrEqual(2)
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i - 1])
    }
    expect(ratios[0]).toBeGreaterThanOrEqual(0.25)
    expect(Math.max(...ratios)).toBeCloseTo(0.82, 2)
  })

  it('classifies a stream timeout as a retryable timeout error, not a generic failure', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-beautify-agent-timeout-'))
    tmpRoots.push(root)
    const targetHtmlPath = path.join(root, 'page-1.html')
    await writeFile(targetHtmlPath, '<!doctype html><html></html>', 'utf-8')

    createDeepAgentMock.mockReturnValue({
      stream: async () => {
        return (async function* () {
          yield ['page-beautify', 'updates', { model: {} }]
          const timeoutError = new Error('The operation was aborted due to timeout')
          timeoutError.name = 'TimeoutError'
          throw timeoutError
        })()
      }
    })

    await expect(
      runPageBeautifyAgent({
        provider: 'provider',
        apiKey: 'key',
        model: 'model',
        baseUrl: 'https://example.com',
        maxTokens: 1000,
        modelTimeoutMs: { agent: 5000 },
        signal: new AbortController().signal,
        styleKey: 'editorial',
        styleName: 'Editorial',
        styleSkillPrompt: 'Use an editorial hierarchy.',
        styleCase: '',
        slideSize: { id: 'wide-16-9', label: '16:9', width: 1600, height: 900 },
      layoutSkillName: 'oh-my-ppt-layout',
        targetPageId: 'page-1',
        targetPageNumber: 1,
        targetHtmlPath
      })
    ).rejects.toThrow(/模型响应超时/)
  })

  it('classifies an aborted user signal as a cancellation, not a timeout', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-beautify-agent-cancel-'))
    tmpRoots.push(root)
    const targetHtmlPath = path.join(root, 'page-1.html')
    await writeFile(targetHtmlPath, '<!doctype html><html></html>', 'utf-8')

    createDeepAgentMock.mockReturnValue({
      stream: async () => {
        return (async function* () {
          const abortError = new Error('The operation was aborted')
          abortError.name = 'AbortError'
          throw abortError
        })()
      }
    })
    const userController = new AbortController()
    userController.abort()

    await expect(
      runPageBeautifyAgent({
        provider: 'provider',
        apiKey: 'key',
        model: 'model',
        baseUrl: 'https://example.com',
        maxTokens: 1000,
        modelTimeoutMs: { agent: 5000 },
        signal: userController.signal,
        styleKey: 'editorial',
        styleName: 'Editorial',
        styleSkillPrompt: 'Use an editorial hierarchy.',
        styleCase: '',
        slideSize: { id: 'wide-16-9', label: '16:9', width: 1600, height: 900 },
      layoutSkillName: 'oh-my-ppt-layout',
        targetPageId: 'page-1',
        targetPageNumber: 1,
        targetHtmlPath
      })
    ).rejects.toThrow('生成已取消')
  })

  it('emits heartbeat progress during the silent first-token wait so the bar does not stall at 20%', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-beautify-agent-heartbeat-'))
    tmpRoots.push(root)
    const targetHtmlPath = path.join(root, 'page-1.html')
    await writeFile(targetHtmlPath, '<!doctype html><html></html>', 'utf-8')

    let resolveFirstChunk!: () => void
    const firstChunkGate = new Promise<void>((resolve) => {
      resolveFirstChunk = resolve
    })

    createDeepAgentMock.mockImplementation((options) => {
      return {
        stream: async () => {
          const readTool = options.tools.find(
            (candidate: { name: string }) => candidate.name === 'read_page_html'
          )
          const saveTool = options.tools.find(
            (candidate: { name: string }) => candidate.name === 'save_current_page_content'
          )
          return (async function* () {
            // Mark the page as read so save_current_page_content is accepted.
            await readTool.invoke({})
            // Simulate the silent window: model is reading the page HTML and waiting for
            // first token. No `updates` chunks arrive until the gate resolves.
            await firstChunkGate
            yield ['page-beautify', 'updates', { model: {} }]
            await saveTool.invoke({ content: '<section class="grid"><h1>Current</h1></section>' })
          })()
        }
      }
    })

    const onProgress = vi.fn()
    const runPromise = runPageBeautifyAgent({
      provider: 'provider',
      apiKey: 'key',
      model: 'model',
      baseUrl: 'https://example.com',
      maxTokens: 1000,
      modelTimeoutMs: { agent: 60000 },
      signal: new AbortController().signal,
      styleKey: 'editorial',
      styleName: 'Editorial',
      styleSkillPrompt: 'Use an editorial hierarchy.',
      styleCase: '',
      slideSize: { id: 'wide-16-9', label: '16:9', width: 1600, height: 900 },
      layoutSkillName: 'oh-my-ppt-layout',
      targetPageId: 'page-1',
      targetPageNumber: 1,
      targetHtmlPath,
      onProgress
    })

    // Advance wall-clock past several heartbeat ticks while the stream is silent.
    // Without the heartbeat, onProgress would never fire during this window and the
    // service-side bar would freeze at 20% for the entire first-token latency.
    await vi.advanceTimersByTimeAsync(5000)

    const heartbeatRatios = onProgress.mock.calls.map((call) => call[0])
    expect(heartbeatRatios.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < heartbeatRatios.length; i += 1) {
      expect(heartbeatRatios[i]).toBeGreaterThanOrEqual(heartbeatRatios[i - 1])
    }
    // Heartbeat is capped under 0.4 so the first real model update (floor 0.25, then growing)
    // always overtakes it cleanly.
    expect(Math.max(...heartbeatRatios)).toBeLessThan(0.4)
    expect(Math.max(...heartbeatRatios)).toBeGreaterThan(0.1)

    // Release the stream and let it finish; model-update progress must then take over.
    const ratiosBeforeResume = heartbeatRatios.length
    resolveFirstChunk()
    await runPromise
    const ratiosAfter = onProgress.mock.calls.map((call) => call[0])
    expect(ratiosAfter.length).toBeGreaterThan(ratiosBeforeResume)
    vi.useRealTimers()
  })
})
