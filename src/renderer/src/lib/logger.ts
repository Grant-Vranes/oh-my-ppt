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

const push = (
  level: LogLevel,
  source: string,
  message: string,
  detail?: Record<string, unknown>,
  sessionId?: string
): void => {
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
  },
  reset(): void {
    buffer = []
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    settings = { logLevel: 'normal', logEnabled: true }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (buffer.length > 0) {
      void doFlush()
    }
  })
}
