import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { PPTDatabase } from '../../../src/main/db/database'
import { LoggerService } from '../../../src/main/logging/logger-service'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Mock electron modules needed by PPTDatabase
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

describe('LoggerService', () => {
  let db: PPTDatabase
  let dbPath: string
  let service: LoggerService

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-logger-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    db = new PPTDatabase(dbPath)
    await db.init()
    service = new LoggerService(db, 'normal', true)
  })

  afterEach(async () => {
    await db.close()
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('writes and queries a log entry', async () => {
    await service.write({ level: 'action', source: 'session', message: '创建会话' })
    const result = await service.query({ limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0].message).toBe('创建会话')
  })

  it('writes detail as JSON string', async () => {
    await service.write({
      level: 'info',
      source: 'test',
      message: 'msg',
      detail: { key: 'value' }
    })
    const result = await service.query({ limit: 10, offset: 0 })
    expect(result.logs[0].detail).toBe(JSON.stringify({ key: 'value' }))
  })

  it('skips debug level in normal mode', async () => {
    await service.write({ level: 'debug', source: 'test', message: 'debug msg' })
    const result = await service.query({ limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(0)
  })

  it('records debug level in debug mode', async () => {
    service.setLogLevel('debug')
    await service.write({ level: 'debug', source: 'test', message: 'debug msg' })
    const result = await service.query({ limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0].level).toBe('debug')
  })

  it('skips all writes when disabled', async () => {
    service.setEnabled(false)
    await service.write({ level: 'action', source: 'test', message: 'msg' })
    const result = await service.query({ limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(0)
  })

  it('clearAll deletes all logs', async () => {
    await service.write({ level: 'info', source: 'test', message: 'msg1' })
    await service.write({ level: 'info', source: 'test', message: 'msg2' })
    await service.clearAll()
    const result = await service.query({ limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(0)
  })

  it('pruneExpired deletes logs older than retention days', async () => {
    // Insert a log with current timestamp
    await service.write({ level: 'info', source: 'test', message: 'recent' })
    // pruneExpired should not delete recent logs
    await service.pruneExpired()
    const result = await service.query({ limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0].message).toBe('recent')
  })

  it('isEnabled returns current state', () => {
    expect(service.isEnabled()).toBe(true)
    service.setEnabled(false)
    expect(service.isEnabled()).toBe(false)
  })

  it('getLogLevel returns current level', () => {
    expect(service.getLogLevel()).toBe('normal')
    service.setLogLevel('debug')
    expect(service.getLogLevel()).toBe('debug')
  })
})
