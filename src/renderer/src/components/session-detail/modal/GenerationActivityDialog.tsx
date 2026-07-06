import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { ipc } from '@renderer/lib/ipc'
import { useT } from '@renderer/i18n'
import { useModelAction } from '@renderer/hooks/useModelAction'
import {
  shouldAutoCloseGenerationActivity,
  shouldHandleGenerationActivity,
  useGenerationActivityStore
} from '../../../store/generationActivityStore'
import { useSessionDetailUiStore } from '../../../store/sessionDetailStore'
import { useSessionStore } from '../../../store/sessionStore'
import { useToastStore } from '../../../store/toastStore'
import type { GenerateChunkEvent } from '@shared/generation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../ui/Dialog'
import { ScrollArea } from '../../ui/ScrollArea'
import { RetryFailedPagesButton } from './RetryFailedPagesButton'
import {
  buildGenerationActivityLogContent,
  resolveGenerationActivityStatus,
  type GenerationActivityStatus
} from './generationActivityLog'

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

const eventKind = (event: GenerateChunkEvent): ActivityKind => {
  if (event.type === 'run_error') return event.payload.cancelled ? 'cancelled' : 'error'
  if (event.type === 'page_failed') return 'error'
  if (
    'label' in event.payload &&
    typeof event.payload.label === 'string' &&
    /失败|failed/i.test(event.payload.label)
  ) {
    return 'error'
  }
  if (
    event.type === 'run_completed' ||
    event.type === 'page_generated' ||
    event.type === 'page_updated'
  ) {
    return 'success'
  }
  if (
    'label' in event.payload &&
    typeof event.payload.label === 'string' &&
    /重试|retry/i.test(event.payload.label)
  ) {
    return 'retry'
  }
  return 'progress'
}

