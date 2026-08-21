import { CircleAlert, Loader2 } from 'lucide-react'
import { PreviewIframe } from '@renderer/components/preview/PreviewIframe'
import { cn } from '@renderer/lib/utils'
import type { GenerationPreviewPage } from './types'
import type { SlideSizePreset } from '@shared/slide-size'

export function GenerationThumbnail({
  page,
  previewEnabled = true,
  slideSize
}: {
  page: GenerationPreviewPage
  previewEnabled?: boolean
  slideSize: SlideSizePreset | null
}): React.JSX.Element {
  if (!slideSize) {
    return <div className="h-[195px] w-full rounded border border-[#e4e4e7]" />
  }
  const thumbnailFitStyle =
    slideSize.width >= slideSize.height
      ? { width: '100%', aspectRatio: `${slideSize.width}/${slideSize.height}` }
      : { height: '100%', aspectRatio: `${slideSize.width}/${slideSize.height}` }
  const hasPreview =
    previewEnabled && page.status === 'completed' && (page.htmlPath || page.sourceUrl)

  return (
    <div
      className={cn(
        'group relative flex w-full min-w-0 flex-col overflow-hidden rounded border border-[#e4e4e7] bg-white p-1.5 transition-all duration-500',
        page.status === 'completed' && 'border-[#e4e4e7] opacity-100',
        page.status === 'generating' && 'border-[#ea580c]',
        page.status === 'failed' && 'border-[#dc2626]',
        page.status === 'pending' && 'opacity-60'
      )}
    >
      <div
        className="relative flex h-[180px] w-full min-w-0 shrink-0 items-center justify-center overflow-hidden bg-white"
        style={{ contain: 'paint' }}
      >
        <div className="relative max-h-full max-w-full overflow-hidden" style={thumbnailFitStyle}>
          {hasPreview ? (
            <PreviewIframe
              key={`generating-thumb-${page.id}-${page.previewVersion ?? 0}`}
              src={page.sourceUrl}
              htmlPath={page.htmlPath}
              pageId={page.pageId}
              title={`generating-page-${page.pageNumber}`}
              slideSize={slideSize}
              inspectable={false}
              thumbnail
            />
          ) : (
            <div
              className={cn(
                'flex h-full w-full flex-col justify-between p-3',
                page.status === 'generating'
                  ? 'bg-[#fafafa]'
                  : page.status === 'failed'
                    ? 'bg-[#fef2f2]'
                    : 'bg-[#fafafa]'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="h-2 w-16 rounded-full bg-white/72" />
                <span className="h-5 w-5 rounded-md border border-white/80 bg-white/58" />
              </div>
              <div className="space-y-2">
                <span className="block h-3 w-3/4 rounded-full bg-white/78" />
                <span className="block h-2 w-11/12 rounded-full bg-white/56" />
                <span className="block h-2 w-7/12 rounded-full bg-white/56" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="h-7 rounded-md bg-white/54" />
                <span className="h-7 rounded-md bg-white/42" />
                <span className="h-7 rounded-md bg-white/54" />
              </div>
            </div>
          )}
        </div>

        {page.status === 'generating' && (
          <div className="absolute inset-0 border-2 border-[#ea580c]/50">
            <div className="absolute right-2 top-2 rounded bg-white/90 p-1 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ea580c]" />
            </div>
          </div>
        )}

        {page.status === 'failed' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#fef2f2]/76">
            <CircleAlert className="h-6 w-6 text-[#dc2626]" />
          </div>
        )}
      </div>

      <div className="flex w-full min-w-0 items-center justify-between gap-2 px-0.5 pb-0.5 pt-2">
        <span className="shrink-0 rounded bg-[#fafafa] px-1.5 py-0.5 text-[10px] font-semibold text-[#71717a]">
          P{page.pageNumber}
        </span>
        {page.status !== 'failed' && (
          <span className="min-w-0 truncate text-xs font-medium text-[#52525b]" title={page.title}>
            {page.title}
          </span>
        )}
      </div>
    </div>
  )
}
