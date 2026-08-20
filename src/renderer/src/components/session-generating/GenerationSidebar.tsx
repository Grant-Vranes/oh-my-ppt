import type React from 'react'
import { Home } from 'lucide-react'
import { GenerationLogPanel } from './GenerationLogPanel'
import type { GenerationLogEvent, GenerationRunStatus } from './types'

export function GenerationSidebar({
  title,
  backHomeLabel,
  logTitle,
  pageCountLabel,
  growingLabel,
  failedLabel,
  events,
  status,
  onBackHome,
  viewportRef,
  onViewportScroll
}: {
  title: string
  backHomeLabel: string
  logTitle: string
  pageCountLabel: string
  growingLabel: string
  failedLabel: string
  events: GenerationLogEvent[]
  status: GenerationRunStatus
  onBackHome: () => void
  viewportRef?: React.Ref<HTMLDivElement>
  onViewportScroll?: React.UIEventHandler<HTMLDivElement>
}): React.JSX.Element {
  return (
    <aside className="flex min-h-0 w-full shrink-0 flex-col gap-3 lg:w-[250px]">
      <section className="rounded-lg border border-[#e4e4e7]/78 bg-[#ffffff]/88 p-3 text-[#435138] shadow-[0_14px_30px_rgba(78,91,63,0.12)]">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#e4e4e7]/80 bg-[#ffffff] text-[#5d6b4d] transition-colors hover:bg-[#f4ecd9] hover:text-[#34402c]"
            aria-label={backHomeLabel}
            title={backHomeLabel}
          >
            <Home className="h-4 w-4" />
          </button>
          <div className="flex min-h-8 min-w-0 flex-1 items-center">
            <h1 className="truncate text-[15px] font-semibold leading-5 text-[#2f3b28]" title={title}>
              {title}
            </h1>
          </div>
        </div>
      </section>

      <GenerationLogPanel
        events={events}
        status={status}
        pageCountLabel={pageCountLabel}
        growingLabel={growingLabel}
        failedLabel={failedLabel}
        logTitle={logTitle}
        viewportRef={viewportRef}
        onViewportScroll={onViewportScroll}
      />
    </aside>
  )
}
