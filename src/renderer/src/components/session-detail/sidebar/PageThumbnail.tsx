import { memo } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/Tooltip'
import { PreviewIframe } from '../../preview/PreviewIframe'
import type { SessionPreviewPage } from '../shared/types'
import { useT } from '@renderer/i18n'
import { useSessionStore } from '@renderer/store'
import { trySessionSlideSize } from '@shared/slide-size'

export const PageThumbnail = memo(function PageThumbnail({
  page,
  isSelected,
  previewVersion,
  renderPreview = true,
  onSelect,
  actions,
  failureOverlay
}: {
  page: SessionPreviewPage
  isSelected: boolean
  previewVersion: number
  renderPreview?: boolean
  onSelect?: (pageId: string) => void
  actions?: React.ReactNode
  failureOverlay?: React.ReactNode
}): React.JSX.Element {
  const t = useT()
  const currentSession = useSessionStore((state) => state.currentSession)
  const slideSize = trySessionSlideSize(currentSession)
  const isGeneratingPlaceholder = page.status === 'generating' || page.status === 'pending'
  if (!slideSize) {
    return <div className="h-[154px] w-full rounded border border-[#e4e4e7]" />
  }
  const thumbnailFitStyle =
    slideSize.width >= slideSize.height
      ? { width: '100%', aspectRatio: `${slideSize.width}/${slideSize.height}` }
      : { height: '100%', aspectRatio: `${slideSize.width}/${slideSize.height}` }

  const pageInfoTooltip = (
    <TooltipContent side="right" align="start">
      <div className="max-w-[240px]">
        <div className="mt-0.5 text-sm font-medium text-[#18181b]">{page.title}</div>
      </div>
    </TooltipContent>
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect ? () => onSelect(page.id) : undefined}
      aria-disabled={!onSelect}
      className={cn(
        'group relative block w-full min-w-0 overflow-hidden rounded p-1 text-left transition-all duration-200',
        onSelect ? 'cursor-pointer' : 'cursor-default opacity-60',
        isSelected
          ? 'bg-[#fff7ed] ring-2 ring-[#ea580c] ring-offset-1 shadow-[0_2px_8px_rgba(234,88,12,0.15)]'
          : 'hover:bg-[#f4f4f5]/60'
      )}
    >
      <div
        className={cn(
          'relative flex h-[138px] w-full items-center justify-center overflow-hidden rounded border border-[#e4e4e7]',
          isSelected ? 'border-[#ea580c]' : ''
        )}
        style={{
          contain: 'paint'
        }}
      >
        <div className="relative max-h-full max-w-full overflow-hidden" style={thumbnailFitStyle}>
          {isGeneratingPlaceholder ? (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#fafafa] text-[#71717a]"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[10px] font-semibold">
                {t('sessionDetail.activityProcessing')}
              </span>
            </div>
          ) : renderPreview ? (
            <PreviewIframe
              key={`thumb-${page.id}-${previewVersion}`}
              src={page.sourceUrl}
              htmlPath={page.htmlPath}
              pageId={page.pageId}
              title={`filmstrip-page-${page.pageNumber}`}
              slideSize={slideSize}
              inspectable={false}
              thumbnail
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#fafafa] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a1a1aa]">
              P{page.pageNumber}
            </div>
          )}
        </div>
        {failureOverlay}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative min-w-0">
            <div className="relative mt-1.5 flex items-center justify-between gap-1 px-0.5">
              <span className={cn(
                'text-[10px] font-semibold uppercase tracking-[0.08em]',
                isSelected ? 'text-[#ea580c]' : 'text-[#71717a]'
              )}>
                P{page.pageNumber}
              </span>
              {isSelected ? (
                <span className="rounded bg-[#ea580c] px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  {t('sessionDetail.current')}
                </span>
              ) : null}
            </div>
            <div
              className={cn(
                'relative mt-0.5 block w-full min-w-0 max-w-full overflow-hidden whitespace-normal break-words px-0.5 text-[11px] font-medium leading-4',
                isSelected ? 'text-[#18181b]' : 'text-[#52525b]'
              )}
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical'
              }}
            >
              {page.title}
            </div>
          </div>
        </TooltipTrigger>
        {pageInfoTooltip}
      </Tooltip>
      {actions}
    </div>
  )
})