export function GenerationActivityDialog({ sessionId }: { sessionId: string }): React.JSX.Element {
  const t = useT()
  const retryContext = useGenerationActivityStore((state) => state.retryContext)
  const failedPageCount = useGenerationActivityStore((state) => state.failedPageCount)
  const failedRunId = useGenerationActivityStore((state) => state.failedRunId)
  const { selectedModelConfigId, ensureModelActive } = useModelAction()
  const { error: toastError } = useToastStore()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<GenerationActivityStatus>('running')
  const [label, setLabel] = useState('')
  const [currentDetail, setCurrentDetail] = useState<string | undefined>()
  const [progress, setProgress] = useState(0)
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const runIdRef = useRef<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const activeSessionIdRef = useRef(sessionId)
  activeSessionIdRef.current = sessionId

  useEffect(() => {
    runIdRef.current = null
    setOpen(false)
    setStatus('running')
    setLabel('')
    setCurrentDetail(undefined)
    setProgress(0)
    setLogs([])
  }, [sessionId])

  useEffect(() => {
    const unsubscribe = ipc.onGenerateChunk((event) => {
      if (event.payload.sessionId !== sessionId) return
      if (event.type === 'assistant_message' || event.type === 'page_planned') return

      const activeRetryContext = useGenerationActivityStore.getState().retryContext
      const activityKind =
        'activityKind' in event.payload &&
        (event.payload.activityKind === 'edit' ||
          event.payload.activityKind === 'style-switch' ||
          event.payload.activityKind === 'single-page-retry' ||
          event.payload.activityKind === 'addPage')
          ? event.payload.activityKind
          : undefined
      if (!shouldHandleGenerationActivity(activityKind, activeRetryContext)) return

      const nextRunId = event.payload.runId
      const isNewRun = nextRunId !== runIdRef.current
      if (isNewRun) useGenerationActivityStore.getState().setFailedRun(null, 0)
      runIdRef.current = nextRunId
      const content = buildGenerationActivityLogContent(event, {
        processing: t('sessionDetail.activityProcessing'),
        completed: t('sessionDetail.activityCompleted'),
        runFailed: t('sessionDetail.activityRunFailed'),
        pageFailed: (page, title) =>
          t('sessionDetail.activityPageFailed', { page, title: title || '-' }),
        pageContext: (page, title) =>
          t('sessionDetail.activityPageContext', { page, title: title || '-' }),
        partialCompleted: (count) => t('sessionDetail.activityPartialCompleted', { count }),
        unknownError: t('sessionDetail.activityUnknownError')
      })
      const nextLabel = content.label
      const nextKind = eventKind(event)
      const nextLog: ActivityLog = {
        id: crypto.randomUUID(),
        kind: nextKind,
        label: nextLabel,
        detail: content.detail,
        createdAt: Date.now()
      }

      const nextFailedPageCount =
        'failedPageCount' in event.payload && typeof event.payload.failedPageCount === 'number'
          ? event.payload.failedPageCount
          : 0
      if (event.type === 'run_completed' || event.type === 'run_error') {
        useGenerationActivityStore
          .getState()
          .setFailedRun(nextFailedPageCount > 0 ? nextRunId : null, nextFailedPageCount)
      }
      if (shouldAutoCloseGenerationActivity(event.type, nextFailedPageCount)) {
        setOpen(false)
        useGenerationActivityStore.getState().reset()
        if (activityKind === 'style-switch' || activeRetryContext?.kind === 'style-switch') {
          void useSessionStore
            .getState()
            .loadSession(sessionId, () => activeSessionIdRef.current === sessionId)
            .then(() => {
              if (activeSessionIdRef.current === sessionId) {
                useSessionDetailUiStore.getState().bumpPreviewKey()
              }
            })
        }
        return
      }

      setOpen(true)
      setLabel(nextLabel)
      setCurrentDetail(content.detail)
      setStatus(resolveGenerationActivityStatus(event, nextFailedPageCount))
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

  // 失败后保留弹窗：用户必须先点「重试失败页面」把状态推进，不能直接关掉丢掉重试入口。
  // 这避免了「关掉后 styleId 已提交、retryContext 已 reset、再也无法重试」的死锁。
  const blockClose = status === 'running' || (retryContext !== null && failedPageCount > 0)

  const requestClose = (nextOpen: boolean): void => {
    if (!nextOpen && blockClose) return
    setOpen(nextOpen)
    if (!nextOpen) useGenerationActivityStore.getState().reset()
  }

  const handleRetryFailedPages = async (): Promise<void> => {
    if (!retryContext || failedPageCount <= 0 || status === 'running') return
    const modelConfigId = await ensureModelActive(selectedModelConfigId)
    if (!modelConfigId) return
    setStatus('running')
    setLabel(t('sessionDetail.activityRetrying'))
    setCurrentDetail(undefined)
    try {
      const result =
        retryContext.kind === 'style-switch'
          ? await ipc.retrySessionStyle({
              sessionId,
              styleId: retryContext.styleId,
              modelConfigId,
              failedRunId: failedRunId || undefined
            })
          : await ipc.retryDeckEdit({
              ...retryContext.payload,
              sessionId,
              modelConfigId,
              failedRunId: failedRunId || undefined
            })
      if (result.alreadyRunning) return
      if (!result.runId && result.failedPageCount === 0) {
        if (retryContext.kind === 'style-switch') {
          setOpen(false)
          useGenerationActivityStore.getState().reset()
          await useSessionStore
            .getState()
            .loadSession(sessionId, () => activeSessionIdRef.current === sessionId)
          if (activeSessionIdRef.current === sessionId) {
            useSessionDetailUiStore.getState().bumpPreviewKey()
          }
        } else {
          setStatus('completed')
          setLabel(t('sessionDetail.activityCompleted'))
          useGenerationActivityStore.getState().reset()
        }
      }
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : t('common.retryLater')
      setStatus('failed')
      setLabel(message)
      setCurrentDetail(message)
      toastError(t('sessionDetail.activityRetryFailed'), { description: message })
    }
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
        showClose={!blockClose}
        className="max-w-[500px] gap-3 bg-[#fff9ef] p-3.5"
        onEscapeKeyDown={(event) => {
          if (blockClose) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (blockClose) event.preventDefault()
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
                    {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                  </div>
                  <div className="break-words">
                    {item.label}
                    {item.detail && item.detail !== item.label ? ` · ${item.detail}` : ''}
                  </div>
                </div>
              )
            })}
            {status === 'running' ? (
              <div className="flex items-start gap-2 rounded-lg border border-[#e4d9c3]/70 bg-white/46 px-2.5 py-1.5 text-xs text-[#a09882] shadow-[0_6px_14px_rgba(93,107,77,0.06)]">
                <Loader2 className="mt-1 h-3 w-3 shrink-0 animate-spin" />
                <div className="min-w-0">
                  <div className="break-words text-[#667457]">{label}</div>
                  {currentDetail && currentDetail !== label ? (
                    <div className="mt-0.5 break-words text-[11px] leading-4 text-[#9a8f7b]">
                      {currentDetail}
                    </div>
                  ) : null}
                </div>
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

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 truncate text-xs text-[#746854]">{statusText}</div>
          {retryContext && failedPageCount > 0 && status !== 'running' ? (
            <RetryFailedPagesButton
              loading={false}
              label={t('sessionDetail.activityRetryFailedPages', { count: failedPageCount })}
              loadingLabel={t('sessionDetail.activityRetrying')}
              onClick={() => void handleRetryFailedPages()}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
