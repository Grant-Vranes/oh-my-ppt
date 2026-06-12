import { useCallback, useEffect, useRef, useState } from 'react'
import { selectPreviewWindowIds } from './preview-window-utils'

interface UsePreviewWindowOptions {
  enabled: boolean
  itemIds: readonly string[]
  limit: number
}

interface UsePreviewWindowResult {
  activePreviewIds: Set<string>
  viewportRef: React.RefObject<HTMLDivElement | null>
  schedulePreviewWindowUpdate: () => void
}

export function usePreviewWindow({
  enabled,
  itemIds,
  limit
}: UsePreviewWindowOptions): UsePreviewWindowResult {
  const [activePreviewIds, setActivePreviewIds] = useState<Set<string>>(() => new Set())
  const viewportRef = useRef<HTMLDivElement>(null)
  const updateRafRef = useRef<number | null>(null)

  const updatePreviewWindow = useCallback((): void => {
    const viewport = viewportRef.current
    if (!enabled || !viewport || itemIds.length === 0) {
      setActivePreviewIds((current) => (current.size === 0 ? current : new Set()))
      return
    }

    const viewportRect = viewport.getBoundingClientRect()
    const viewportCenterX = viewportRect.left + viewportRect.width / 2
    const viewportCenterY = viewportRect.top + viewportRect.height / 2
    const candidates = Array.from(
      viewport.querySelectorAll<HTMLElement>('[data-preview-window-id]')
    ).map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        id: node.dataset.previewWindowId || '',
        distance: Math.hypot(
          rect.left + rect.width / 2 - viewportCenterX,
          rect.top + rect.height / 2 - viewportCenterY
        )
      }
    })
    const next = selectPreviewWindowIds(candidates, limit)

    setActivePreviewIds((current) => {
      if (current.size === next.size && Array.from(next).every((id) => current.has(id))) {
        return current
      }
      return next
    })
  }, [enabled, itemIds, limit])

  const schedulePreviewWindowUpdate = useCallback((): void => {
    if (updateRafRef.current !== null) return
    updateRafRef.current = window.requestAnimationFrame(() => {
      updateRafRef.current = null
      updatePreviewWindow()
    })
  }, [updatePreviewWindow])

  useEffect(() => {
    schedulePreviewWindowUpdate()
    window.addEventListener('resize', schedulePreviewWindowUpdate)
    return () => {
      window.removeEventListener('resize', schedulePreviewWindowUpdate)
      if (updateRafRef.current !== null) {
        window.cancelAnimationFrame(updateRafRef.current)
        updateRafRef.current = null
      }
    }
  }, [schedulePreviewWindowUpdate])

  return { activePreviewIds, viewportRef, schedulePreviewWindowUpdate }
}
