import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { PPTDatabase } from '../../../src/main/db/database'
import { LoggerService } from '../../../src/main/logging/logger-service'
import { registerLogHandlers } from '../../../src/main/logging/log-handlers'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  ipcMain: { handle: vi.fn() }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

import { ipcMain } from 'electron'

describe('log handlers', () => {
  let db: PPTDatabase
  let dbPath: string
  let logger: LoggerService
  let handlers: Record<string, (event: unknown, payload: unknown) => Promise<unknown>>
  const originalHandle = ipcMain.handle

  beforeEach(async () => {
    dbPath = path.join(
      os.tmpdir(),
      `test-handlers-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    )
    db = new PPTDatabase(dbPath)
    await db.init()
    logger = new LoggerService(db, 'normal', true)
    handlers = {}

    ipcMain.handle = vi.fn(
      (
        channel: string,
        handler: (event: unknown, payload: unknown) => Promise<unknown>
      ) => {
        handlers[channel] = handler
      }
    ) as unknown as typeof ipcMain.handle

    registerLogHandlers({ logger, db } as unknown as Parameters<
      typeof registerLogHandlers
    >[0])
  })

  afterEach(async () => {
    ipcMain.handle = originalHandle
    await db.close()
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('log:write writes a single entry', async () => {
    await handlers['log:write'](null, {
      level: 'action',
      source: 'test',
      message: 'hello'
    })
    const result = await handlers['log:query'](null, { limit: 10, offset: 0 })
    expect((result as { logs: unknown[] }).logs).toHaveLength(1)
  })

  it('log:writeBatch writes multiple entries', async () => {
    await handlers['log:writeBatch'](null, [
      { level: 'info', source: 'test', message: 'msg1' },
      { level: 'info', source: 'test', message: 'msg2' }
    ])
    const result = await handlers['log:query'](null, { limit: 10, offset: 0 })
    expect((result as { logs: unknown[] }).logs).toHaveLength(2)
  })

  it('log:query returns filtered results', async () => {
    await handlers['log:write'](null, { level: 'error', source: 'test', message: 'err' })
    await handlers['log:write'](null, { level: 'info', source: 'test', message: 'inf' })

    const result = await handlers['log:query'](null, { level: 'error', limit: 10, offset: 0 })
    const typed = result as { logs: unknown[]; total: number }
    expect(typed.logs).toHaveLength(1)
    expect(typed.total).toBe(1)
  })

  it('log:clear deletes all logs', async () => {
    await handlers['log:write'](null, { level: 'info', source: 'test', message: 'msg' })
    await handlers['log:clear'](null, null)
    const result = await handlers['log:query'](null, { limit: 10, offset: 0 })
    expect((result as { logs: unknown[] }).logs).toHaveLength(0)
  })

  it('log:getSettings returns settings and total', async () => {
    await handlers['log:write'](null, { level: 'info', source: 'test', message: 'msg' })
    const result = await handlers['log:getSettings'](null, null)
    const typed = result as { logLevel: string; logEnabled: boolean; total: number }
    expect(typed.logLevel).toBe('normal')
    expect(typed.logEnabled).toBe(true)
    expect(typed.total).toBe(1)
  })

  it('log:saveSettings updates logger settings', async () => {
    await handlers['log:saveSettings'](null, { logLevel: 'debug', logEnabled: false })
    const result = await handlers['log:getSettings'](null, null)
    const typed = result as { logLevel: string; logEnabled: boolean }
    expect(typed.logLevel).toBe('debug')
    expect(typed.logEnabled).toBe(false)
  })
})
