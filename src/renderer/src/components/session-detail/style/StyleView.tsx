import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Palette } from 'lucide-react'
import { ipc, type HtmlThumbnailTask, type StyleListItem } from '@renderer/lib/ipc'
import { useT } from '@renderer/i18n'
import { useModelAction } from '@renderer/hooks/useModelAction'
import { useThumbnailUpdates } from '@renderer/hooks/useThumbnailUpdates'
import { useVisibleItemIds } from '@renderer/hooks/useVisibleItemIds'
import {
  useGenerateStore,
  useGenerationActivityStore,
  useSessionDetailUiStore,
  useSessionStore,
  useToastStore
} from '@renderer/store'
import { ScrollArea } from '../../ui/ScrollArea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from '../../ui/AlertDialog'

const MAX_VISIBLE_IFRAMES = 8

const localAssetUrl = (filePath: string): string => `local-asset://${encodeURIComponent(filePath)}`
const stylePreviewUrl = (filePath: string): string =>
  import.meta.env.MODE === 'test' ? 'about:blank' : localAssetUrl(filePath)

export function StyleView({ sessionId }: { sessionId: string }): React.JSX.Element {
  const t = useT()
  const currentStyleId = useSessionStore((state) => state.currentSession?.styleId || '')
  const isGenerating = useGenerateStore((state) => state.isGenerating)
  const activeStyleSwitchId = useGenerationActivityStore((state) =>
    state.retryContext?.kind === 'style-switch' ? state.retryContext.styleId : ''
  )
  const { error } = useToastStore()
  const { selectedModelConfigId, ensureModelActive } = useModelAction()
  const [styles, setStyles] = useState<StyleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [switchTarget, setSwitchTarget] = useState<StyleListItem | null>(null)

  const loadStyles = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await ipc.listStyles({ sessionId })
      setStyles(result.items)
    } catch (loadError) {
      error(t('sessionDetail.styleLoadFailed'), {
        description: loadError instanceof Error ? loadError.message : t('common.retryLater')
      })
    } finally {
      setLoading(false)
    }
  }, [error, sessionId, t])

  const applyThumbnail = useCallback((task: HtmlThumbnailTask): void => {
    if (!task.thumbnailPath) return
    setStyles((current) =>
      current.map((style) =>
        style.id === task.resourceId ? { ...style, thumbnailPath: task.thumbnailPath } : style
      )
    )
  }, [])

  useThumbnailUpdates('style', applyThumbnail)

  useEffect(() => {
    void loadStyles()
  }, [currentStyleId, loadStyles])

  const orderedStyles = useMemo(
    () =>
      [...styles].sort((left, right) => {
        if (left.id === currentStyleId) return -1
        if (right.id === currentStyleId) return 1
        return (right.updatedAt || 0) - (left.updatedAt || 0)
      }),
    [currentStyleId, styles]
  )
  const fallbackStyleIds = useMemo(
    () =>
      new Set(
        orderedStyles
          .filter((style) => !style.thumbnailPath && style.previewPath)
          .map((style) => style.id)
      ),
    [orderedStyles]
  )
  const { visibleIds: visibleFallbackIds, setItemRef } = useVisibleItemIds(
    fallbackStyleIds,
    MAX_VISIBLE_IFRAMES
  )

  const handleSwitch = async (style: StyleListItem): Promise<void> => {
    if (style.id === currentStyleId || isGenerating) return
    const modelConfigId = await ensureModelActive(selectedModelConfigId)
    if (!modelConfigId) return
    useGenerationActivityStore.getState().startStyleSwitch(style.id)
    setSwitchTarget(null)
    useSessionDetailUiStore.getState().setWorkspaceTab('preview')
    useSessionDetailUiStore.getState().setInteractionMode('preview')
    useGenerateStore.setState({ isGenerating: true, error: null, status: 'running' })
    try {
      const result = await ipc.switchSessionStyle({ sessionId, styleId: style.id, modelConfigId })
      if (result.alreadyRunning) {
        useGenerationActivityStore.getState().reset()
        return
      }
      if (result.unchanged) {
        useGenerateStore.getState().finishGeneration()
        useGenerationActivityStore.getState().reset()
      }
    } catch (switchError) {
      const message = switchError instanceof Error ? switchError.message : t('common.retryLater')
      useGenerateStore.getState().setError(message)
      useGenerationActivityStore.getState().reset()
      await useSessionStore.getState().loadSession(sessionId)
      error(t('sessionDetail.styleSwitchFailed'), { description: message })
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[#8a9a7b]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t('sessionDetail.styleLoading')}
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[#3e4a32]">{t('sessionDetail.styleTitle')}</h2>
          <p className="mt-1 text-xs text-[#718064]">{t('sessionDetail.styleDescription')}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {orderedStyles.map((style) => {
            const isCurrent = style.id === currentStyleId
            const isSwitching = style.id === activeStyleSwitchId && isGenerating
            return (
              <div
                key={style.id}
                ref={!style.thumbnailPath && style.previewPath ? setItemRef(style.id) : undefined}
                data-style-card-id={style.id}
                role="button"
                aria-current={isCurrent ? 'true' : undefined}
                tabIndex={isCurrent || isGenerating ? -1 : 0}
                aria-disabled={isCurrent || isGenerating}
                onClick={() => {
                  if (!isCurrent && !isGenerating) setSwitchTarget(style)
                }}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && !isCurrent && !isGenerating) {
                    event.preventDefault()
                    setSwitchTarget(style)
                  }
                }}
                className="group overflow-hidden rounded-2xl border border-[#d8cfbc]/75 bg-white/70 text-left shadow-[0_4px_16px_rgba(93,107,77,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(93,107,77,0.15)] aria-disabled:cursor-default aria-disabled:hover:translate-y-0"
              >
                <div className="relative aspect-video overflow-hidden bg-[#f5f1e8]">
                  {style.thumbnailPath ? (
                    <img
                      src={stylePreviewUrl(style.thumbnailPath)}
                      loading="lazy"
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : style.previewPath && visibleFallbackIds.has(style.id) ? (
                    <iframe
                      data-testid="style-preview-iframe"
                      src={stylePreviewUrl(style.previewPath)}
                      sandbox=""
                      tabIndex={-1}
                      className="pointer-events-none absolute left-0 top-0 h-[900px] w-[1600px] origin-top-left border-0 bg-white"
                      style={{ transform: 'scale(0.2)' }}
                      title={`${style.label} preview`}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#8a9a7b]">
                      <Palette className="h-8 w-8" />
                    </div>
                  )}
                  <span
                    data-testid="style-selection-checkbox"
                    data-state={isCurrent ? 'checked' : 'unchecked'}
                    aria-hidden="true"
                    className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md border-2 shadow-[0_3px_10px_rgba(40,48,34,0.22)] transition-colors ${
                      isCurrent || isSwitching
                        ? 'border-[#5d6b4d] bg-[#5d6b4d] text-white'
                        : 'border-[#718064] bg-white/95 text-transparent'
                    }`}
                  >
                    {isSwitching ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <Check className="h-4 w-4" strokeWidth={3} />
                    )}
                  </span>
                </div>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#3e4a32]">{style.label}</p>
                      <p className="mt-0.5 text-[10px] font-medium text-[#718064]">
                        {style.category} · {style.source || 'builtin'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#6f6658]">
                    {style.description || style.id}
                  </p>
                  {style.styleCase && (
                    <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-[#8a7048]">
                      {style.styleCase}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <AlertDialog
        open={Boolean(switchTarget)}
        onOpenChange={(open) => {
          if (!open) setSwitchTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t('sessionDetail.styleSwitchConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('sessionDetail.styleSwitchConfirmDescription', {
              style: switchTarget?.label || ''
            })}
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (switchTarget) void handleSwitch(switchTarget)
              }}
              className="bg-[#5d6b4d] text-white hover:bg-[#49563d]"
            >
              <Palette className="mr-2 h-4 w-4" />
              {t('sessionDetail.styleSwitchConfirmAction')}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  )
}
