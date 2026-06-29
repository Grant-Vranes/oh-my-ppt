import { memo } from 'react'
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
  actions
}: {
  page: SessionPreviewPage
  isSelected: boolean
  previewVersion: number
  renderPreview?: boolean
  onSelect?: (pageId: string) => void
  actions?: React.ReactNode
}): React.JSX.Element {
  const t = useT()
  const currentSession = useSessionStore((state) => state.currentSession)
  const slideSize = trySessionSlideSize(currentSession)
  if (!slideSize) {
    return <div className="h-[154px] w-full rounded-[1.25rem] bg-[#e8e0d0]/34" />
  }
  const thumbnailFitStyle =
    slideSize.width >= slideSize.height
      ? { width: '100%', aspectRatio: `${slideSize.width}/${slideSize.height}` }
      : { height: '100%', aspectRatio: `${slideSize.width}/${slideSize.height}` }

  const pageInfoTooltip = (
    <TooltipContent side="right" align="start">
      <div className="max-w-[240px]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a875f]">
          {t('sessionDetail.pageNumber', { pageNumber: page.pageNumber })}
        </div>
        <div className="mt-0.5 text-sm font-medium text-[#3e4a32]">{page.title}</div>
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
          ? 'bg-[#d4e4c1]/86 shadow-[0_14px_26px_rgba(93,107,77,0.18)]'
          : 'bg-[#e8e0d0]/34 hover:bg-[#e8e0d0]/68 hover:shadow-[0_8px_18px_rgba(93,107,77,0.09)]'
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-7 -top-8 h-20 w-20 rounded-[30%_70%_70%_30%/30%_30%_70%_70%] transition-opacity',
          isSelected
            ? 'bg-[#8fbc8f]/24 opacity-100'
            : 'bg-[#d4e4c1]/28 opacity-0 group-hover:opacity-100'
        )}
      />
      <div
        className={cn(
          'relative flex h-[138px] w-full items-center justify-center overflow-hidden rounded-[1rem] bg-[#f5f1e8]/88 shadow-[0_5px_14px_rgba(93,107,77,0.08)]',
          isSelected
            ? 'shadow-[0_6px_16px_rgba(93,107,77,0.13)]'
            : 'group-hover:shadow-[0_6px_15px_rgba(93,107,77,0.1)]'
        )}
        style={{
          contain: 'paint'
        }}
      >
        <div className="relative max-h-full max-w-full overflow-hidden" style={thumbnailFitStyle}>
          {renderPreview ? (
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
            <div className="flex h-full w-full items-center justify-center bg-[#eee7d9]/78 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a9a7b]">
              P{page.pageNumber}
            </div>
          )}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative min-w-0">
            <div className="relative mt-1.5 flex items-center justify-between gap-1 px-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5c6c47]">
                P{page.pageNumber}
              </span>
              {isSelected ? (
                <span className="rounded-full bg-[#5d6b4d] px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-[0_3px_8px_rgba(62,74,50,0.18)]">
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
