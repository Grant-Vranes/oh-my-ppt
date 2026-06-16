import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function limitVisibleIds(ids: ReadonlySet<string>, limit: number): Set<string> {
  if (limit <= 0) return new Set()
  if (ids.size <= limit) return new Set(ids)
  return new Set(Array.from(ids).slice(-limit))
}

export function useVisibleItemIds(
  itemIds: ReadonlySet<string>,
  limit: number
): {
  visibleIds: Set<string>
  setItemRef: (itemId: string) => (element: HTMLElement | null) => void
} {
  const [intersectingIds, setIntersectingIds] = useState<Set<string>>(() => new Set())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const itemRefsRef = useRef<Map<string, HTMLElement>>(new Map())
  const itemIdsByElementRef = useRef<WeakMap<Element, string>>(new WeakMap())

  useEffect(() => {
    setIntersectingIds((current) => {
      const next = new Set(Array.from(current).filter((id) => itemIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [itemIds])

  useEffect(() => {
    if (itemIds.size === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        setIntersectingIds((current) => {
          const next = new Set(current)
          let changed = false
          for (const entry of entries) {
            const id = itemIdsByElementRef.current.get(entry.target)
            if (!id) continue
            if (entry.isIntersecting) {
              next.delete(id)
              next.add(id)
              changed = true
            } else if (next.delete(id)) {
              changed = true
            }
          }
          return changed ? next : current
        })
      },
      { rootMargin: '80px 40px', threshold: 0 }
    )
    observerRef.current = observer
    for (const element of itemRefsRef.current.values()) observer.observe(element)

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [itemIds.size])

  const visibleIds = useMemo(
    () => limitVisibleIds(intersectingIds, limit),
    [intersectingIds, limit]
  )

  const setItemRef = useCallback(
    (itemId: string) => (element: HTMLElement | null) => {
      const itemRefs = itemRefsRef.current
      if (element) {
        itemRefs.set(itemId, element)
        itemIdsByElementRef.current.set(element, itemId)
        observerRef.current?.observe(element)
        return
      }

      const previous = itemRefs.get(itemId)
      if (previous) observerRef.current?.unobserve(previous)
      itemRefs.delete(itemId)
    },
    []
  )

  return { visibleIds, setItemRef }
}
