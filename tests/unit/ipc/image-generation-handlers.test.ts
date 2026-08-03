import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JobCoordinator } from '../../../src/main/agent-runtime/job/coordinator'
import { TypedEventBus } from '../../../src/main/agent-runtime/events/bus'

const state = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => Promise<unknown>>()
  const generate = vi.fn()
  return {
    handlers,
    generate,
    resolveImageGenerationProvider: vi.fn(() => ({ generate })),
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: any[]) => Promise<unknown>) => {
        handlers.set(channel, handler)
      })
    }
  }
})

vi.mock('electron', () => ({ ipcMain: state.ipcMain }))
vi.mock('electron-log/main.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../../../src/main/agent-runtime/provider/image', () => ({
  resolveImageGenerationProvider: state.resolveImageGenerationProvider
}))
vi.mock('../../../src/main/io/assets-handlers', () => ({ allowLocalAssetRoot: vi.fn() }))

const imagePayload = {
  sessionId: 'session-1',
  pageId: 'page-1',
  prompt: 'A calm sunrise over a mountain lake',
  count: 1,
  size: '16:9'
}

const createContext = (projectDir: string) => ({
  db: {
    getSetting: vi.fn().mockResolvedValue('en'),
    getActiveImageModelConfig: vi.fn().mockResolvedValue({
      id: 'image-model-1',
      name: 'Image model',
      provider: 'openaiCompatible',
      active: 1,
      modelConfig: JSON.stringify({ model: 'image-model' })
    }),
    listSessionPages: vi.fn().mockResolvedValue([
      {
        id: 'page-1',
        file_slug: 'page-1',
        legacy_page_id: null,
        title: 'Cover',
        page_number: 1,
        html_path: path.join(projectDir, 'pages', 'page-1.html')
      }
    ]),
    listLatestGenerationPageSnapshot: vi.fn().mockResolvedValue([]),
    insertImageGenerationHistory: vi.fn().mockResolvedValue('history-1')
  },
  decryptApiKey: vi.fn((value: string) => value),
  resolveSessionProjectDir: vi.fn().mockResolvedValue(projectDir),
  toSafeAssetBaseName: vi.fn(() => 'generated-cover')
})

const register = async (projectDir: string) => {
  const { registerImageGenerationHandlers } = await import(
    '../../../src/main/image-generation/handlers'
  )
  const coordinator = new JobCoordinator()
  const runtimeEvents = new TypedEventBus()
  const events: Array<{ type: string; payload: unknown; jobId: string }> = []
  runtimeEvents.subscribe({}, (event) => events.push(event))
  registerImageGenerationHandlers(createContext(projectDir) as never, coordinator, runtimeEvents)
  const generate = state.handlers.get('images:generate')
  const cancel = state.handlers.get('images:cancel')
  const getState = state.handlers.get('images:getState')
  if (!generate || !cancel || !getState) throw new Error('Image IPC handlers were not registered')
  return { coordinator, events, generate, cancel, getState }
}

