import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGenerateStore, useSessionDetailUiStore } from '@renderer/store'
import { normalizePagesForSelection } from '../shared'
import { PreviewIframe } from '../../preview/PreviewIframe'
import { ScrollArea } from '../../ui/ScrollArea'
import { useT } from '@renderer/i18n'
import { limitBrowsePreviewIds } from './browse-preview-utils'

/** Keep recently-scrolled-past webviews alive as buffer */
const VISIBLE_CACHE = 20

const BrowseCard = memo(function BrowseCard({
  page,
  previewVersion,
  renderPreview
}: {
  page: ReturnType<typeof normalizePagesForSelection>[number]
  previewVersion: number
  renderPreview: boolean
}): React.JSX.Element {
  return (
    <div className="group overflow-hidden rounded-2xl bg-white/60 shadow-[0_4px_16px_rgba(93,107,77,0.08)] transition-shadow hover:shadow-[0_8px_24px_rgba(93,107,77,0.14)]">
      <div
        className="relative w-full overflow-hidden rounded-t-2xl bg-[#f5f1e8]/88"
        style={{ aspectRatio: '16/9', contain: 'paint' }}
      >
        {renderPreview ? (
          <PreviewIframe
            key={`browse-${page.id}-${previewVersion}`}
            src={page.sourceUrl}
            htmlPath={page.htmlPath}
            pageId={page.pageId}
            title={`browse-page-${page.pageNumber}`}
            inspectable={false}
            thumbnail
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8a9a7b]">
            P{page.pageNumber}
          </div>
        )}
      </div>
      <div className="px-3 py-2.5">
        <span className="inline-block rounded-full bg-[#d4e4c1]/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#5c6c47]">
          P{page.pageNumber}
        </span>
        <p
          className="mt-1 text-[12px] font-medium leading-4 text-[#4c5d3d]"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {page.title}
        </p>
      </div>
    </div>
  )
})

export function BrowseView(_props: { sessionId: string }): React.JSX.Element {
  const t = useT()
  const currentPages = useGenerateStore((state) => state.currentPages)
  const previewKey = useSessionDetailUiStore((state) => state.previewKey)
  const thumbnailVersions = useSessionDetailUiStore((state) => state.thumbnailVersions)

  const pages = useMemo(() => normalizePagesForSelection(currentPages), [currentPages])
  const pageIds = useMemo(() => new Set(pages.map((page) => page.id)), [pages])
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const cardRefsRef = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    setVisibleIds((current) => {
      const next = new Set(Array.from(current).filter((id) => pageIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [pageIds])

  useEffect(() => {
    if (pages.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleIds((prev) => {
          const next = new Set(prev)
          let changed = false
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.browseCardId
            if (!id) continue
            if (entry.isIntersecting) {
              if (!next.has(id)) {
                next.add(id)
                changed = true
              }
            } else if (next.delete(id)) {
              changed = true
            }
          }
          return changed ? next : prev
        })
      },
      {
        root: viewportRef.current,
        rootMargin: '200px 100px',
        threshold: 0
      }
    )
    observerRef.current = observer

    for (const el of cardRefsRef.current.values()) {
      observer.observe(el)
    }

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [pages.length])

  const renderableIds = useMemo(
    () => limitBrowsePreviewIds(visibleIds, VISIBLE_CACHE),
    [visibleIds]
  )

  const setCardRef = useCallback(
    (pageId: string) => (el: HTMLElement | null) => {
      const map = cardRefsRef.current
      if (el) {
        map.set(pageId, el)
        observerRef.current?.observe(el)
      } else {
        const old = map.get(pageId)
        if (old) {
          observerRef.current?.unobserve(old)
          map.delete(pageId)
        }
      }
    },
    []
  )

  if (pages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[#8a9a7b]">{t('sessionDetail.pagesEmpty')}</p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1" viewportRef={viewportRef}>
      <div className="p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
          {pages.map((page) => {
            const previewVersion = previewKey + (thumbnailVersions[page.pageId] || 0)
            return (
              <div key={page.id} ref={setCardRef(page.id)} data-browse-card-id={page.id}>
                <BrowseCard
                  page={page}
                  previewVersion={previewVersion}
                  renderPreview={renderableIds.has(page.id)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </ScrollArea>
  )
}
