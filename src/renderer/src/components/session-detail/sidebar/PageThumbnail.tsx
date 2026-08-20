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
    return <div className="h-[154px] w-full rounded-[1.25rem] bg-[#f4f4f5]/34" />
  }
  const thumbnailFitStyle =
    slideSize.width >= slideSize.height
      ? { width: '100%', aspectRatio: `${slideSize.width}/${slideSize.height}` }
      : { height: '100%', aspectRatio: `${slideSize.width}/${slideSize.height}` }

  const pageInfoTooltip = (
    <TooltipContent side="right" align="start">
      <div className="max-w-[240px]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">
          {t('sessionDetail.pageNumber', { pageNumber: page.pageNumber })}
        </div>
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
        'group relative block w-full min-w-0 overflow-hidden rounded-[1.25rem] p-1.5 text-left transition-all duration-200',
        onSelect ? 'cursor-pointer' : 'cursor-default opacity-60',
        isSelected
          ? 'bg-[#fff7ed]/86 shadow-[0_14px_26px_rgba(0,0,0,0.12)]'
          : 'bg-[#f4f4f5]/34 hover:bg-[#f4f4f5]/68 hover:shadow-[0_8px_18px_rgba(0,0,0,0.06)]'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-7 -top-8 h-20 w-20 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] transition-opacity',
          isSelected
            ? 'bg-[#ea580c]/24 opacity-100'
            : 'bg-[#fff7ed]/28 opacity-0 group-hover:opacity-100'
        )}
      />
      <div
        className={cn(
          'relative flex h-[138px] w-full items-center justify-center overflow-hidden rounded-[1rem] bg-[#f4f4f5]/88 shadow-[0_5px_14px_rgba(0,0,0,0.06)]',
          isSelected
            ? 'shadow-[0_6px_16px_rgba(0,0,0,0.09)]'
            : 'group-hover:shadow-[0_6px_15px_rgba(0,0,0,0.07)]'
        )}
        style={{
          contain: 'paint'
        }}
      >
        <div className="relative max-h-full max-w-full overflow-hidden" style={thumbnailFitStyle}>
          {isGeneratingPlaceholder ? (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[#f8f4eb] text-[#18181b]"
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
            <div className="flex h-full w-full items-center justify-center bg-[#eee7d9]/78 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a1a1aa]">
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
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5c6c47]">
                P{page.pageNumber}
              </span>
              {isSelected ? (
                <span className="rounded-full bg-[#18181b] px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-[0_3px_8px_rgba(0,0,0,0.12)]">
                  {t('sessionDetail.current')}
                </span>
              ) : null}
            </div>
            <div
              className="relative mt-0.5 block w-full min-w-0 max-w-full overflow-hidden whitespace-normal break-words px-0.5 text-[11px] font-medium leading-4 text-[#4c5d3d]"
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
