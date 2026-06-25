import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const serviceInstances: Array<{ ensureBaseline: ReturnType<typeof vi.fn>; listVersions: ReturnType<typeof vi.fn> }> = []
  return {
    handlers,
    serviceInstances,
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
        handlers.set(channel, handler)
      })
    },
    GitHistoryService: vi.fn().mockImplementation(function GitHistoryService() {
      const service = {
        ensureBaseline: vi.fn().mockResolvedValue(undefined),
        listVersions: vi.fn().mockResolvedValue([])
      }
      serviceInstances.push(service)
      return service
    })
  }
})

vi.mock('electron', () => ({ ipcMain: state.ipcMain }))
vi.mock('electron-log/main.js', () => ({ default: { warn: vi.fn() } }))
vi.mock('../../../src/main/history/git-history-service', () => ({
  GitHistoryService: state.GitHistoryService
}))

describe('registerHistoryHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    state.handlers.clear()
    state.serviceInstances.length = 0
    state.ipcMain.handle.mockClear()
    state.GitHistoryService.mockClear()
  })

  it('caps history list requests at 20 versions in the main process', async () => {
    const { registerHistoryHandlers } = await import('../../../src/main/ipc/history/history-handlers')
    const ctx = {
      db: {},
      resolveSessionProjectDir: vi.fn().mockResolvedValue('/tmp/session-1'),
      sessionRunStates: new Map()
    }
    registerHistoryHandlers(ctx as never)

    const handler = state.handlers.get('history:listVersions')
    await handler?.({}, { sessionId: ' session-1 ', limit: 99 })

    expect(state.serviceInstances[0]?.ensureBaseline).toHaveBeenCalledWith(
      'session-1',
      '/tmp/session-1'
    )
    expect(state.serviceInstances[0]?.listVersions).toHaveBeenCalledWith('session-1', 20)
  })
})
