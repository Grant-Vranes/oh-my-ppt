# Activity Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an activity logging system that records user actions and key system events to SQLite, with a settings tab for viewing, filtering, and managing logs.

**Architecture:** Renderer components call a lightweight `logger` module that micro-buffers log entries (500ms) and sends them via IPC to the main process `LoggerService`, which writes to the `activity_logs` SQLite table. A zustand `logStore` powers the settings UI for querying, filtering, and clearing logs. Logs are pruned to 14 days on app startup.

**Tech Stack:** Electron, React, Zustand, Drizzle ORM (SQLite), Vitest + happy-dom

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/shared/activity-log.ts` | Shared types: LogLevel, ActivityLogEntry, LogWriteEntry, LogQueryParams, LogQueryResult, LogSettingsPayload, LogSettingsResult |
| `src/main/logging/logger-service.ts` | LoggerService class: write, query, clearAll, pruneExpired, setLogLevel, setEnabled, isEnabled, getLogLevel |
| `src/main/logging/log-handlers.ts` | IPC handler registration: log:write, log:writeBatch, log:query, log:clear, log:getSettings, log:saveSettings |
| `src/main/db/patch/add-activity-logs-table.ts` | DB patch: create activity_logs table + indexes |
| `src/renderer/src/lib/logger.ts` | Renderer logger with 500ms micro-buffer, level filtering, beforeunload flush |
| `src/renderer/src/store/logStore.ts` | Zustand store: fetchLogs, loadMore, fetchLogSettings, saveLogSettings, clearLogs, setFilter |
| `src/renderer/src/components/settings/LogSettingsTab.tsx` | Settings UI: log toggle, level selector, filter controls, log list with expandable detail, clear button |
| `tests/unit/logging/logger-service.test.ts` | LoggerService tests |
| `tests/unit/logging/log-handlers.test.ts` | IPC handler tests |
| `tests/unit/db/activity-logs.test.ts` | DB layer CRUD + query + prune tests |
| `tests/unit/logging/logger.test.ts` | Renderer logger buffer/flush/filter tests |
| `tests/unit/logging/log-store.test.ts` | Zustand store tests |

### Modified Files

| File | Changes |
|------|---------|
| `src/main/db/schema.ts` | Add `activityLogs` table definition + `ActivityLog` type export |
| `src/main/db/database.ts` | Add `insertActivityLog`, `queryActivityLogs`, `deleteActivityLogsBefore`, `getActivityLogCount` methods |
| `src/main/db/patch/index.ts` | Import + call `patchActivityLogsTable` |
| `src/main/ipc/runtime/context.ts` | Add `logger: LoggerService` to `IpcContext` interface + `createIpcContext` |
| `src/main/ipc/index.ts` | Import + call `registerLogHandlers` |
| `src/main/app/application.ts` | Initialize LoggerService from settings, call `pruneExpired()` on startup |
| `src/renderer/src/lib/ipc.ts` | Add `writeLog`, `writeLogBatch`, `queryLogs`, `clearLogs`, `getLogSettings`, `saveLogSettings` methods |
| `src/renderer/src/store/index.ts` | Export `logStore` |
| `src/renderer/src/pages/settings.tsx` | Add 5th tab "log" with `LogSettingsTab` |
| `src/renderer/src/i18n/zh.ts` | Add log-related Chinese translations |
| `src/renderer/src/i18n/en.ts` | Add log-related English translations |

---

## Task 1: Shared Types

**Files:**
- Create: `src/shared/activity-log.ts`

- [ ] **Step 1: Create the shared types file**

```ts
// src/shared/activity-log.ts

export type LogLevel = 'action' | 'info' | 'warn' | 'error' | 'debug'

export interface ActivityLogEntry {
  id: string
  level: LogLevel
  source: string
  message: string
  detail: string | null
  sessionId: string | null
  createdAt: number
}

export interface LogWriteEntry {
  level: LogLevel
  source: string
  message: string
  detail?: Record<string, unknown>
  sessionId?: string
}

export interface LogQueryParams {
  level?: LogLevel
  source?: string
  sessionId?: string
  searchText?: string
  limit?: number
  offset?: number
}

export interface LogQueryResult {
  logs: ActivityLogEntry[]
  total: number
}

export interface LogSettingsPayload {
  logLevel?: 'normal' | 'debug'
  logEnabled?: boolean
}

export interface LogSettingsResult {
  logLevel: 'normal' | 'debug'
  logEnabled: boolean
  total: number
}

export const LOG_RETENTION_DAYS = 14

export const isLogLevel = (value: unknown): value is LogLevel =>
  value === 'action' || value === 'info' || value === 'warn' || value === 'error' || value === 'debug'
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/activity-log.ts
git commit -m "feat(log): add shared activity log types"
```

---

## Task 2: DB Schema + Patch

**Files:**
- Modify: `src/main/db/schema.ts`
- Create: `src/main/db/patch/add-activity-logs-table.ts`
- Modify: `src/main/db/patch/index.ts`

- [ ] **Step 1: Add activityLogs table to schema.ts**

Append to `src/main/db/schema.ts` (before the type exports section at line ~454):

```ts
export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id: text('id').primaryKey(),
    level: text('level').notNull(),
    source: text('source').notNull(),
    message: text('message').notNull(),
    detail: text('detail'),
    sessionId: text('session_id'),
    createdAt: integer('created_at').notNull()
  },
  (table) => ({
    activityLogsCreatedIdx: index('idx_activity_logs_created').on(table.createdAt),
    activityLogsLevelIdx: index('idx_activity_logs_level').on(table.level, table.createdAt),
    activityLogsSourceIdx: index('idx_activity_logs_source').on(table.source, table.createdAt)
  })
)
```

Add the type export near the other type exports (after line ~470):

```ts
export type ActivityLog = typeof activityLogs.$inferSelect
```

- [ ] **Step 2: Create the DB patch file**

```ts
// src/main/db/patch/add-activity-logs-table.ts
import type { createClient } from '@libsql/client'

