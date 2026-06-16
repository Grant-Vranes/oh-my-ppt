import { useEffect, useRef } from 'react'
import { ipc, type HtmlThumbnailTask } from '@renderer/lib/ipc'
import type { HtmlThumbnailResourceType } from '@shared/thumbnail'

export function useThumbnailUpdates(
  resourceType: HtmlThumbnailResourceType,
  onCompleted: (task: HtmlThumbnailTask) => void
): void {
  const onCompletedRef = useRef(onCompleted)
  onCompletedRef.current = onCompleted

  useEffect(() => {
    const unsubscribe = ipc.onHtmlThumbnailChanged((task) => {
      if (task.resourceType !== resourceType || task.status !== 'completed') return
      onCompletedRef.current(task)
    })
    return unsubscribe
  }, [resourceType])
}
