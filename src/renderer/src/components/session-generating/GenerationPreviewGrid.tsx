import { ScrollArea } from '@renderer/components/ui/ScrollArea'
import { GenerationThumbnail } from './GenerationThumbnail'
import type { GenerationPreviewPage } from './types'

export function GenerationPreviewGrid({
  pages
}: {
  pages: GenerationPreviewPage[]
}): React.JSX.Element {
  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="pr-2 pb-2">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className="min-w-0 w-full"
            style={{
              animation: `gen-page-rise 420ms ease ${Math.min(index * 55, 440)}ms both`
            }}
          >
            <GenerationThumbnail page={page} />
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
