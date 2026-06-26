import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import {
  useGenerateStore,
  resetSessionDetailEditingStores,
  useSessionDetailUiStore,
  useSessionStore,
  useToastStore
} from '@renderer/store'
import { HISTORY_VERSION_LIMIT, type HistoryVersion } from '@shared/history.js'
import { Button } from '../../ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/Dialog'

interface HistoryDialogProps {
  sessionId: string
}

function formatHistoryTime(value: number): string {
  const timestamp = value > 1e12 ? value : value * 1000
  const parsed = dayjs(timestamp)
  if (!parsed.isValid()) return ''
  return parsed.format('YYYY/MM/DD HH:mm')
}

export function HistoryDialog({ sessionId }: HistoryDialogProps): React.JSX.Element | null {
  const t = useT()
  const open = useSessionDetailUiStore((state) => state.historyDialogOpen)
  const setOpen = useSessionDetailUiStore((state) => state.setHistoryDialogOpen)
  const isAddingPage = useSessionDetailUiStore((state) => state.isAddingPage)
  const isRetryingSinglePage = useSessionDetailUiStore((state) => state.isRetryingSinglePage)
  const isManagingPages = useSessionDetailUiStore((state) => state.isManagingPages)
  const isGenerating = useGenerateStore((state) => state.isGenerating)
  const currentSession = useSessionStore((state) => state.currentSession)
  const loadSession = useSessionStore((state) => state.loadSession)
  const toastError = useToastStore((state) => state.error)
  const toastSuccess = useToastStore((state) => state.success)
  const [versions, setVersions] = useState<HistoryVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [rollbackId, setRollbackId] = useState<string | null>(null)
  const [rollbackConfirmVersion, setRollbackConfirmVersion] = useState<HistoryVersion | null>(null)
  const visibleVersions = versions.slice(0, HISTORY_VERSION_LIMIT)

  const sessionStatus =
    currentSession && typeof (currentSession as { status?: unknown }).status === 'string'
      ? String((currentSession as { status?: unknown }).status)
      : ''
  const historyDisabled =
    isGenerating ||
    isAddingPage ||
    isRetryingSinglePage ||
    isManagingPages ||
    rollbackId !== null ||
    sessionStatus === 'active'

  const loadHistoryVersions = async (): Promise<void> => {
    if (!sessionId) return
    setLoading(true)
    try {
      const nextVersions = await ipc.listHistoryVersions({
        sessionId,
        limit: HISTORY_VERSION_LIMIT
      })
      setVersions(nextVersions)
    } catch (err) {
      toastError(err instanceof Error ? err.message : t('sessionDetail.historyLoadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || !sessionId) return
    void loadHistoryVersions()
  }, [open, sessionId])

  const handleRollbackHistory = async (version: HistoryVersion): Promise<void> => {
    if (!sessionId || version.isCurrent || historyDisabled) return
    setRollbackId(version.id)
    setRollbackConfirmVersion(null)
    try {
      await ipc.rollbackToHistoryVersion({ sessionId, versionId: version.id })
      resetSessionDetailEditingStores()
      await loadSession(sessionId)
      useGenerateStore.getState().setPages(useSessionStore.getState().currentGeneratedPages)
      useSessionDetailUiStore.getState().bumpPreviewKey()
      await loadHistoryVersions()
      toastSuccess(t('sessionDetail.historyRollbackSuccess'))
      setOpen(false)
    } catch (err) {
      toastError(err instanceof Error ? err.message : t('sessionDetail.historyRollbackFailed'))
    } finally {
      setRollbackId(null)
    }
  }

  const requestRollbackHistory = (version: HistoryVersion): void => {
    if (version.isCurrent || historyDisabled || rollbackId) return
    setRollbackConfirmVersion(version)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex max-h-[min(640px,78vh)] w-[560px] flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e8e0d0] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-[#2f3a2a]">
              {t('sessionDetail.historyTitle')}
            </h3>
            <p className="mt-1 text-xs text-[#8a9a7b]">{t('sessionDetail.historyRecent')}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 py-1 text-sm text-[#6f7d62] hover:bg-[#f2efe7]"
            disabled={Boolean(rollbackId)}
          >
            {t('common.cancel')}
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm text-[#8a9a7b]">
              {t('sessionDetail.historyLoading')}
            </div>
          ) : versions.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-[#3e4a32]">
                {t('sessionDetail.historyEmptyTitle')}
              </p>
              <p className="mt-2 text-xs text-[#8a9a7b]">
                {t('sessionDetail.historyEmptyDescription')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleVersions.map((version) => {
                const rollbackDisabled =
                  version.isCurrent ||
                  !version.isRestorable ||
                  historyDisabled ||
                  Boolean(rollbackId)
                return (
                  <div
                    key={version.id}
                    className="rounded-xl border border-[#e8e0d0] bg-[#faf8f2] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[#2f3a2a]">
                            {version.title}
                          </p>
                          {version.isCurrent && (
                            <span className="rounded-full bg-[#d4e4c1] px-2 py-0.5 text-[10px] font-medium text-[#3e4a32]">
                              {t('sessionDetail.historyCurrent')}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[#8a9a7b]">
                          {formatHistoryTime(version.createdAt)}
                        </p>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#5d6b4d]">
                          {version.description}
                        </p>
                        {version.changedPages.length > 0 && (
                          <p className="mt-2 text-[11px] text-[#7b6d55]">
                            {t('sessionDetail.historyChangedPages', {
                              pages: version.changedPages.join('、')
                            })}
                          </p>
                        )}
                      </div>
                      {!version.isCurrent && (
                        <button
                          type="button"
                          disabled={rollbackDisabled}
                          onClick={() => requestRollbackHistory(version)}
                          className="shrink-0 rounded-lg bg-[#3e4a32] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#2f3a2a] disabled:cursor-not-allowed disabled:bg-[#c8c0b3]"
                        >
                          {rollbackId === version.id
                            ? t('sessionDetail.historyRollingBack')
                            : t('sessionDetail.historyRollback')}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      <Dialog
        open={Boolean(rollbackConfirmVersion)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !rollbackId) setRollbackConfirmVersion(null)
        }}
      >
        <DialogContent showClose={false}>
          <DialogHeader>
            <DialogTitle>{t('sessionDetail.historyRollback')}</DialogTitle>
            <DialogDescription>{t('sessionDetail.historyRollbackConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRollbackConfirmVersion(null)}
              disabled={Boolean(rollbackId)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                rollbackConfirmVersion && void handleRollbackHistory(rollbackConfirmVersion)
              }
              disabled={Boolean(rollbackId)}
            >
              {rollbackId
                ? t('sessionDetail.historyRollingBack')
                : t('sessionDetail.historyRollback')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
