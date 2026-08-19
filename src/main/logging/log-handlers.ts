import { ipcMain } from 'electron'
import type { IpcContext } from '../ipc/context'
import {
  type LogQueryParams,
  type LogWriteEntry,
  isLogLevel
} from '@shared/activity-log'

const normalizeWriteEntry = (raw: unknown): LogWriteEntry | null => {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const level = obj.level
  if (!isLogLevel(level)) return null
  const source = typeof obj.source === 'string' ? obj.source : ''
  const message = typeof obj.message === 'string' ? obj.message : ''
  if (!source || !message) return null
  const detail =
    obj.detail && typeof obj.detail === 'object'
      ? (obj.detail as Record<string, unknown>)
      : undefined
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
      if (typeof obj.sessionId === 'string' && obj.sessionId)
        params.sessionId = obj.sessionId
      if (typeof obj.searchText === 'string' && obj.searchText)
        params.searchText = obj.searchText
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
