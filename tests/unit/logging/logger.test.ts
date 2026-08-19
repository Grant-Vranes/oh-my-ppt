import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const mockWriteLogBatch = vi.fn().mockResolvedValue({ success: true })
const mockGetLogSettings = vi.fn().mockResolvedValue({ logLevel: 'normal', logEnabled: true, total: 0 })

vi.mock('../../../src/renderer/src/lib/ipc', () => ({
  ipc: {
    writeLogBatch: (...args: unknown[]) => mockWriteLogBatch(...args),
    getLogSettings: (...args: unknown[]) => mockGetLogSettings(...args)
  }
}))

const { logger } = await import('../../../src/renderer/src/lib/logger')

describe('renderer logger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockWriteLogBatch.mockClear()
    mockGetLogSettings.mockClear()
    mockGetLogSettings.mockResolvedValue({ logLevel: 'normal', logEnabled: true, total: 0 })
    logger.reset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('buffers logs and flushes after 500ms', async () => {
    logger.action('test', 'msg1')
    logger.info('test', 'msg2')
    expect(mockWriteLogBatch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    await vi.waitFor(() => {
      expect(mockWriteLogBatch).toHaveBeenCalledTimes(1)
    })
    const entries = mockWriteLogBatch.mock.calls[0][0]
    expect(entries).toHaveLength(2)
  })

  it('does not send debug logs in normal mode', async () => {
    await logger.refreshSettings()
    logger.debug('test', 'debug msg')
    vi.advanceTimersByTime(500)
    expect(mockWriteLogBatch).not.toHaveBeenCalled()
  })

  it('sends debug logs in debug mode', async () => {
    mockGetLogSettings.mockResolvedValue({ logLevel: 'debug', logEnabled: true, total: 0 })
    await logger.refreshSettings()
    logger.debug('test', 'debug msg')
    vi.advanceTimersByTime(500)
    await vi.waitFor(() => {
      expect(mockWriteLogBatch).toHaveBeenCalledTimes(1)
    })
    expect(mockWriteLogBatch.mock.calls[0][0][0].level).toBe('debug')
  })

  it('does not send any logs when disabled', async () => {
    mockGetLogSettings.mockResolvedValue({ logLevel: 'normal', logEnabled: false, total: 0 })
    await logger.refreshSettings()
    logger.action('test', 'msg')
    vi.advanceTimersByTime(500)
    expect(mockWriteLogBatch).not.toHaveBeenCalled()
  })

  it('flushes immediately on flush()', async () => {
    logger.action('test', 'msg')
    await logger.flush()
    expect(mockWriteLogBatch).toHaveBeenCalledTimes(1)
  })
})
