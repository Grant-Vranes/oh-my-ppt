import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const PREVIEW_EXIT_DELAY_MS = 250

function limitPreviewIds(ids: ReadonlySet<string>, limit: number): Set<string> {
  if (limit <= 0) return new Set()
  if (ids.size <= limit) return new Set(ids)
  return new Set(Array.from(ids).slice(-limit))
}

export function useStylePreviewIds(
  styleIds: ReadonlySet<string>,
  cacheLimit: number
): {
  viewportRef: React.RefObject<HTMLDivElement | null>
  renderableIds: Set<string>
  setStyleRef: (styleId: string) => (element: HTMLElement | null) => void
} {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const styleRefsRef = useRef<Map<string, HTMLElement>>(new Map())
  const styleIdsByElementRef = useRef<WeakMap<Element, string>>(new WeakMap())
  const removalTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    for (const [id, timer] of removalTimersRef.current) {
      if (styleIds.has(id)) continue
      clearTimeout(timer)
      removalTimersRef.current.delete(id)
    }
    setVisibleIds((current) => {
      const next = new Set(Array.from(current).filter((id) => styleIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [styleIds])

  // Replaced or newly added cards are observed by setStyleRef, so only empty/non-empty changes
  // need to recreate the observer here.
  useEffect(() => {
    if (styleIds.size === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const enteredIds: string[] = []
        for (const entry of entries) {
          const id = styleIdsByElementRef.current.get(entry.target)
          if (!id) continue
          if (entry.isIntersecting) {
            const removalTimer = removalTimersRef.current.get(id)
            if (removalTimer) {
              clearTimeout(removalTimer)
              removalTimersRef.current.delete(id)
            }
            enteredIds.push(id)
            continue
          }

          if (removalTimersRef.current.has(id)) continue
          const removalTimer = setTimeout(() => {
            removalTimersRef.current.delete(id)
            setVisibleIds((visible) => {
              if (!visible.has(id)) return visible
              const remaining = new Set(visible)
              remaining.delete(id)
              return remaining
            })
          }, PREVIEW_EXIT_DELAY_MS)
          removalTimersRef.current.set(id, removalTimer)
        }

        if (enteredIds.length === 0) return
        setVisibleIds((current) => {
          const next = new Set(current)
          let changed = false
          for (const id of enteredIds) {
            const ids = Array.from(next)
            if (ids[ids.length - 1] === id) continue
            next.delete(id)
            next.add(id)
            changed = true
          }
          return changed ? next : current
        })
      },
      {
        root: viewportRef.current,
        rootMargin: '200px 100px',
        threshold: 0
      }
    )
    observerRef.current = observer

    for (const element of styleRefsRef.current.values()) observer.observe(element)

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [styleIds.size])

  useEffect(
    () => () => {
      for (const timer of removalTimersRef.current.values()) clearTimeout(timer)
      removalTimersRef.current.clear()
    },
    []
  )

  const renderableIds = useMemo(
    () => limitPreviewIds(visibleIds, cacheLimit),
    [cacheLimit, visibleIds]
  )

  const setStyleRef = useCallback(
    (styleId: string) => (element: HTMLElement | null) => {
      const styleRefs = styleRefsRef.current
      if (element) {
        styleRefs.set(styleId, element)
        styleIdsByElementRef.current.set(element, styleId)
        observerRef.current?.observe(element)
        return
      }

      const previous = styleRefs.get(styleId)
      if (previous) {
        observerRef.current?.unobserve(previous)
        styleRefs.delete(styleId)
      }
    },
    []
  )

  return { viewportRef, renderableIds, setStyleRef }
}
