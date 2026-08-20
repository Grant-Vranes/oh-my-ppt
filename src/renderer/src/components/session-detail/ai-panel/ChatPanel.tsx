import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Send,
  StopCircle,
  Video,
  X
} from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { useModelAction } from '@renderer/hooks/useModelAction'
import {
  useGenerateStore,
  useSessionDetailUiStore,
  useSessionStore,
  useToastStore
} from '@renderer/store'
import { Button } from '../../ui/Button'
import { ModelSplitButton } from '../../model/ModelActionButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../ui/DropdownMenu'
import { Textarea } from '../../ui/Input'
import { ScrollArea } from '../../ui/ScrollArea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/Select'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/Tooltip'
import { MessageBubble } from './MessageBubble'
import { useT } from '@renderer/i18n'
import { useChatPanelController } from '../hooks/useChatPanelController'
import { normalizePagesForSelection } from '../shared/pageUtils'
import { MAX_SELECTED_PAGES } from '@shared/generation'

export function ChatPanel({ sessionId }: { sessionId: string }): React.JSX.Element {
  const t = useT()
  const modelAction = useModelAction()
  const toastWarning = useToastStore((state) => state.warning)
  const {
    selectedPageExists,
    selectedPageNumber,
    isGenerating,
    isPageEditing,
    isDeckEditing,
    deckEditRetry,
    isPlanningPageEdit,
    pendingPageEditPlan,
    hasActivePageEditJob,
    progress,
    error,
    uploadFiles,
    chooseAssets,
    send,
    confirmPageEditPlan,
    cancelPageEditPlan,
    retryDeckEdit,
    cancel
  } = useChatPanelController(sessionId)
  const messages = useSessionStore((state) => state.currentMessages)
  const currentPages = useGenerateStore((state) => state.currentPages)
  const chatType = useSessionDetailUiStore((state) => state.chatType)
  const input = useSessionDetailUiStore((state) => state.input)
  const selectedSelector = useSessionDetailUiStore((state) => state.selectedSelector)
  const selectorLabel = useSessionDetailUiStore((state) => state.selectorLabel)
  const elementTag = useSessionDetailUiStore((state) => state.elementTag)
  const elementText = useSessionDetailUiStore((state) => state.elementText)
  const selectedElementContext = useSessionDetailUiStore((state) => state.selectedElementContext)
  const pendingAssets = useSessionDetailUiStore((state) => state.pendingAssets)
  const assetDragActive = useSessionDetailUiStore((state) => state.assetDragActive)
  const isUploadingAssets = useSessionDetailUiStore((state) => state.isUploadingAssets)
  const setChatType = useSessionDetailUiStore((state) => state.setChatType)
  const setInput = useSessionDetailUiStore((state) => state.setInput)
  const setAssetDragActive = useSessionDetailUiStore((state) => state.setAssetDragActive)
  const removePendingAsset = useSessionDetailUiStore((state) => state.removePendingAsset)
  const clearSelectedElement = useSessionDetailUiStore((state) => state.clearSelectedElement)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const [selectedMainPageIds, setSelectedMainPageIds] = useState<string[]>([])
  const pages = useMemo(() => normalizePagesForSelection(currentPages), [currentPages])
  const pageIds = useMemo(() => pages.map((page) => page.pageId), [pages])
  const effectiveMainPageIds = useMemo(
    () => selectedMainPageIds.filter((id) => pageIds.includes(id)),
    [pageIds, selectedMainPageIds]
  )

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isGenerating])

  useEffect(() => {
    if (effectiveMainPageIds.length !== selectedMainPageIds.length) {
      setSelectedMainPageIds(effectiveMainPageIds)
    }
  }, [effectiveMainPageIds, selectedMainPageIds.length])

  const contextHint =
    chatType === 'page' && selectedPageNumber
      ? t('sessionDetail.pageContext', { pageNumber: selectedPageNumber })
      : t('sessionDetail.mainContext')
  const inputPlaceholder =
    pendingAssets.length > 0
      ? t('sessionDetail.assetPlaceholder')
      : chatType === 'page'
        ? t('sessionDetail.pagePlaceholder')
        : t('sessionDetail.mainPlaceholder')
  const displayLabel = (() => {
    const raw = selectorLabel || selectedSelector || ''
    const last = raw.split(/\s+/).pop() || raw
    return last
  })()
  const selectorSummary = selectedSelector
    ? [displayLabel, elementTag ? `<${elementTag}>${elementText ? ` ${elementText}` : ''}` : '']
        .filter(Boolean)
        .join(' · ')
    : ''
  const selectedElementPropertyCount =
    Object.keys(selectedElementContext?.attributes || {}).length +
    Object.keys(selectedElementContext?.inlineStyle || {}).length +
    Object.keys(selectedElementContext?.computedStyle || {}).length
  const selectedElementBounds = selectedElementContext?.bounds
  const selectorTitle = selectedSelector
    ? [
        `selector: ${selectedSelector}`,
        selectorLabel && selectorLabel !== selectedSelector ? `label: ${selectorLabel}` : '',
        elementTag ? `element: <${elementTag}>` : '',
        elementText ? `text: ${elementText}` : '',
        selectedElementBounds
          ? `bounds: x=${selectedElementBounds.x}, y=${selectedElementBounds.y}, w=${selectedElementBounds.width}, h=${selectedElementBounds.height}`
          : ''
      ]
        .filter(Boolean)
        .join('\n')
    : undefined
  const sendDisabled =
    (!input.trim() && pendingAssets.length === 0) ||
    ((selectedSelector ? 'page' : chatType) === 'page' && !selectedPageExists)

  const handleSendWithModel = async (modelConfigId?: string): Promise<void> => {
    if (sendDisabled) return
    try {
      if (
        chatType === 'main' &&
        effectiveMainPageIds.length === 0 &&
        pageIds.length > MAX_SELECTED_PAGES
      ) {
        toastWarning(
          t('sessionDetail.mainPageScopeAllLimitReached', {
            count: pageIds.length,
            limit: MAX_SELECTED_PAGES
          })
        )
        return
      }
      if (
        chatType === 'main' &&
        effectiveMainPageIds.length > 0 &&
        /\b(all|every|entire)\b|全部|所有|整套|全套|每一页|每页/i.test(input)
      ) {
        toastWarning(t('sessionDetail.mainPageScopeConflictWarning'))
      }
      const resolvedModelConfigId = await modelAction.ensureModelActive(modelConfigId)
      if (!resolvedModelConfigId) return
      const started = await send(resolvedModelConfigId, effectiveMainPageIds)
      if (started) setSelectedMainPageIds([])
    } catch (err) {
      console.error('[MessagePanel] send model activation failed', err)
    }
  }

  const handleRetryDeckEdit = async (): Promise<void> => {
    const modelConfigId = await modelAction.ensureModelActive()
    if (!modelConfigId) return
    await retryDeckEdit(modelConfigId)
  }

  const toggleMainPage = (pageId: string): void => {
    if (
      !selectedMainPageIds.includes(pageId) &&
      effectiveMainPageIds.length >= MAX_SELECTED_PAGES
    ) {
      toastWarning(t('sessionDetail.mainPageScopeLimitReached', { count: MAX_SELECTED_PAGES }))
      return
    }
    setSelectedMainPageIds((current) =>
      current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId]
    )
  }

  const selectedSingleMainPage =
    effectiveMainPageIds.length === 1
      ? pages.find((page) => page.pageId === effectiveMainPageIds[0])
      : undefined
  const mainPageScopeLabel =
    effectiveMainPageIds.length === 0
      ? t('sessionDetail.mainPageScopeAll')
      : effectiveMainPageIds.length === 1
        ? selectedSingleMainPage?.pageNumber
          ? `P${selectedSingleMainPage.pageNumber}`
          : effectiveMainPageIds[0]
        : t('sessionDetail.mainPageScopeCount', { count: effectiveMainPageIds.length })

  return (
    <>
      <div className="relative mx-2.5 mt-2.5 overflow-hidden rounded-[1.35rem] border border-[#e4e4e7]/72 bg-[#ffffff]/78 px-3 pb-2.5 pt-3 shadow-[0_4px_12px_rgba(77,61,43,0.06)]">
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] bg-[#fff7ed]/12" />
        <div className="relative flex flex-col gap-2">
          <h3 className="text-sm font-semibold tracking-[0.04em] text-[#34402c]">
            {t('sessionDetail.messageTitle')}
          </h3>
          <div className="flex items-center justify-between gap-2 text-xs text-[#6d604d]">
            <span>{t('sessionDetail.context')}</span>
            <Select
              value={chatType}
              onValueChange={(value) => setChatType(value === 'page' ? 'page' : 'main')}
            >
              <SelectTrigger className="h-8 w-[132px] rounded-full border-[#e4e4e7]/70 bg-[#ffffff]/82 px-3 py-1 text-xs text-[#3e4a32] shadow-none">
                <SelectValue placeholder={t('sessionDetail.contextPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="page" disabled={!selectedPageExists}>
                  {t('sessionDetail.currentPage')}
                </SelectItem>
                <SelectItem value="main">{t('sessionDetail.mainSession')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <ScrollArea
        data-messages-container
        className="min-h-0 flex-1"
        viewportClassName="px-2.5 py-2"
      >
        {messages.length === 0 && !isGenerating ? (
          <div className="mt-24 flex min-h-full items-center justify-center text-sm text-[#7a6b56]">
            {t('sessionDetail.emptyMessages')}
          </div>
        ) : (
          <div className="flex min-h-full flex-col justify-end gap-2.5">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {error && (
              <div className="rounded-[1.15rem] bg-[rgba(217,124,139,0.12)] px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {(isPageEditing || isDeckEditing) && (
              <div className="flex items-center gap-2 rounded-[1.15rem] border border-[#fff7ed]/70 bg-[#edf5e5]/76 px-3 py-2 text-sm text-[#4f6340]">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span className="min-w-0 flex-1 break-words">
                  {progress?.label || t('sessionDetail.activityProcessing')}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-[#6d7b5d]">
                  {Math.round(progress?.progress || 0)}%
                </span>
              </div>
            )}
            {deckEditRetry && !isDeckEditing && (
              <div className="flex items-center gap-2 rounded-lg border border-[#d8c48b]/75 bg-[#fff8df] px-3 py-2 text-sm text-[#765b18]">
                <span className="min-w-0 flex-1 break-words">
                  {t('sessionDetail.activityPartialCompleted', {
                    count: deckEditRetry.failedPageCount
                  })}
                </span>
                <Button size="sm" onClick={() => void handleRetryDeckEdit()} className="h-8 px-2.5 text-xs">
                  {t('sessionDetail.activityRetryFailedPages', {
                    count: deckEditRetry.failedPageCount
                  })}
                </Button>
              </div>
            )}
            {isPlanningPageEdit && (
              <div className="flex items-center gap-2 rounded-lg border border-[#fff7ed]/70 bg-[#edf5e5]/76 px-3 py-2 text-sm text-[#4f6340]" aria-live="polite">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                <span>{t('sessionDetail.pageEditPlanning')}</span>
              </div>
            )}
            {pendingPageEditPlan && (
              <section className="rounded-lg border border-[#fff7ed]/80 bg-[#f7fbf2] px-3 py-2.5 text-sm text-[#405333]" aria-live="polite">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-semibold">{t('sessionDetail.pageEditPlanTitle')}</h4>
                  <span className="shrink-0 text-xs text-[#6d7b5d]">
                    {pendingPageEditPlan.targetPageNumber
                      ? t('sessionDetail.pageContext', {
                          pageNumber: pendingPageEditPlan.targetPageNumber
                        })
                      : pendingPageEditPlan.targetPageId}
                  </span>
                </div>
                <p className="mt-1.5 break-words leading-5">{pendingPageEditPlan.plan.summary}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-[#536847]">
                  {pendingPageEditPlan.plan.changes.map((change, index) => (
                    <li key={`${index}-${change}`}>{change}</li>
                  ))}
                </ul>
                <p className="mt-2 break-words text-xs leading-5 text-[#5f7150]">
                  {pendingPageEditPlan.plan.confirmationQuestion}
                </p>
                <div className="mt-2.5 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={cancelPageEditPlan}
                    className="h-8 px-2.5 text-xs"
                  >
                    {t('sessionDetail.pageEditPlanCancel')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={hasActivePageEditJob}
                    onClick={() => void confirmPageEditPlan()}
                    className="h-8 px-2.5 text-xs"
                  >
                    {t('sessionDetail.pageEditPlanConfirm')}
                  </Button>
                </div>
              </section>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      <div
        className={cn(
          'mx-2.5 mb-2.5 rounded-[1.4rem] border border-[#e4e4e7]/72 bg-[#ffffff]/84 px-2.5 pb-3 pt-2 shadow-[0_12px_24px_rgba(74,59,42,0.11)] transition-colors',
          assetDragActive && 'border-[#afc79a]/75 bg-[#f3f8ec]/88'
        )}
        onDragEnter={(event) => {
          event.preventDefault()
          if (event.dataTransfer.types.includes('Files')) setAssetDragActive(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (event.dataTransfer.types.includes('Files')) setAssetDragActive(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setAssetDragActive(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          void uploadFiles(Array.from(event.dataTransfer.files))
        }}
      >
        {selectedSelector && (
          <div className="mb-2 flex items-center gap-2 rounded-[1rem] border border-[#e4e4e7]/65 bg-[#f4ebdc]/70 px-2 py-1.5">
            <span className="shrink-0 rounded-full bg-[#dcebcf]/82 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[#4f6340]">
              {t('sessionDetail.selectorBadge')}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-5 text-[#4f5f3f]">
                  {selectorSummary}
                </span>
              </TooltipTrigger>
              {selectorTitle && (
                <TooltipContent className="whitespace-pre-wrap">{selectorTitle}</TooltipContent>
              )}
            </Tooltip>
            {selectedElementPropertyCount > 0 && (
              <span
                className="shrink-0 rounded-full bg-[#e5ddd0]/82 px-1.5 py-0.5 text-[10px] font-medium text-[#6a5c48]"
                title={t('sessionDetail.selectorPropertiesReady', {
                  count: selectedElementPropertyCount
                })}
              >
                {t('sessionDetail.selectorPropertiesReady', {
                  count: selectedElementPropertyCount
                })}
              </span>
            )}
            <button
              type="button"
              onClick={clearSelectedElement}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#64735a] transition-colors hover:bg-[#fff7ed]/78 hover:text-[#3e4a32]"
              aria-label={t('sessionDetail.clearSelector')}
              title={t('sessionDetail.clearSelector')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {chatType === 'main' && (
          <div className="mb-2 flex items-center gap-2 rounded-[1rem] border border-[#e4e4e7]/65 bg-[#f4ebdc]/70 px-2.5 py-2 text-xs text-[#6a5c48]">
            <span className="min-w-0 flex-1">{t('sessionDetail.mainDeckHint')}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isGenerating || pages.length === 0}
                  className="inline-flex h-7 max-w-[116px] shrink-0 items-center gap-1.5 rounded-full border border-[#fff7ed]/72 bg-[#ffffff]/86 px-2 text-[11px] font-medium text-[#405333] transition-colors hover:bg-[#edf5e5] disabled:pointer-events-none disabled:opacity-45"
                  title={
                    effectiveMainPageIds.length > 0
                      ? effectiveMainPageIds.map((id) => `/${id}.html`).join('\n')
                      : t('sessionDetail.mainPageScopeAll')
                  }
                >
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                    {mainPageScopeLabel}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="max-h-72 w-56 overflow-y-auto">
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault()
                    setSelectedMainPageIds([])
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5',
                      effectiveMainPageIds.length === 0 ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {t('sessionDetail.mainPageScopeAll')}
                </DropdownMenuItem>
                {pages.map((page) => {
                  const checked = effectiveMainPageIds.includes(page.pageId)
                  const limitReached = !checked && effectiveMainPageIds.length >= MAX_SELECTED_PAGES
                  return (
                    <DropdownMenuItem
                      key={page.pageId}
                      onSelect={(event) => {
                        event.preventDefault()
                        toggleMainPage(page.pageId)
                      }}
                      className={cn('text-xs', limitReached && 'opacity-55')}
                      title={`/${page.pageId}.html`}
                    >
                      <Check className={cn('h-3.5 w-3.5', checked ? 'opacity-100' : 'opacity-0')} />
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                        P{page.pageNumber} · {page.title || page.pageId}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {pendingAssets.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingAssets.map((asset) => (
              <div
                key={asset.id}
                className="flex max-w-full items-center gap-1.5 rounded-full border border-[#fff7ed]/66 bg-[#e6f1dc]/76 px-2 py-1 text-[11px] text-[#405333] shadow-[0_3px_8px_rgba(93,107,77,0.06)]"
                title={`${asset.originalName}\n${asset.relativePath}`}
              >
                {asset.mimeType.startsWith('video/') ? (
                  <Video className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="min-w-0 max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {asset.originalName || asset.fileName}
                </span>
                <button
                  type="button"
                  onClick={() => removePendingAsset(asset.id)}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#657552] hover:bg-[#c8ddb2]"
                  aria-label={t('sessionDetail.removeAsset')}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <Textarea
          placeholder={inputPlaceholder}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onCompositionEnd={() => {
            composingRef.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              if (composingRef.current || event.nativeEvent.isComposing) return
              event.preventDefault()
              void handleSendWithModel()
            }
          }}
          disabled={isGenerating}
          rows={4}
          className="min-h-[96px] resize-none rounded-[1.15rem] border border-[#e4e4e7]/72 bg-[#ffffff]/88 px-3 py-2 text-[13px] leading-5 text-[#3f4b35] shadow-[inset_0_1px_2px_rgba(74,59,42,0.05)] focus-visible:border-[#9bb98a] focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isGenerating || isUploadingAssets}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[38%_62%_44%_56%/55%_45%_55%_45%] border border-[#fff7ed]/66 bg-[#e6f1dc]/80 text-[#526942] shadow-[0_4px_10px_rgba(93,107,77,0.09)] transition-colors hover:bg-[#d7e8c8] disabled:pointer-events-none disabled:opacity-45"
                  aria-label={t('sessionDetail.addAsset')}
                  title={t('sessionDetail.addAsset')}
                >
                  {isUploadingAssets ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-40">
                <DropdownMenuItem onSelect={() => void chooseAssets('image')}>
                  <ImageIcon className="h-4 w-4" />
                  {t('sessionDetail.chooseImage')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void chooseAssets('video')}>
                  <Video className="h-4 w-4" />
                  {t('sessionDetail.chooseVideo')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <FileText className="h-4 w-4" />
                  {t('sessionDetail.chooseFileSoon')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-5 text-[#6d604d]">
              {contextHint}
            </div>
          </div>

          {isGenerating ? (
            <Button
              variant="destructive"
              onClick={() => void cancel()}
              size="sm"
              className="shrink-0 whitespace-nowrap rounded-full px-3 text-xs shadow-[0_8px_18px_rgba(177,90,88,0.22)]"
            >
              <StopCircle className="mr-1 h-4 w-4" />
              {isDeckEditing ? t('common.cancel') : t('sessionDetail.stop')}
            </Button>
          ) : (
            <ModelSplitButton
              modelAction={modelAction}
              label={t('sessionDetail.send')}
              disabled={sendDisabled}
              icon={Send}
              size="sm"
              className="shrink-0 whitespace-nowrap"
              mainClassName="h-8 px-2.5 text-xs"
              triggerClassName="h-8 px-1.5"
              onRun={handleSendWithModel}
            />
          )}
        </div>
      </div>
    </>
  )
}
