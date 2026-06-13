import { useEffect, useRef, useState } from 'react'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { ipc } from '@renderer/lib/ipc'
import { useT } from '@renderer/i18n'
import type { GenerateChunkEvent } from '@shared/generation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../ui/Dialog'
import { ScrollArea } from '../../ui/ScrollArea'

type ActivityStatus = 'running' | 'completed' | 'cancelled' | 'failed'
type ActivityKind = 'progress' | 'success' | 'retry' | 'error' | 'cancelled'

type ActivityLog = {
  id: string
  kind: ActivityKind
  label: string
  detail?: string
  createdAt: number
}

const eventProgress = (event: GenerateChunkEvent): number | undefined =>
  'progress' in event.payload && typeof event.payload.progress === 'number'
    ? event.payload.progress
    : undefined

const eventLabel = (event: GenerateChunkEvent): string | undefined =>
  'label' in event.payload && typeof event.payload.label === 'string'
    ? event.payload.label
    : undefined

const eventDetail = (event: GenerateChunkEvent): string | undefined =>
  'detail' in event.payload && typeof event.payload.detail === 'string'
    ? event.payload.detail
    : undefined

const eventKind = (event: GenerateChunkEvent): ActivityKind => {
  if (event.type === 'run_error') return event.payload.cancelled ? 'cancelled' : 'error'
  if (event.type === 'page_failed') return 'error'
  if (
    event.type === 'run_completed' ||
    event.type === 'page_generated' ||
    event.type === 'page_updated'
  ) {
    return 'success'
  }
  if (/重试|retry/i.test(eventLabel(event) || '')) return 'retry'
  return 'progress'
}

export function GenerationActivityDialog({ sessionId }: { sessionId: string }): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<ActivityStatus>('running')
  const [label, setLabel] = useState('')
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const runIdRef = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubscribe = ipc.onGenerateChunk((event) => {
      if (event.payload.sessionId !== sessionId) return
      if (event.type === 'assistant_message' || event.type === 'page_planned') return

      const nextRunId = event.payload.runId
      const isNewRun = nextRunId !== runIdRef.current
      runIdRef.current = nextRunId
      const fallbackLabel =
        event.type === 'run_completed'
          ? t('sessionDetail.activityCompleted')
          : event.type === 'run_error'
            ? event.payload.message
            : t('sessionDetail.activityProcessing')
      const nextLabel = eventLabel(event) || fallbackLabel
      const nextKind = eventKind(event)
      const nextLog: ActivityLog = {
        id: crypto.randomUUID(),
        kind: nextKind,
        label: nextLabel,
        detail: eventDetail(event),
        createdAt: Date.now()
      }

      setOpen(true)
      setLabel(nextLabel)
      setStatus(
        event.type === 'run_completed'
          ? 'completed'
          : event.type === 'run_error'
            ? event.payload.cancelled
              ? 'cancelled'
              : 'failed'
            : 'running'
      )
      setProgress((current) => {
        if (event.type === 'run_completed') return 100
        const next = eventProgress(event)
        return isNewRun ? Math.max(0, next ?? 0) : Math.max(current, next ?? current)
      })
      setLogs((current) => {
        const base = isNewRun ? [] : current
        const previous = base[base.length - 1]
        const duplicate =
          previous?.kind === nextLog.kind &&
          previous.label === nextLog.label &&
          previous.detail === nextLog.detail
        return duplicate ? [...base.slice(0, -1), nextLog] : [...base, nextLog].slice(-80)
      })
    })
    return () => unsubscribe?.()
  }, [sessionId, t])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  const requestClose = (nextOpen: boolean): void => {
    if (!nextOpen && status === 'running') return
    setOpen(nextOpen)
  }

  const statusText =
    status === 'completed'
      ? t('sessionDetail.activityStatusCompleted')
      : status === 'cancelled'
        ? t('sessionDetail.activityStatusCancelled')
        : status === 'failed'
          ? t('sessionDetail.activityStatusFailed')
          : t('sessionDetail.activityStatusRunning')

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        showClose={status !== 'running'}
        className="max-w-[500px] gap-3 bg-[#fff9ef] p-3.5"
        onEscapeKeyDown={(event) => {
          if (status === 'running') event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (status === 'running') event.preventDefault()
        }}
      >
        <DialogHeader className="min-h-8 justify-center pr-14">
          <div className="flex min-w-0 items-center gap-1.5">
            <Sparkles className="h-4 w-4 shrink-0 text-[#6f8159]" />
            <DialogTitle className="truncate text-sm text-[#495a3b]">
              {t('sessionDetail.activityTitle')}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            {t('sessionDetail.activityDescription')}
          </DialogDescription>
          <span className="absolute right-11 top-3.5 inline-flex h-6 min-w-11 items-center justify-center rounded-md border border-[#b8d3a6] bg-[#edf6e8] px-2 text-[11px] font-semibold tabular-nums text-[#365528]">
            {Math.round(progress)}%
          </span>
        </DialogHeader>

        <ScrollArea
          className="h-[320px] rounded-lg border border-[#e4d9c3]/55 bg-[#fffaf1]/38"
          viewportClassName="p-2"
        >
          <div className="space-y-2">
            {logs.map((item) => {
              const isError = item.kind === 'error' || item.kind === 'cancelled'
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs leading-5 shadow-[0_6px_14px_rgba(93,107,77,0.06)] ${
                    isError
                      ? 'border-[#d7b5ae]/70 bg-[#fff8f4]/72 text-[#93564f]'
                      : 'border-[#e4d9c3]/70 bg-white/46 text-[#5a674c]'
                  }`}
                >
                  <div className="mb-0.5 text-[10px] leading-4 tabular-nums text-[#a09882]">
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </div>
                  <div className="break-words">
                    {item.label}
                    {item.detail && item.detail !== item.label ? ` · ${item.detail}` : ''}
                  </div>
                </div>
              )
            })}
            {status === 'running' ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#e4d9c3]/70 bg-white/46 px-2.5 py-1.5 text-xs text-[#a09882] shadow-[0_6px_14px_rgba(93,107,77,0.06)]">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                <span className="min-w-0 truncate">{label}</span>
              </div>
            ) : status === 'failed' || status === 'cancelled' ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#d7b5ae]/70 bg-[#fff8f4]/72 px-2.5 py-1.5 text-xs text-[#93564f] shadow-[0_6px_14px_rgba(93,107,77,0.06)]">
                <CircleAlert className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{label}</span>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>
        </ScrollArea>

        <div className="truncate text-xs text-[#746854]">{statusText}</div>
      </DialogContent>
    </Dialog>
  )
}
