import type React from 'react'
import dayjs from 'dayjs'
import { CircleAlert, Loader2, Sparkles } from 'lucide-react'
import { ScrollArea } from '@renderer/components/ui/ScrollArea'
import type { GenerationLogEvent, GenerationRunStatus } from './types'

export function GenerationLogPanel({
  events,
  status,
  pageCountLabel,
  growingLabel,
  failedLabel,
  logTitle,
  viewportRef,
  onViewportScroll
}: {
  events: GenerationLogEvent[]
  status: GenerationRunStatus
  pageCountLabel: string
  growingLabel: string
  failedLabel: string
  logTitle: string
  viewportRef?: React.Ref<HTMLDivElement>
  onViewportScroll?: React.UIEventHandler<HTMLDivElement>
}): React.JSX.Element {
  return (
    <section className="relative flex min-h-0 flex-1 flex-col rounded-lg border border-[#e4e4e7]/72 bg-[#ffffff]/82 p-2.5 shadow-[0_14px_30px_rgba(78,91,63,0.1)]">
      <div className="mb-2 flex min-h-8 items-center pr-14">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[#495a3b]">
          <Sparkles className="h-4 w-4 text-[#ea580c]" />
          <span className="min-w-0 truncate">{logTitle}</span>
        </div>
        <span
          className="absolute right-2.5 top-2.5 z-20 inline-flex h-6 min-w-10 items-center justify-center rounded-md border border-[#b8d3a6] bg-[#edf6e8] px-2 text-[11px] font-semibold text-[#365528] shadow-sm"
          title={pageCountLabel}
        >
          {pageCountLabel}
        </span>
      </div>

      <ScrollArea
        className="min-h-0 flex-1 rounded-lg border border-[#e4d9c3]/55 bg-[#ffffff]/38"
        viewportRef={viewportRef}
        onViewportScroll={onViewportScroll}
        viewportClassName="px-2 py-2"
      >
        <div className="space-y-2">
          {events.map((event, index) => (
            <div
              key={`${event.text}-${index}`}
              className="rounded-lg border border-[#e4d9c3]/70 bg-white/46 px-2.5 py-1.5 text-xs leading-5 text-[#5a674c] shadow-[0_6px_14px_rgba(93,107,77,0.06)]"
            >
              {event.time && (
                <div className="mb-0.5 text-[10px] leading-4 text-[#a09882]">
                  {dayjs(event.time).format('HH:mm:ss')}
                </div>
              )}
              <div className="break-words">{event.text}</div>
            </div>
          ))}

          {status === 'queued' || status === 'running' ? (
            <div className="flex items-center gap-2 rounded-lg border border-[#e4d9c3]/70 bg-white/46 px-2.5 py-1.5 text-xs text-[#a09882] shadow-[0_6px_14px_rgba(93,107,77,0.06)]">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              <span className="min-w-0 truncate">{growingLabel}</span>
            </div>
          ) : status === 'failed' || status === 'cancelled' ? (
            <div className="flex items-center gap-2 rounded-lg border border-[#d7b5ae]/70 bg-[#fff8f4]/72 px-2.5 py-1.5 text-xs text-[#93564f] shadow-[0_6px_14px_rgba(93,107,77,0.06)]">
              <CircleAlert className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{failedLabel}</span>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  )
}
