import { create } from 'zustand'
import { ipc } from '@renderer/lib/ipc'
import type { ActivityLogEntry, LogLevel, LogSettingsResult } from '@shared/activity-log'

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
  saveLogSettings: (settings: {
    logLevel?: 'normal' | 'debug'
    logEnabled?: boolean
  }) => Promise<void>
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
      set({
        logSettings: { logLevel: result.logLevel, logEnabled: result.logEnabled }
      })
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
