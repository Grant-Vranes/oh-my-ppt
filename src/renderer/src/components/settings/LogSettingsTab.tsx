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
    action: t('settings.logLevelLabelAction'),
    info: t('settings.logLevelLabelInfo'),
    warn: t('settings.logLevelLabelWarn'),
    error: t('settings.logLevelLabelError'),
    debug: t('settings.logLevelLabelDebug')
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
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('settings.logRetentionHint', { days: 14 })}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={logSettings.logEnabled}
              onClick={() => void handleToggleEnabled()}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8eaa70]/45 ${logSettings.logEnabled ? 'bg-[#18181b]' : 'bg-input'}`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${logSettings.logEnabled ? 'translate-x-5' : 'translate-x-0'}`}
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