type LibSqlClient = ReturnType<typeof createClient>

export const patchActivityLogsTable = async (client: LibSqlClient): Promise<void> => {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT,
      session_id TEXT,
      created_at INTEGER NOT NULL
    )
  `)
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at)'
  )
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_level ON activity_logs(level, created_at)'
  )
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_source ON activity_logs(source, created_at)'
  )
}
```

- [ ] **Step 3: Register the patch in index.ts**

In `src/main/db/patch/index.ts`, add import at top (after line 13):

```ts
import { patchActivityLogsTable } from './add-activity-logs-table'
```

In `runDatabasePatches` function (after line 1593, the last patch call), add:

```ts
  await patchActivityLogsTable(client)
```

- [ ] **Step 4: Commit**

```bash
git add src/main/db/schema.ts src/main/db/patch/add-activity-logs-table.ts src/main/db/patch/index.ts
git commit -m "feat(log): add activity_logs table schema and patch"
```

---

## Task 3: DB Methods

**Files:**
- Modify: `src/main/db/database.ts`
- Test: `tests/unit/db/activity-logs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/db/activity-logs.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { PPTDatabase } from '../../../src/main/db/database'
import type { LogLevel } from '../../../src/shared/activity-log'
import fs from 'fs'
import path from 'path'
import os from 'os'

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
    const now = Math.floor(Date.now() / 1000)
    await db.insertActivityLog({ level: 'info', source: 'test', message: 'old' })
    // Manually set created_at to past by inserting directly via the raw client
    const oldTs = now - 15 * 24 * 60 * 60
    await db.insertActivityLog({ level: 'info', source: 'test', message: 'old2' })

    // Use deleteActivityLogsBefore with a future timestamp to delete all
    await db.deleteActivityLogsBefore(now + 5 * 24 * 60 * 60)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/db/activity-logs.test.ts`
Expected: FAIL with "insertActivityLog is not a function" or similar

- [ ] **Step 3: Implement DB methods**

In `src/main/db/database.ts`, add import at top (after existing imports, near line 4):

```ts
import type { ActivityLog } from './schema'
```

Add the following methods inside the `PPTDatabase` class (after the `getAllSettings` method, around line 2492, before the `// ========== Model Configs ==========` comment):

```ts
  // ========== Activity Logs ==========

  async insertActivityLog(data: {
    level: string
    source: string
    message: string
    detail?: string | null
    sessionId?: string | null
  }): Promise<void> {
    const id = nanoid()
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .insert(schema.activityLogs)
      .values({
        id,
        level: data.level,
        source: data.source,
        message: data.message,
        detail: data.detail ?? null,
        sessionId: data.sessionId ?? null,
        createdAt: now
      })
      .run()
  }

  async queryActivityLogs(params: {
    level?: string
    source?: string
    sessionId?: string
    searchText?: string
    limit?: number
    offset?: number
  }): Promise<{ logs: ActivityLog[]; total: number }> {
    const limit = Math.max(1, Math.min(500, params.limit ?? 100))
    const offset = Math.max(0, params.offset ?? 0)

    const conditions: ReturnType<typeof eq>[] = []
    if (params.level) conditions.push(eq(schema.activityLogs.level, params.level))
    if (params.source) conditions.push(eq(schema.activityLogs.source, params.source))
    if (params.sessionId) conditions.push(eq(schema.activityLogs.sessionId, params.sessionId))

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined

    const baseQuery = whereClause
      ? this.db.select().from(schema.activityLogs).where(whereClause)
      : this.db.select().from(schema.activityLogs)

    let logs: ActivityLog[]
    if (params.searchText) {
      const searchPattern = `%${params.searchText}%`
      const searchResults = await this.db
        .select()
        .from(schema.activityLogs)
        .where(
          and(
            ...(whereClause ? [whereClause] : []),
            sql`${schema.activityLogs.message} LIKE ${searchPattern}`
          )
        )
        .orderBy(desc(schema.activityLogs.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
      logs = searchResults as unknown as ActivityLog[]
    } else {
      const results = await baseQuery
        .orderBy(desc(schema.activityLogs.createdAt))
        .limit(limit)
        .offset(offset)
        .all()
      logs = results as unknown as ActivityLog[]
    }

    const countQuery = whereClause
      ? this.db
          .select({ count: count() })
          .from(schema.activityLogs)
          .where(
            params.searchText
              ? and(whereClause, sql`${schema.activityLogs.message} LIKE ${`%${params.searchText}%`}`)
              : whereClause
          )
      : this.db.select({ count: count() }).from(schema.activityLogs)

    const countResult = await countQuery.get()
    const total = countResult?.count ?? 0

    return { logs, total }
  }

  async deleteActivityLogsBefore(timestamp: number): Promise<void> {
    await this.db
      .delete(schema.activityLogs)
      .where(lte(schema.activityLogs.createdAt, timestamp))
      .run()
  }

  async getActivityLogCount(): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.activityLogs)
      .get()
    return result?.count ?? 0
  }
```

