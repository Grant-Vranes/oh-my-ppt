import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Files, Loader2, Search } from 'lucide-react'
import { useT } from '@renderer/i18n'
import { ipc, type MergeSourcePageSummary, type MergeSourceSessionSummary } from '@renderer/lib/ipc'
import { useGenerateStore, useSessionDetailUiStore, useToastStore } from '@renderer/store'
import { readPageMergeErrorCode } from '@shared/page-merge'
import type { PageMergeDisabledReason } from '@shared/page-merge'
import { requireSlideSize } from '@shared/slide-size'
import { PreviewIframe } from '../../preview/PreviewIframe'
import { Button } from '../../ui/Button'
import { Checkbox } from '../../ui/Checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/Dialog'
import { Input } from '../../ui/Input'
import { ScrollArea } from '../../ui/ScrollArea'
import { usePreviewWindow } from '../hooks/usePreviewWindow'

interface MergeSessionPagesDialogProps {
  sessionId: string
}

const MAX_MERGE_PAGE_COUNT = 50
const MERGE_PREVIEW_LIMIT = 6

function MergePagePreview({
  page,
  renderPreview
}: {
  page: MergeSourcePageSummary
  renderPreview: boolean
}): React.JSX.Element {
  const slideSize = requireSlideSize({
    id: page.slideSizeId,
    width: page.slideWidth,
    height: page.slideHeight
  })

  return (
    <div
      className="h-full w-full overflow-hidden"
      style={{ aspectRatio: `${slideSize.width}/${slideSize.height}` }}
    >
      {renderPreview && (page.htmlPath || page.sourceUrl) ? (
        <PreviewIframe
          src={page.sourceUrl}
          htmlPath={page.htmlPath}
          pageId={page.pageId}
          title={`merge-source-page-${page.pageNumber}`}
          slideSize={slideSize}
          inspectable={false}
          thumbnail
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-[#8a806f]">
          P{page.pageNumber}
        </div>
      )}
    </div>
  )
}

export function MergeSessionPagesDialog({
  sessionId
}: MergeSessionPagesDialogProps): React.JSX.Element {
  const t = useT()
  const open = useSessionDetailUiStore((state) => state.mergeSessionPagesDialogOpen)
  const setOpen = useSessionDetailUiStore((state) => state.setMergeSessionPagesDialogOpen)
  const setIsAddingPage = useSessionDetailUiStore((state) => state.setIsAddingPage)
  const toastSuccess = useToastStore((state) => state.success)
  const toastError = useToastStore((state) => state.error)
  const toastWarning = useToastStore((state) => state.warning)
  const [query, setQuery] = useState('')
  const [sourceSessions, setSourceSessions] = useState<MergeSourceSessionSummary[]>([])
  const [selectedSourceSessionId, setSelectedSourceSessionId] = useState('')
  const [sourcePages, setSourcePages] = useState<MergeSourcePageSummary[]>([])
  const [selectedSourcePageIds, setSelectedSourcePageIds] = useState<Set<string>>(() => new Set())
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingPages, setLoadingPages] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const pageRequestIdRef = useRef(0)

  const getRequestErrorMessage = useCallback(
    (
      error: unknown,
      fallbackKey: 'sessionDetail.mergeLoadFailed' | 'sessionDetail.mergePagesFailed'
    ): string => {
      switch (readPageMergeErrorCode(error)) {
        case 'PAGE_MERGE_INVALID_REQUEST':
          return t('sessionDetail.mergeErrorInvalidRequest')
        case 'PAGE_MERGE_SAME_SESSION':
          return t('sessionDetail.mergeErrorSameSession')
        case 'PAGE_MERGE_NO_PAGE_SELECTED':
          return t('sessionDetail.mergeErrorNoPageSelected')
        case 'PAGE_MERGE_PAGE_LIMIT_EXCEEDED':
          return t('sessionDetail.mergeErrorPageLimit')
        case 'PAGE_MERGE_SESSION_NOT_FOUND':
          return t('sessionDetail.mergeErrorSessionNotFound')
        case 'PAGE_MERGE_SESSION_BUSY':
          return t('sessionDetail.mergeErrorSessionBusy')
        case 'PAGE_MERGE_SLIDE_SIZE_MISMATCH':
          return t('sessionDetail.mergeErrorSlideSizeMismatch')
        case 'PAGE_MERGE_SOURCE_PAGE_NOT_FOUND':
          return t('sessionDetail.mergeErrorPageNotFound')
        case 'PAGE_MERGE_SOURCE_PAGE_UNAVAILABLE':
          return t('sessionDetail.mergeErrorPageUnavailable')
        case 'PAGE_MERGE_TARGET_FONT_UNAVAILABLE':
          return t('sessionDetail.mergeErrorTargetFont')
        case 'PAGE_MERGE_PAGE_COPY_FAILED':
          return t('sessionDetail.mergeErrorPageCopy')
        default:
          return t(fallbackKey)
      }
    },
    [t]
  )

  const getDisabledReason = useCallback(
    (reason?: PageMergeDisabledReason): string => {
      switch (reason) {
        case 'PAGE_MERGE_SESSION_BUSY':
          return t('sessionDetail.mergeDisabledSessionBusy')
        case 'PAGE_MERGE_SESSION_EMPTY':
          return t('sessionDetail.mergeDisabledSessionEmpty')
        case 'PAGE_MERGE_SLIDE_SIZE_MISMATCH':
          return t('sessionDetail.mergeDisabledSlideSizeMismatch')
        case 'PAGE_MERGE_PAGE_INCOMPLETE':
          return t('sessionDetail.mergeDisabledPageIncomplete')
        case 'PAGE_MERGE_PAGE_FILE_MISSING':
          return t('sessionDetail.mergeDisabledPageMissing')
        default:
          return ''
      }
    },
    [t]
  )

  const selectedSourceSession = sourceSessions.find(
    (session) => session.id === selectedSourceSessionId
  )
  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    if (!keyword) return sourceSessions
    return sourceSessions.filter((session) => session.title.toLocaleLowerCase().includes(keyword))
  }, [query, sourceSessions])
  const selectablePageIds = useMemo(
    () => sourcePages.filter((page) => page.selectable).map((page) => page.id),
    [sourcePages]
  )
  const sourcePageIds = useMemo(() => sourcePages.map((page) => page.id), [sourcePages])
  const selectablePageCount = Math.min(selectablePageIds.length, MAX_MERGE_PAGE_COUNT)
  const allSelectablePagesSelected =
    selectablePageCount > 0 && selectedSourcePageIds.size === selectablePageCount
  const {
    activePreviewIds: previewPageIds,
    viewportRef: pageViewportRef,
    schedulePreviewWindowUpdate
  } = usePreviewWindow({
    enabled: open && !loadingPages && sourcePages.length > 0,
    itemIds: sourcePageIds,
    limit: MERGE_PREVIEW_LIMIT
  })

  useEffect(() => {
    if (!open || !sessionId) return
    let cancelled = false
    setLoadingSessions(true)
    setLoadError('')
    void ipc
      .listMergeSourceSessions({ targetSessionId: sessionId })
      .then((sessions) => {
        if (cancelled) return
        setSourceSessions(sessions)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(getRequestErrorMessage(error, 'sessionDetail.mergeLoadFailed'))
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false)
      })
    return () => {
      cancelled = true
    }
  }, [getRequestErrorMessage, open, sessionId])

  useEffect(() => {
    if (open) return
    pageRequestIdRef.current += 1
    setQuery('')
    setSourceSessions([])
    setSelectedSourceSessionId('')
    setSourcePages([])
    setSelectedSourcePageIds(new Set())
    setLoadingSessions(false)
    setLoadingPages(false)
    setSubmitting(false)
    setLoadError('')
  }, [open])

  const handleSelectSession = async (sourceSession: MergeSourceSessionSummary): Promise<void> => {
    if (!sourceSession.selectable || loadingPages || submitting) return
    const requestId = pageRequestIdRef.current + 1
    pageRequestIdRef.current = requestId
    setSelectedSourceSessionId(sourceSession.id)
    setSelectedSourcePageIds(new Set())
    setSourcePages([])
    setLoadingPages(true)
    setLoadError('')
    try {
      const pages = await ipc.listMergeSourcePages({
        targetSessionId: sessionId,
        sourceSessionId: sourceSession.id
      })
      if (pageRequestIdRef.current !== requestId) return
      setSourcePages(pages)
    } catch (error) {
      if (pageRequestIdRef.current !== requestId) return
      setLoadError(getRequestErrorMessage(error, 'sessionDetail.mergeLoadFailed'))
    } finally {
      if (pageRequestIdRef.current === requestId) setLoadingPages(false)
    }
  }

  const togglePage = (page: MergeSourcePageSummary): void => {
    if (!page.selectable || submitting) return
    setSelectedSourcePageIds((current) => {
      const next = new Set(current)
      if (next.has(page.id)) next.delete(page.id)
      else if (next.size < MAX_MERGE_PAGE_COUNT) next.add(page.id)
      else toastWarning(t('sessionDetail.mergePageLimitReached', { count: MAX_MERGE_PAGE_COUNT }))
      return next
    })
  }

  const handleToggleAll = (): void => {
    setSelectedSourcePageIds((current) =>
      current.size === selectablePageCount
        ? new Set()
        : new Set(selectablePageIds.slice(0, MAX_MERGE_PAGE_COUNT))
    )
  }

  const handleConfirm = async (): Promise<void> => {
    if (!selectedSourceSessionId || selectedSourcePageIds.size === 0 || submitting) return
    setSubmitting(true)
    setIsAddingPage(true)
    try {
      const result = await ipc.mergeSessionPages({
        targetSessionId: sessionId,
        sourceSessionId: selectedSourceSessionId,
        sourcePageIds: Array.from(selectedSourcePageIds)
      })
      useGenerateStore.getState().setPages(result.generatedPages)
      useSessionDetailUiStore.getState().bumpPreviewKey()
      useSessionDetailUiStore.getState().finishAddPage(result.selectedPageId)
      void ipc
        .clearSpeechScript(sessionId)
        .catch((error) => console.warn('[speech] clearSpeechScript failed', error))
      toastSuccess(
        t('sessionDetail.mergePagesSuccess', {
          session: selectedSourceSession?.title || t('sessionDetail.mergeUntitledSession'),
          count: result.insertedPageIds.length
        })
      )
      setOpen(false)
    } catch (error) {
      useSessionDetailUiStore.getState().finishAddPage(undefined)
      toastError(getRequestErrorMessage(error, 'sessionDetail.mergePagesFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) setOpen(nextOpen)
      }}
    >
      <DialogContent
        aria-busy={submitting}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (submitting) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (submitting) event.preventDefault()
        }}
        className="h-[min(760px,82vh)] max-w-[960px] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden p-5"
        showClose={!submitting}
      >
        <fieldset disabled={submitting} className="contents disabled:pointer-events-none">
          <DialogHeader>
            <DialogTitle>{t('sessionDetail.mergePagesTitle')}</DialogTitle>
            <DialogDescription>{t('sessionDetail.mergePagesDescription')}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[#d8cfbc]/75 bg-[#f8f4eb]">
            <div className="flex min-h-0 flex-col border-r border-[#d8cfbc]/75 bg-[#f2ecdf]/75 p-3">
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#829071]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('sessionDetail.mergeSearchSessions')}
                  className="h-9 bg-[#fffaf1] pl-9"
                  disabled={submitting}
                />
              </div>
              <ScrollArea className="min-h-0 flex-1" viewportClassName="pr-2">
                {loadingSessions ? (
                  <div className="flex h-32 items-center justify-center text-[#7a875f]">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : filteredSessions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#c9c0ae] px-3 py-8 text-center text-xs text-[#8a806f]">
                    {t('sessionDetail.mergeNoSessions')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSessions.map((sourceSession) => {
                      const selected = sourceSession.id === selectedSourceSessionId
                      return (
                        <button
                          key={sourceSession.id}
                          type="button"
                          disabled={!sourceSession.selectable || loadingPages || submitting}
                          onClick={() => void handleSelectSession(sourceSession)}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            selected
                              ? 'border-[#8eaa70] bg-[#e8f1dd] shadow-sm'
                              : 'border-[#ddd4c4] bg-[#fffaf1]/80 hover:bg-white'
                          } disabled:cursor-not-allowed disabled:opacity-55`}
                        >
                          <div className="truncate text-sm font-semibold text-[#3e4a32]">
                            {sourceSession.title || t('sessionDetail.mergeUntitledSession')}
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[#817766]">
                            <span>
                              {t('sessionDetail.mergePageCount', {
                                count: sourceSession.pageCount
                              })}
                            </span>
                            <span>
                              {new Date(sourceSession.updatedAt * 1000).toLocaleDateString()}
                            </span>
                          </div>
                          {sourceSession.disabledReason ? (
                            <div className="mt-1.5 text-[10px] text-[#a1665c]">
                              {getDisabledReason(sourceSession.disabledReason)}
                            </div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="flex min-h-0 flex-col bg-[#fffaf1]/75 p-4">
              <div className="mb-3 flex min-h-9 items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#3e4a32]">
                    {selectedSourceSession
                      ? selectedSourceSession.title || t('sessionDetail.mergeUntitledSession')
                      : t('sessionDetail.mergeSelectSession')}
                  </div>
                  {selectedSourceSession ? (
                    <div className="mt-0.5 text-[11px] text-[#817766]">
                      {t('sessionDetail.mergeSelectedCount', {
                        count: selectedSourcePageIds.size,
                        max: selectablePageIds.length
                      })}
                    </div>
                  ) : null}
                </div>
                {selectedSourceSession && sourcePages.length > 0 ? (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#5d6b4d] hover:bg-[#e8e0d0]/70">
                    <Checkbox
                      checked={allSelectablePagesSelected}
                      disabled={submitting || selectablePageIds.length === 0}
                      onCheckedChange={handleToggleAll}
                    />
                    {selectablePageIds.length > MAX_MERGE_PAGE_COUNT
                      ? t('sessionDetail.mergeSelectFirstPages', { count: MAX_MERGE_PAGE_COUNT })
                      : t('sessionDetail.mergeSelectAll')}
                  </label>
                ) : null}
              </div>

              <ScrollArea
                className="min-h-0 flex-1"
                viewportClassName="pr-2"
                viewportRef={pageViewportRef}
                onViewportScroll={schedulePreviewWindowUpdate}
              >
                {loadingPages ? (
                  <div className="flex h-full min-h-56 items-center justify-center text-[#7a875f]">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : loadError ? (
                  <div className="flex h-full min-h-56 items-center justify-center rounded-xl border border-dashed border-[#d8b4aa] px-6 text-center text-sm text-[#a15f55]">
                    {loadError}
                  </div>
                ) : !selectedSourceSession ? (
                  <div className="flex h-full min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-[#d6cdbd] text-[#8a806f]">
                    <Files className="mb-3 h-8 w-8 text-[#9eaa8e]" />
                    <span className="text-sm">{t('sessionDetail.mergeSelectSessionHint')}</span>
                  </div>
                ) : sourcePages.length === 0 ? (
                  <div className="flex h-full min-h-56 items-center justify-center text-sm text-[#8a806f]">
                    {t('sessionDetail.mergeNoPages')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {sourcePages.map((page) => {
                      const selected = selectedSourcePageIds.has(page.id)
                      const slideSize = requireSlideSize({
                        id: page.slideSizeId,
                        width: page.slideWidth,
                        height: page.slideHeight
                      })
                      return (
                        <div
                          key={page.id}
                          data-preview-window-id={page.id}
                          aria-disabled={!page.selectable || submitting}
                          onClick={() => {
                            if (page.selectable && !submitting) togglePage(page)
                          }}
                          className={`group relative overflow-hidden rounded-xl border p-2 text-left transition-all ${
                            selected
                              ? 'border-[#7f9f67] bg-[#e9f2df] shadow-[0_8px_18px_rgba(93,107,77,0.14)]'
                              : 'border-[#ddd4c4] bg-white hover:border-[#b8c7a5]'
                          } ${
                            !page.selectable || submitting
                              ? 'cursor-not-allowed opacity-55'
                              : 'cursor-pointer'
                          }`}
                        >
                          <div
                            className="relative w-full overflow-hidden rounded-lg bg-[#eee7d9]"
                            style={{ aspectRatio: `${slideSize.width}/${slideSize.height}` }}
                          >
                            <MergePagePreview
                              page={page}
                              renderPreview={previewPageIds.has(page.id)}
                            />
                            <span className="absolute left-2 top-2 z-10 rounded-md bg-[#fffaf1]/92 px-1.5 py-0.5 text-[10px] font-semibold text-[#4f613f] shadow-sm">
                              P{page.pageNumber}
                            </span>
                            <span
                              className="absolute right-2 top-2 z-10 rounded bg-[#fffaf1]/92 p-1 shadow-sm"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <Checkbox
                                checked={selected}
                                disabled={!page.selectable || submitting}
                                aria-label={page.title}
                                onCheckedChange={() => togglePage(page)}
                              />
                            </span>
                          </div>
                          <div className="mt-2 line-clamp-2 min-h-8 text-xs font-medium leading-4 text-[#4a583f]">
                            {page.title || t('sessionDetail.untitledPage')}
                          </div>
                          {page.disabledReason ? (
                            <div className="mt-1 text-[10px] text-[#a1665c]">
                              {getDisabledReason(page.disabledReason)}
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" disabled={submitting} onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!selectedSourceSessionId || selectedSourcePageIds.size === 0 || submitting}
              onClick={() => void handleConfirm()}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {submitting
                ? t('sessionDetail.mergeAddingPages')
                : t('sessionDetail.mergeAddPages', { count: selectedSourcePageIds.size })}
            </Button>
          </DialogFooter>
        </fieldset>
      </DialogContent>
    </Dialog>
  )
}
