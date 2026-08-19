import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockQueryLogs = vi.fn()
const mockClearLogs = vi.fn()
const mockGetLogSettings = vi.fn()
const mockSaveLogSettings = vi.fn()

vi.mock('../../../src/renderer/src/lib/ipc', () => ({
  ipc: {
    queryLogs: (...args: unknown[]) => mockQueryLogs(...args),
    clearLogs: (...args: unknown[]) => mockClearLogs(...args),
    getLogSettings: (...args: unknown[]) => mockGetLogSettings(...args),
    saveLogSettings: (...args: unknown[]) => mockSaveLogSettings(...args)
  }
}))

const { useLogStore } = await import('../../../src/renderer/src/store/logStore')

describe('logStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryLogs.mockResolvedValue({
      logs: [
        { id: '1', level: 'action', source: 'test', message: 'msg1', detail: null, sessionId: null, createdAt: 1000 }
      ],
      total: 1
    })
    mockGetLogSettings.mockResolvedValue({ logLevel: 'normal', logEnabled: true, total: 0 })
    mockClearLogs.mockResolvedValue({ success: true })
    mockSaveLogSettings.mockResolvedValue({ success: true })

    useLogStore.setState({
      logs: [],
      total: 0,
      loading: false,
      hasMore: false,
      filter: {},
      logSettings: null
    })
  })

  it('fetchLogs loads logs with filter', async () => {
    await useLogStore.getState().fetchLogs()
    const state = useLogStore.getState()
    expect(state.logs).toHaveLength(1)
    expect(state.total).toBe(1)
    expect(mockQueryLogs).toHaveBeenCalledWith({ limit: 100, offset: 0 })
  })

  it('setFilter updates filter and refetches', async () => {
    mockQueryLogs.mockResolvedValue({ logs: [], total: 0 })
    await useLogStore.getState().fetchLogs()
    await useLogStore.getState().setFilter({ level: 'error' })
    expect(mockQueryLogs).toHaveBeenLastCalledWith({ limit: 100, offset: 0, level: 'error' })
  })

  it('loadMore loads next page', async () => {
    mockQueryLogs.mockResolvedValueOnce({
      logs: Array.from({ length: 100 }, (_, i) => ({
        id: String(i), level: 'info', source: 'test', message: `msg${i}`, detail: null, sessionId: null, createdAt: i
      })),
      total: 150
    })
    await useLogStore.getState().fetchLogs()
    expect(useLogStore.getState().logs).toHaveLength(100)
    expect(useLogStore.getState().hasMore).toBe(true)

    mockQueryLogs.mockResolvedValueOnce({
      logs: [{ id: '100', level: 'info', source: 'test', message: 'msg100', detail: null, sessionId: null, createdAt: 100 }],
      total: 150
    })
    await useLogStore.getState().loadMore()
    expect(useLogStore.getState().logs).toHaveLength(101)
  })

  it('fetchLogSettings loads settings', async () => {
    await useLogStore.getState().fetchLogSettings()
    expect(useLogStore.getState().logSettings).toEqual({ logLevel: 'normal', logEnabled: true })
  })

  it('clearLogs clears logs and resets state', async () => {
    await useLogStore.getState().fetchLogs()
    expect(useLogStore.getState().logs).toHaveLength(1)
    await useLogStore.getState().clearLogs()
    expect(useLogStore.getState().logs).toHaveLength(0)
    expect(useLogStore.getState().total).toBe(0)
  })
})
