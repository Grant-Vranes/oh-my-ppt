import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), 'ohmyppt-test-user-data'))
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

import { PPTDatabase } from '../../../src/main/db/database'

describe('activity_logs DB methods', () => {
  let db: PPTDatabase
  let dbPath: string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-logs-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    db = new PPTDatabase(dbPath)
    await db.init()
  })

  afterEach(async () => {
    await db.close()
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  })

  it('inserts and queries a log entry', async () => {
    await db.insertActivityLog({
      level: 'action',
      source: 'session',
      message: '创建会话',
      detail: JSON.stringify({ sessionId: 's1' }),
      sessionId: 's1'
    })

    const result = await db.queryActivityLogs({ limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0].level).toBe('action')
    expect(result.logs[0].source).toBe('session')
    expect(result.logs[0].message).toBe('创建会话')
    expect(result.total).toBe(1)
  })

  it('filters by level', async () => {
    await db.insertActivityLog({ level: 'action', source: 'test', message: 'msg1' })
    await db.insertActivityLog({ level: 'error', source: 'test', message: 'msg2' })
    await db.insertActivityLog({ level: 'info', source: 'test', message: 'msg3' })

    const result = await db.queryActivityLogs({ level: 'error', limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0].message).toBe('msg2')
    expect(result.total).toBe(1)
  })

  it('filters by source', async () => {
    await db.insertActivityLog({ level: 'info', source: 'session', message: 'msg1' })
    await db.insertActivityLog({ level: 'info', source: 'generate', message: 'msg2' })

    const result = await db.queryActivityLogs({ source: 'generate', limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0].source).toBe('generate')
  })

  it('filters by searchText in message', async () => {
    await db.insertActivityLog({ level: 'info', source: 'test', message: '创建会话成功' })
    await db.insertActivityLog({ level: 'info', source: 'test', message: '删除会话失败' })

    const result = await db.queryActivityLogs({ searchText: '创建', limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(1)
    expect(result.logs[0].message).toBe('创建会话成功')
  })

  it('paginates with limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await db.insertActivityLog({ level: 'info', source: 'test', message: `msg${i}` })
    }

    const page1 = await db.queryActivityLogs({ limit: 2, offset: 0 })
    const page2 = await db.queryActivityLogs({ limit: 2, offset: 2 })
    expect(page1.logs).toHaveLength(2)
    expect(page2.logs).toHaveLength(2)
    expect(page1.logs[0].id).not.toBe(page2.logs[0].id)
    expect(page1.total).toBe(5)
  })

  it('deletes logs before a timestamp', async () => {
    await db.insertActivityLog({ level: 'info', source: 'test', message: 'old' })

    const futureTs = Math.floor(Date.now() / 1000) + 5 * 24 * 60 * 60
    await db.deleteActivityLogsBefore(futureTs)
    const result = await db.queryActivityLogs({ limit: 10, offset: 0 })
    expect(result.logs).toHaveLength(0)
  })

  it('getActivityLogCount returns total count', async () => {
    await db.insertActivityLog({ level: 'info', source: 'test', message: 'msg1' })
    await db.insertActivityLog({ level: 'info', source: 'test', message: 'msg2' })
    const count = await db.getActivityLogCount()
    expect(count).toBe(2)
  })
})
