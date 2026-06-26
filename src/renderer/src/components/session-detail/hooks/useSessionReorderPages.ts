import { useState } from 'react'
import { ipc } from '@renderer/lib/ipc'
import { useGenerateStore, useSessionDetailUiStore, useToastStore } from '@renderer/store'
import { useT } from '@renderer/i18n'

/**
 * Shared page-reorder side-effects. Sidebar and browse mode both commit on
 * drag end, so the persist + history-version path stays in one place.
 *
 * Behavior mirrors the original `usePageSidebarController.handleReorderPages`.
 */
export function useSessionReorderPages(sessionId: string): {
  reorder: (orderedPageIds: string[], selectedPageId?: string) => Promise<boolean>
  isReordering: boolean
} {
  const t = useT()
  const toastError = useToastStore((state) => state.error)
  const [isReordering, setIsReordering] = useState(false)

  const reorder = async (
    orderedPageIds: string[],
    selectedPageId?: string
  ): Promise<boolean> => {
    if (!sessionId) return false
    useSessionDetailUiStore.getState().setIsManagingPages(true)
    setIsReordering(true)
    try {
      const result = await ipc.reorderSessionPages({
        sessionId,
        orderedPageIds,
        selectedPageId
      })
      useGenerateStore.getState().setPages(result.generatedPages)
      useSessionDetailUiStore.getState().setSelectedPageId(result.selectedPageId)
      void ipc
        .clearSpeechScript(sessionId)
        .catch((err) => console.warn('[speech] clearSpeechScript failed', err))
      return true
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('pageManagement.reorderFailed'))
      return false
    } finally {
      useSessionDetailUiStore.getState().setIsManagingPages(false)
      setIsReordering(false)
    }
  }

  return { reorder, isReordering }
}