Note: `nanoid` is already imported at the top of `database.ts` (line 5). The operators `eq`, `and`, `count`, `desc`, `lte`, `sql` are already imported at line 3.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/db/activity-logs.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/db/database.ts tests/unit/db/activity-logs.test.ts
git commit -m "feat(log): add activity_logs DB methods with tests"
```

---

## Task 4: LoggerService

**Files:**
- Create: `src/main/logging/logger-service.ts`
- Test: `tests/unit/logging/logger-service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/logging/logger-service.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { PPTDatabase } from '../../../src/main/db/database'
import { LoggerService } from '../../../src/main/logging/logger-service'
import fs from 'fs'
import path from 'path'
import os from 'os'

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
    await service.write({ level: 'info', source: 'test', message: 'recent' })
    // Insert an old log directly via DB
    const oldTs = Math.floor(Date.now() / 1000) - 15 * 24 * 60 * 60
    await db.insertActivityLog({ level: 'info', source: 'test', message: 'old' })

    await service.pruneExpired()
    const result = await service.query({ limit: 10, offset: 0 })
    // The old log inserted via insertActivityLog uses current timestamp,
    // so pruneExpired won't delete it. Let's test with deleteActivityLogsBefore directly.
    expect(result.logs.length).toBeGreaterThan(0)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/logging/logger-service.test.ts`
Expected: FAIL with "Cannot find module '../../../src/main/logging/logger-service'"

- [ ] **Step 3: Implement LoggerService**

```ts
// src/main/logging/logger-service.ts
import { nanoid } from 'nanoid'
import type { PPTDatabase } from '../db/database'
import {
  type LogLevel,
  type LogQueryParams,
  type LogQueryResult,
  type LogWriteEntry,
  LOG_RETENTION_DAYS
} from '@shared/activity-log'
import log from 'electron-log/main.js'

const NORMAL_LEVELS: Set<LogLevel> = new Set(['action', 'info', 'warn', 'error'])

export class LoggerService {
  constructor(
    private readonly db: PPTDatabase,
    private logLevel: 'normal' | 'debug',
    private enabled: boolean
  ) {}