describe('registerImageGenerationHandlers', () => {
  const temporaryDirs: string[] = []

  beforeEach(() => {
    vi.resetModules()
    state.handlers.clear()
    state.generate.mockReset()
    state.resolveImageGenerationProvider.mockClear()
    state.ipcMain.handle.mockClear()
  })

  afterEach(async () => {
    await Promise.all(
      temporaryDirs.splice(0).map((directory) => fs.promises.rm(directory, { recursive: true, force: true }))
    )
  })

  it('uses one image-history lease for generation, persistence, and terminal events', async () => {
    const projectDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'image-runtime-'))
    temporaryDirs.push(projectDir)
    state.generate.mockResolvedValue([
      { bytes: Buffer.from('image-bytes'), mimeType: 'image/png', extension: '.png' }
    ])
    const { coordinator, events, generate, getState } = await register(projectDir)

    const result = await generate({}, imagePayload)
    const runId = (result as { history: { id: string; assets: Array<{ relativePath: string }> } }).history

    expect(runId.id).toBe('history-1')
    expect(runId.assets).toHaveLength(1)
    expect(runId.assets[0]?.relativePath).toMatch(/^\.\/images\/generated-cover-.+\.png$/)
    expect(state.generate).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openaiCompatible' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(await getState({}, 'session-1')).toMatchObject({ status: 'completed', progress: 100 })
    expect(coordinator.getByOwner({ kind: 'image-history', id: 'session-1' })).toBeNull()
    expect(events.map((event) => event.type)).toEqual([
      'job.started',
      'image.progress',
      'image.progress',
      'image.progress',
      'job.completed'
    ])
  })

  it('rejects a concurrent session image request and cancels through the shared lease', async () => {
    const projectDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'image-runtime-'))
    temporaryDirs.push(projectDir)
    state.generate.mockImplementation(
      (_config: unknown, input: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          input.signal?.addEventListener(
            'abort',
            () => reject(new Error('Image generation cancelled')),
            { once: true }
          )
        })
    )
    const { coordinator, events, generate, cancel, getState } = await register(projectDir)

    const first = generate({}, imagePayload)
    await vi.waitFor(() => expect(state.generate).toHaveBeenCalledTimes(1))
    await expect(generate({}, imagePayload)).rejects.toThrow('already running')
    expect(await cancel({}, 'session-1')).toEqual({ success: true })
    await expect(first).rejects.toThrow('Image generation cancelled')

    expect(await getState({}, 'session-1')).toMatchObject({ status: 'cancelled', progress: 100 })
    expect(coordinator.getByOwner({ kind: 'image-history', id: 'session-1' })).toBeNull()
    expect(events.map((event) => event.type)).toEqual([
      'job.started',
      'image.progress',
      'image.progress',
      'job.cancelled'
    ])
  })

  it('publishes a stable failure event and releases the image-history lease', async () => {
    const projectDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'image-runtime-'))
    temporaryDirs.push(projectDir)
    state.generate.mockRejectedValue(new Error('Image provider unavailable'))
    const { coordinator, events, generate, getState } = await register(projectDir)

    await expect(generate({}, imagePayload)).rejects.toThrow('Image provider unavailable')

    expect(await getState({}, 'session-1')).toMatchObject({
      status: 'failed',
      error: 'Image provider unavailable'
    })
    expect(coordinator.getByOwner({ kind: 'image-history', id: 'session-1' })).toBeNull()
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'job.failed',
        payload: {
          errorCode: 'image_generation_failed',
          errorMessage: 'Image provider unavailable'
        }
      })
    )
  })

  it('removes generated files when history persistence fails', async () => {
    const projectDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'image-runtime-'))
    temporaryDirs.push(projectDir)
    state.generate.mockResolvedValue([
      { bytes: Buffer.from('first-image'), mimeType: 'image/png', extension: '.png' },
      { bytes: Buffer.from('second-image'), mimeType: 'image/png', extension: '.png' }
    ])
    const context = createContext(projectDir)
    context.db.insertImageGenerationHistory.mockRejectedValue(new Error('history unavailable'))
    const { registerImageGenerationHandlers } = await import(
      '../../../src/main/image-generation/handlers'
    )
    const coordinator = new JobCoordinator()
    registerImageGenerationHandlers(context as never, coordinator, new TypedEventBus())
    const generate = state.handlers.get('images:generate')
    if (!generate) throw new Error('Image IPC handler was not registered')

    await expect(generate({}, { ...imagePayload, count: 2 })).rejects.toThrow('history unavailable')

    const imagesDir = path.join(projectDir, 'images')
    expect(await fs.promises.readdir(imagesDir)).toEqual([])
    expect(coordinator.getByOwner({ kind: 'image-history', id: 'session-1' })).toBeNull()
  })
})
