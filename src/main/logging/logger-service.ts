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
