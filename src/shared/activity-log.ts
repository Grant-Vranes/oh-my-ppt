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