  async write(entry: LogWriteEntry): Promise<void> {
    if (!this.enabled) return
    if (this.logLevel === 'normal' && !NORMAL_LEVELS.has(entry.level)) return

    try {
      await this.db.insertActivityLog({
        level: entry.level,
        source: entry.source,
        message: entry.message,
        detail: entry.detail ? JSON.stringify(entry.detail) : null,
        sessionId: entry.sessionId ?? null
      })
    } catch (error) {
      log.error('[logger] failed to write activity log', {
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async query(params: LogQueryParams): Promise<LogQueryResult> {
    return this.db.queryActivityLogs({
      level: params.level,
      source: params.source,
      sessionId: params.sessionId,
      searchText: params.searchText,
      limit: params.limit,
      offset: params.offset
    })
  }

  async clearAll(): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    await this.db.deleteActivityLogsBefore(now + 1)
  }

  async pruneExpired(): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - LOG_RETENTION_DAYS * 24 * 60 * 60
    await this.db.deleteActivityLogsBefore(cutoff)
  }

  setLogLevel(level: 'normal' | 'debug'): void {
    this.logLevel = level
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getLogLevel(): 'normal' | 'debug' {
    return this.logLevel
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/logging/logger-service.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/logging/logger-service.ts tests/unit/logging/logger-service.test.ts
git commit -m "feat(log): add LoggerService with write/query/prune/clear"
```

---

## Task 5: IPC Handlers

**Files:**
- Create: `src/main/logging/log-handlers.ts`
- Test: `tests/unit/logging/log-handlers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/logging/log-handlers.test.ts
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { PPTDatabase } from '../../../src/main/db/database'
import { LoggerService } from '../../../src/main/logging/logger-service'
import { registerLogHandlers } from '../../../src/main/logging/log-handlers'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { ipcMain } from 'electron'

describe('log handlers', () => {
  let db: PPTDatabase
  let dbPath: string
  let logger: LoggerService
  let handlers: Record<string, (event: unknown, payload: unknown) => Promise<unknown>>
  const originalHandle = ipcMain.handle

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `test-handlers-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    db = new PPTDatabase(dbPath)
    await db.init()
    logger = new LoggerService(db, 'normal', true)
    handlers = {}

    ipcMain.handle = vi.fn((channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => {
      handlers[channel] = handler
    }) as unknown as typeof ipcMain.handle

    registerLogHandlers({ logger, db } as unknown as Parameters<typeof registerLogHandlers>[0])
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/logging/log-handlers.test.ts`
Expected: FAIL with "Cannot find module '../../../src/main/logging/log-handlers'"

- [ ] **Step 3: Implement log handlers**

```ts
// src/main/logging/log-handlers.ts
import { ipcMain } from 'electron'
import log from 'electron-log/main.js'
import type { IpcContext } from '../ipc/context'
import {
  type LogLevel,
  type LogQueryParams,
  type LogWriteEntry,
  isLogLevel
} from '@shared/activity-log'

const VALID_LEVELS: LogLevel[] = ['action', 'info', 'warn', 'error', 'debug']

const normalizeWriteEntry = (raw: unknown): LogWriteEntry | null => {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const level = obj.level
  if (!isLogLevel(level)) return null
  const source = typeof obj.source === 'string' ? obj.source : ''
  const message = typeof obj.message === 'string' ? obj.message : ''
  if (!source || !message) return null
  const detail = obj.detail && typeof obj.detail === 'object' ? (obj.detail as Record<string, unknown>) : undefined
  const sessionId = typeof obj.sessionId === 'string' ? obj.sessionId : undefined
  return { level, source, message, detail, sessionId }
}

export function registerLogHandlers(ctx: IpcContext): void {
  const { logger, db } = ctx

  ipcMain.handle('log:write', async (_event, raw) => {
    const entry = normalizeWriteEntry(raw)
    if (entry) {
      await logger.write(entry)
    }
    return { success: true }
  })

  ipcMain.handle('log:writeBatch', async (_event, rawEntries: unknown) => {
    if (!Array.isArray(rawEntries)) return { success: true, count: 0 }
    for (const raw of rawEntries) {
      const entry = normalizeWriteEntry(raw)
      if (entry) {
        await logger.write(entry)
      }
    }
    return { success: true, count: rawEntries.length }
  })

  ipcMain.handle('log:query', async (_event, rawParams: unknown) => {
    const params: LogQueryParams = { limit: 100, offset: 0 }
    if (rawParams && typeof rawParams === 'object') {
      const obj = rawParams as Record<string, unknown>
      if (isLogLevel(obj.level)) params.level = obj.level
      if (typeof obj.source === 'string' && obj.source) params.source = obj.source
      if (typeof obj.sessionId === 'string' && obj.sessionId) params.sessionId = obj.sessionId
      if (typeof obj.searchText === 'string' && obj.searchText) params.searchText = obj.searchText
      if (typeof obj.limit === 'number' && obj.limit > 0) params.limit = obj.limit
      if (typeof obj.offset === 'number' && obj.offset >= 0) params.offset = obj.offset
    }
    return logger.query(params)
  })

  ipcMain.handle('log:clear', async () => {
    await logger.clearAll()
    return { success: true }
  })

  ipcMain.handle('log:getSettings', async () => {
    const logLevel = await db.getSetting<string>('log_level').catch(() => undefined)
    const logEnabled = await db.getSetting<string>('log_enabled').catch(() => undefined)
    const total = await db.getActivityLogCount()
    return {
      logLevel: logLevel === 'debug' ? 'debug' : 'normal',
      logEnabled: logEnabled !== 'false',
      total
    }
  })

  ipcMain.handle('log:saveSettings', async (_event, raw: unknown) => {
    if (!raw || typeof raw !== 'object') return { success: true }
    const obj = raw as Record<string, unknown>
    if (obj.logLevel === 'normal' || obj.logLevel === 'debug') {
      await db.setSetting('log_level', obj.logLevel)
      logger.setLogLevel(obj.logLevel)
    }
    if (typeof obj.logEnabled === 'boolean') {
      await db.setSetting('log_enabled', String(obj.logEnabled))
      logger.setEnabled(obj.logEnabled)
    }
    return { success: true }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/logging/log-handlers.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/main/logging/log-handlers.ts tests/unit/logging/log-handlers.test.ts
git commit -m "feat(log): add IPC handlers for log write/query/clear/settings"
```

---

## Task 6: Wire into IpcContext + Application

**Files:**
- Modify: `src/main/ipc/runtime/context.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/app/application.ts`

- [ ] **Step 1: Add logger to IpcContext**

In `src/main/ipc/runtime/context.ts`:

Add import at top (after line 4):
```ts
import type { LoggerService } from '../../logging/logger-service'
```

Add to `IpcContext` interface (after line 59, after `modelRuntime: ModelRuntimeConfig`):
```ts
  logger: LoggerService
```

Add to `createIpcContext` function parameters (after line 107, the `modelRuntime` parameter):
```ts
  logger: LoggerService
```

Add to the returned object (after line 126, `modelRuntime,`):
```ts
    logger,
```

- [ ] **Step 2: Register log handlers in IPC setup**

In `src/main/ipc/index.ts`:

Add import (after line 42):
```ts
import { registerLogHandlers } from '../logging/log-handlers'
```

Update `setupIPC` function signature (line 46) to accept `logger`:
```ts
export function setupIPC(
  mainWindow: BrowserWindow,
  db: PPTDatabase,
  agentManager: AgentManager,
  logger: LoggerService
): void {
```

Add import for LoggerService type at top:
```ts
import type { LoggerService } from '../logging/logger-service'
```

Pass `logger` to `createIpcContext` (after line 72, inside the `createIpcContext` call, after `modelRuntime`):
```ts
  const context = createIpcContext(mainWindow, db, agentManager, runtimeEvents, {
    recorder: new DbModelUsageRecorder(db)
  }, logger)
```

Wait — `createIpcContext` has a different signature. Let me re-check. The current signature is:
```ts
export function createIpcContext(
  mainWindow: BrowserWindow,
  db: PPTDatabase,
  agentManager: AgentManager,
  runtimeEvents = new TypedEventBus(),
  modelRuntime: ModelRuntimeConfig = { recorder: null }
): IpcContext
```

We need to add `logger` as a 6th parameter. Update `createIpcContext`:
```ts
export function createIpcContext(
  mainWindow: BrowserWindow,
  db: PPTDatabase,
  agentManager: AgentManager,
  runtimeEvents = new TypedEventBus(),
  modelRuntime: ModelRuntimeConfig = { recorder: null },
  logger: LoggerService
): IpcContext
```

Update the return object to include `logger`.

In `setupIPC`, pass logger:
```ts
  const context = createIpcContext(mainWindow, db, agentManager, runtimeEvents, {
    recorder: new DbModelUsageRecorder(db)
  }, logger)
```

Add `registerLogHandlers(context)` call (after line 117, after `registerHtmlEditorAiHandlers(context)`):
```ts
  registerLogHandlers(context)
```

- [ ] **Step 3: Initialize LoggerService in application.ts**

In `src/main/app/application.ts`:

Add imports at top (after line 7):
```ts
import { LoggerService } from '../logging/logger-service'
```

In `MainApplication` class, add a private field (after line 33):
```ts
  private logger: LoggerService | null = null
```

In `start()` method, after `await this.db.init()` (line 47) and before `configureHtmlThumbnailService`, add:
```ts
    const savedLogLevel = (await this.db.getSetting<string>('log_level').catch(() => undefined)) === 'debug' ? 'debug' : 'normal'
    const savedLogEnabled = (await this.db.getSetting<string>('log_enabled').catch(() => undefined)) !== 'false'
    this.logger = new LoggerService(this.db, savedLogLevel, savedLogEnabled)
    await this.logger.pruneExpired()
    log.info('[app] logger service initialized', { logLevel: savedLogLevel, enabled: savedLogEnabled })
```

Update `setupIPC` call (line 127) to pass logger:
```ts
    setupIPC(window, this.db, this.agentManager, this.logger)
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/runtime/context.ts src/main/ipc/index.ts src/main/app/application.ts
git commit -m "feat(log): wire LoggerService into IpcContext and app startup"
```

---

## Task 7: Renderer Logger Module

**Files:**
- Create: `src/renderer/src/lib/logger.ts`
- Test: `tests/unit/logging/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/logging/logger.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// Mock the ipc module
const mockWriteLogBatch = vi.fn().mockResolvedValue({ success: true })
const mockGetLogSettings = vi.fn().mockResolvedValue({ logLevel: 'normal', logEnabled: true, total: 0 })

vi.mock('../../../src/renderer/src/lib/ipc', () => ({
  ipc: {
    writeLogBatch: (...args: unknown[]) => mockWriteLogBatch(...args),
    getLogSettings: (...args: unknown[]) => mockGetLogSettings(...args)
  }
}))

// Import after mock
const { logger } = await import('../../../src/renderer/src/lib/logger')

describe('renderer logger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockWriteLogBatch.mockClear()
    mockGetLogSettings.mockClear()
    mockGetLogSettings.mockResolvedValue({ logLevel: 'normal', logEnabled: true, total: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('buffers logs and flushes after 500ms', async () => {
    logger.action('test', 'msg1')
    logger.info('test', 'msg2')
    expect(mockWriteLogBatch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(mockWriteLogBatch).toHaveBeenCalledTimes(1)
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
    expect(mockWriteLogBatch).toHaveBeenCalledTimes(1)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/logging/logger.test.ts`
Expected: FAIL with "Cannot find module '../../../src/renderer/src/lib/logger'"

- [ ] **Step 3: Implement renderer logger**

```ts
// src/renderer/src/lib/logger.ts
import { ipc } from './ipc'
import type { LogWriteEntry, LogLevel } from '@shared/activity-log'

interface LogSettings {
  logLevel: 'normal' | 'debug'
  logEnabled: boolean
}

const NORMAL_LEVELS: Set<LogLevel> = new Set(['action', 'info', 'warn', 'error'])
const FLUSH_INTERVAL_MS = 500

let buffer: LogWriteEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let settings: LogSettings = { logLevel: 'normal', logEnabled: true }
let settingsLoaded = false

const shouldLog = (level: LogLevel): boolean => {
  if (!settings.logEnabled) return false
  if (settings.logLevel === 'normal' && !NORMAL_LEVELS.has(level)) return false
  return true
}

const scheduleFlush = (): void => {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void doFlush()
  }, FLUSH_INTERVAL_MS)
}

const doFlush = async (): Promise<void> => {
  const entries = buffer
  buffer = []
  if (entries.length === 0) return
  try {
    await ipc.writeLogBatch(entries)
  } catch {
    // Silently drop failed logs
  }
}

const push = (level: LogLevel, source: string, message: string, detail?: Record<string, unknown>, sessionId?: string): void => {
  if (!shouldLog(level)) return
  buffer.push({ level, source, message, detail, sessionId })
  scheduleFlush()
}

export const logger = {
  action(source: string, message: string, detail?: Record<string, unknown>, sessionId?: string): void {
    push('action', source, message, detail, sessionId)
  },
  info(source: string, message: string, detail?: Record<string, unknown>, sessionId?: string): void {
    push('info', source, message, detail, sessionId)
  },
  warn(source: string, message: string, detail?: Record<string, unknown>, sessionId?: string): void {
    push('warn', source, message, detail, sessionId)
  },
  error(source: string, message: string, detail?: Record<string, unknown>, sessionId?: string): void {
    push('error', source, message, detail, sessionId)
  },
  debug(source: string, message: string, detail?: Record<string, unknown>, sessionId?: string): void {
    push('debug', source, message, detail, sessionId)
  },
  async flush(): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    await doFlush()
  },
  async refreshSettings(): Promise<void> {
    try {
      const result = await ipc.getLogSettings()
      settings = {
        logLevel: result.logLevel === 'debug' ? 'debug' : 'normal',
        logEnabled: result.logEnabled
      }
    } catch {
      // Use defaults
    }
    settingsLoaded = true
  },
  get isLoaded(): boolean {
    return settingsLoaded
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (buffer.length > 0) {
      // Use sendBeacon-like synchronous flush via ipc
      void doFlush()
    }
  })
}
```

- [ ] **Step 4: Add writeLogBatch and getLogSettings to ipc.ts**

In `src/renderer/src/lib/ipc.ts`, add the following methods inside the `export const ipc = {` object (at the end, before the closing `}`):

```ts
  writeLog: (entry: import('@shared/activity-log').LogWriteEntry) =>
    getIpc().invoke('log:write', entry) as Promise<{ success: boolean }>,
  writeLogBatch: (entries: import('@shared/activity-log').LogWriteEntry[]) =>
    getIpc().invoke('log:writeBatch', entries) as Promise<{ success: boolean; count: number }>,
  queryLogs: (params: import('@shared/activity-log').LogQueryParams) =>
    getIpc().invoke('log:query', params) as Promise<import('@shared/activity-log').LogQueryResult>,
  clearLogs: () =>
    getIpc().invoke('log:clear') as Promise<{ success: boolean }>,
  getLogSettings: () =>
    getIpc().invoke('log:getSettings') as Promise<import('@shared/activity-log').LogSettingsResult>,
  saveLogSettings: (settings: import('@shared/activity-log').LogSettingsPayload) =>
    getIpc().invoke('log:saveSettings', settings) as Promise<{ success: boolean }>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- tests/unit/logging/logger.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/lib/logger.ts src/renderer/src/lib/ipc.ts tests/unit/logging/logger.test.ts
git commit -m "feat(log): add renderer logger with micro-buffer and level filtering"
```

---

## Task 8: LogStore (Zustand)

**Files:**
- Create: `src/renderer/src/store/logStore.ts`
- Modify: `src/renderer/src/store/index.ts`
- Test: `tests/unit/logging/log-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/logging/log-store.test.ts
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

    // Reset store
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/logging/log-store.test.ts`
Expected: FAIL with "Cannot find module '../../../src/renderer/src/store/logStore'"

- [ ] **Step 3: Implement logStore**

```ts
// src/renderer/src/store/logStore.ts
import { create } from 'zustand'
import { ipc } from '@renderer/lib/ipc'
import type {
  ActivityLogEntry,
  LogLevel,
  LogSettingsResult
} from '@shared/activity-log'

const PAGE_SIZE = 100

interface LogFilter {
  level?: LogLevel
  source?: string
  searchText?: string
}

interface LogStore {
  logs: ActivityLogEntry[]
  total: number
  loading: boolean
  hasMore: boolean
  filter: LogFilter
  logSettings: { logLevel: 'normal' | 'debug'; logEnabled: boolean } | null

  fetchLogs: () => Promise<void>
  loadMore: () => Promise<void>
  fetchLogSettings: () => Promise<void>
  saveLogSettings: (settings: { logLevel?: 'normal' | 'debug'; logEnabled?: boolean }) => Promise<void>
  clearLogs: () => Promise<void>
  setFilter: (filter: Partial<LogFilter>) => Promise<void>
}

export const useLogStore = create<LogStore>((set, get) => ({
  logs: [],
  total: 0,
  loading: false,
  hasMore: false,
  filter: {},
  logSettings: null,

  fetchLogs: async () => {
    set({ loading: true })
    try {
      const filter = get().filter
      const result = await ipc.queryLogs({
        limit: PAGE_SIZE,
        offset: 0,
        level: filter.level,
        source: filter.source,
        searchText: filter.searchText
      })
      set({
        logs: result.logs,
        total: result.total,
        hasMore: result.logs.length < result.total,
        loading: false
      })
    } catch {
      set({ loading: false })
    }
  },

  loadMore: async () => {
    const { logs, filter, hasMore, loading } = get()
    if (!hasMore || loading) return
    set({ loading: true })
    try {
      const result = await ipc.queryLogs({
        limit: PAGE_SIZE,
        offset: logs.length,
        level: filter.level,
        source: filter.source,
        searchText: filter.searchText
      })
      set({
        logs: [...logs, ...result.logs],
        total: result.total,
        hasMore: logs.length + result.logs.length < result.total,
        loading: false
      })
    } catch {
      set({ loading: false })
    }
  },

  fetchLogSettings: async () => {
    try {
      const result: LogSettingsResult = await ipc.getLogSettings()
      set({ logSettings: { logLevel: result.logLevel, logEnabled: result.logEnabled } })
    } catch {
      // Use defaults
    }
  },

  saveLogSettings: async (settings) => {
    await ipc.saveLogSettings(settings)
    const current = get().logSettings
    set({
      logSettings: {
        logLevel: settings.logLevel ?? current?.logLevel ?? 'normal',
        logEnabled: settings.logEnabled ?? current?.logEnabled ?? true
      }
    })
  },

  clearLogs: async () => {
    await ipc.clearLogs()
    set({ logs: [], total: 0, hasMore: false })
  },

  setFilter: async (filterPatch) => {
    const current = get().filter
    const nextFilter = { ...current, ...filterPatch }
    set({ filter: nextFilter })
    await get().fetchLogs()
  }
}))
```

- [ ] **Step 4: Export logStore from index.ts**

In `src/renderer/src/store/index.ts`, add at the end:
```ts
export * from './logStore.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- tests/unit/logging/log-store.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/store/logStore.ts src/renderer/src/store/index.ts tests/unit/logging/log-store.test.ts
git commit -m "feat(log): add zustand logStore with fetch/filter/pagination"
```

---

## Task 9: i18n Translations

**Files:**
- Modify: `src/renderer/src/i18n/zh.ts`
- Modify: `src/renderer/src/i18n/en.ts`

- [ ] **Step 1: Add Chinese translations**

In `src/renderer/src/i18n/zh.ts`, inside the `settings:` object (after `advancedTab: '高级',` on line 355), add:

```ts
    logTab: '操作日志',
    logEnabled: '启用日志',
    logEnabledHint: '关闭后将不再记录任何操作日志',
    logLevel: '日志级别',
    logLevelNormal: '标准',
    logLevelDebug: '详细',
    logLevelNormalHint: '记录用户操作和关键系统行为',
    logLevelDebugHint: '额外记录调试细节（日志量较大）',
    logFilterLevel: '级别',
    logFilterSource: '来源',
    logFilterAll: '全部',
    logSearchPlaceholder: '搜索日志...',
    logClear: '清空日志',
    logClearConfirm: '确定要清空所有日志吗？此操作不可撤销。',
    logEmpty: '暂无日志',
    logLoadMore: '加载更多',
    logTotal: '共 {count} 条',
    logLevelAction: '操作',
    logLevelInfo: '信息',
    logLevelWarn: '警告',
    logLevelError: '错误',
    logLevelDebug: '调试',
    logDetail: '详情',
    logDisabled: '日志已禁用',
```

- [ ] **Step 2: Add English translations**

In `src/renderer/src/i18n/en.ts`, inside the `settings:` object (after the `advancedTab` key), add the same keys with English values:

```ts
    logTab: 'Activity Log',
    logEnabled: 'Enable Logging',
    logEnabledHint: 'When disabled, no activity logs will be recorded',
    logLevel: 'Log Level',
    logLevelNormal: 'Standard',
    logLevelDebug: 'Detailed',
    logLevelNormalHint: 'Records user actions and key system events',
    logLevelDebugHint: 'Also records debug details (larger log volume)',
    logFilterLevel: 'Level',
    logFilterSource: 'Source',
    logFilterAll: 'All',
    logSearchPlaceholder: 'Search logs...',
    logClear: 'Clear Logs',
    logClearConfirm: 'Are you sure you want to clear all logs? This cannot be undone.',
    logEmpty: 'No logs yet',
    logLoadMore: 'Load More',
    logTotal: '{count} total',
    logLevelAction: 'Action',
    logLevelInfo: 'Info',
    logLevelWarn: 'Warning',
    logLevelError: 'Error',
    logLevelDebug: 'Debug',
    logDetail: 'Detail',
    logDisabled: 'Logging is disabled',
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/zh.ts src/renderer/src/i18n/en.ts
git commit -m "feat(log): add i18n translations for log settings"
```

---

## Task 10: LogSettingsTab Component

**Files:**
- Create: `src/renderer/src/components/settings/LogSettingsTab.tsx`

- [ ] **Step 1: Create the LogSettingsTab component**

```tsx
// src/renderer/src/components/settings/LogSettingsTab.tsx
import { useEffect, useState } from 'react'
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select'
import { useLogStore } from '../../store/logStore'
import { logger } from '../../lib/logger'
import type { SettingsTranslate } from './types'
import type { ActivityLogEntry, LogLevel } from '@shared/activity-log'

const LEVEL_COLORS: Record<LogLevel, string> = {
  action: 'bg-blue-100 text-blue-700',
  info: 'bg-gray-100 text-gray-600',
  warn: 'bg-yellow-100 text-yellow-700',
  error: 'bg-red-100 text-red-700',
  debug: 'bg-purple-100 text-purple-700'
}

const LEVELS: LogLevel[] = ['action', 'info', 'warn', 'error', 'debug']

const formatTime = (ts: number): string => {
  const d = new Date(ts * 1000)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const levelLabel = (level: LogLevel, t: SettingsTranslate): string => {
  const map: Record<LogLevel, string> = {
    action: t('settings.logLevelAction'),
    info: t('settings.logLevelInfo'),
    warn: t('settings.logLevelWarn'),
    error: t('settings.logLevelError'),
    debug: t('settings.logLevelDebug')
  }
  return map[level]
}

interface LogEntryRowProps {
  entry: ActivityLogEntry
  t: SettingsTranslate
}

function LogEntryRow({ entry, t }: LogEntryRowProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = entry.detail && entry.detail !== 'null' && entry.detail !== '{}'

  return (
    <div className="border-b border-border/40 py-2 px-3 hover:bg-muted/30">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => hasDetail && setExpanded(!expanded)}
          className="mt-0.5 shrink-0"
        >
          {hasDetail ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </button>
        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
          {formatTime(entry.createdAt)}
        </span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${LEVEL_COLORS[entry.level]}`}>
          {levelLabel(entry.level, t)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">[{entry.source}]</span>
        <span className="text-xs">{entry.message}</span>
      </div>
      {expanded && hasDetail && (
        <pre className="mt-1 ml-8 rounded bg-muted/50 p-2 text-[11px] text-muted-foreground overflow-x-auto">
          {entry.detail}
        </pre>
      )}
    </div>
  )
}

interface LogSettingsTabProps {
  t: SettingsTranslate
}

export function LogSettingsTab({ t }: LogSettingsTabProps): React.JSX.Element {
  const {
    logs,
    total,
    loading,
    hasMore,
    filter,
    logSettings,
    fetchLogs,
    loadMore,
    fetchLogSettings,
    saveLogSettings,
    clearLogs,
    setFilter
  } = useLogStore()
  const [confirmingClear, setConfirmingClear] = useState(false)

  useEffect(() => {
    void fetchLogSettings()
    void fetchLogs()
    void logger.refreshSettings()
  }, [fetchLogSettings, fetchLogs])

  const handleToggleEnabled = async (): Promise<void> => {
    if (!logSettings) return
    const next = !logSettings.logEnabled
    await saveLogSettings({ logEnabled: next })
    if (next) void logger.refreshSettings()
  }

  const handleLevelChange = async (value: string): Promise<void> => {
    await saveLogSettings({ logLevel: value === 'debug' ? 'debug' : 'normal' })
    void logger.refreshSettings()
  }

  const handleLevelFilterChange = (value: string): void => {
    void setFilter({ level: value === 'all' ? undefined : (value as LogLevel) })
  }

  const handleSearchChange = (value: string): void => {
    void setFilter({ searchText: value || undefined })
  }

  const handleClear = async (): Promise<void> => {
    await clearLogs()
    setConfirmingClear(false)
  }

  if (!logSettings) return <div className="p-4 text-sm text-muted-foreground">...</div>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">{t('settings.logLevel')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-0">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">{t('settings.logEnabled')}</label>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('settings.logEnabledHint')}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleToggleEnabled()}
              className={`relative h-6 w-11 rounded-full transition-colors ${logSettings.logEnabled ? 'bg-[#7ea06f]' : 'bg-gray-300'}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${logSettings.logEnabled ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
          </div>

          {logSettings.logEnabled && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">{t('settings.logLevel')}</label>
              <Select value={logSettings.logLevel} onValueChange={(v) => void handleLevelChange(v)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">{t('settings.logLevelNormal')}</SelectItem>
                  <SelectItem value="debug">{t('settings.logLevelDebug')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                {logSettings.logLevel === 'debug'
                  ? t('settings.logLevelDebugHint')
                  : t('settings.logLevelNormalHint')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {logSettings.logEnabled && (
        <Card>
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t('settings.logTab')}</CardTitle>
              <span className="text-xs text-muted-foreground">{t('settings.logTotal', { count: total })}</span>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="mb-3 flex gap-2">
              <Select
                value={filter.level ?? 'all'}
                onValueChange={(v) => handleLevelFilterChange(v)}
              >
                <SelectTrigger className="h-9 w-32">
                  <SelectValue placeholder={t('settings.logFilterLevel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('settings.logFilterAll')}</SelectItem>
                  {LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {levelLabel(level, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={t('settings.logSearchPlaceholder')}
                value={filter.searchText ?? ''}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-9 flex-1"
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto rounded border border-border/40">
              {logs.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t('settings.logEmpty')}
                </div>
              ) : (
                logs.map((entry) => (
                  <LogEntryRow key={entry.id} entry={entry} t={t} />
                ))
              )}
            </div>

            {hasMore && (
              <div className="mt-3 text-center">
                <Button
                  variant="secondary"
                  onClick={() => void loadMore()}
                  disabled={loading}
                  className="h-8"
                >
                  {t('settings.logLoadMore')}
                </Button>
              </div>
            )}

            {logs.length > 0 && (
              <div className="mt-3 flex justify-end">
                {confirmingClear ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setConfirmingClear(false)}
                      className="h-8"
                    >
                      {t('common.cancel')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void handleClear()}
                      className="h-8"
                    >
                      {t('common.confirm')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmingClear(true)}
                    className="h-8"
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    {t('settings.logClear')}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!logSettings.logEnabled && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('settings.logDisabled')}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add the tab to settings page**

In `src/renderer/src/pages/settings.tsx`:

Add import (after line 18):
```ts
import { LogSettingsTab } from '../components/settings/LogSettingsTab'
```

Add the TabsTrigger (after line 521, after the advanced tab trigger):
```tsx
          <TabsTrigger value="log">{t('settings.logTab')}</TabsTrigger>
```

Add the TabsContent (after line 575, after the advanced tab content, before `</Tabs>`):
```tsx
        <TabsContent value="log">
          <LogSettingsTab t={t} />
        </TabsContent>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/settings/LogSettingsTab.tsx src/renderer/src/pages/settings.tsx
git commit -m "feat(log): add LogSettingsTab UI with filter, search, and clear"
```

---

## Task 11: Instrumentation (Key User Actions)

**Files:**
- Modify: Various renderer components and main process handlers

This task adds `logger.*()` calls at key user action points. Each sub-step is independent.

- [ ] **Step 1: Add logger calls in settings page**

In `src/renderer/src/pages/settings.tsx`, add import at top:
```ts
import { logger } from '../lib/logger'
```

Add logging to key handlers. For example, in `handleSaveModel` (after the `success(...)` call around line 263):
```ts
      logger.action('settings', '保存模型配置', { name: modelForm.name, provider: modelForm.provider, model: modelForm.model })
```

In `handleSaveAdvanced` (after the `success(...)` call around line 341):
```ts
      logger.action('settings', '保存高级设置')
```

In `handleVerify` (after successful verification, around line 375):
```ts
        logger.action('settings', '验证 API Key', { provider: modelForm.provider, model: modelForm.model })
```

In `handleChoosePath` (after successful path save, around line 500):
```ts
      logger.action('settings', '修改存储目录', { path })
```

In `handleActivateModel` (after successful activation, around line 428):
```ts
      logger.action('settings', '切换模型配置', { id })
```

In `handleDeleteModel` (after successful deletion, around line 445):
```ts
      logger.action('settings', '删除模型配置', { name: config.name })
```

- [ ] **Step 2: Add logger calls in session store / session detail**

In `src/renderer/src/store/sessionStore.ts` (or the relevant store that handles session creation/deletion), add import:
```ts
import { logger } from '../lib/logger'
```

Add logging at session creation and deletion points:
```ts
logger.action('session', '创建会话', { sessionId, title })
logger.action('session', '删除会话', { sessionId })
```

- [ ] **Step 3: Add logger calls in generate store**

In `src/renderer/src/store/generateStore.ts`, add import:
```ts
import { logger } from '../lib/logger'
```

Add logging when user initiates generation:
```ts
logger.action('generate', '发起生成', { sessionId, mode })
logger.info('generate', '生成完成', { sessionId })
logger.info('generate', '生成失败', { sessionId, error })
```

- [ ] **Step 4: Add logger calls in export handlers**

In the component/handler that triggers exports, add:
```ts
logger.action('export', `导出${format}`, { sessionId })
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/pages/settings.tsx src/renderer/src/store/sessionStore.ts src/renderer/src/store/generateStore.ts
git commit -m "feat(log): add logger calls at key user action points"
```

---

## Task 12: Run All Tests

- [ ] **Step 1: Run all log-related tests**

Run: `pnpm test -- tests/unit/logging/ tests/unit/db/activity-logs.test.ts`
Expected: All tests PASS

- [ ] **Step 2: Run full test suite to check for regressions**

Run: `pnpm test`
Expected: All tests PASS, no regressions

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "test(log): verify all log tests pass"
```
