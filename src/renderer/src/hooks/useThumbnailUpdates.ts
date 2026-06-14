import { useEffect, useRef } from 'react'
import { ipc, type HtmlThumbnailTask } from '@renderer/lib/ipc'

export function useThumbnailUpdates(
  resourceType: string,
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
