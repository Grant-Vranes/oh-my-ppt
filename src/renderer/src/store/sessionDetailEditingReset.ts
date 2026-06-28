import { useEditHistoryStore } from './editHistoryStore'
import { useEditSessionStore } from './editSessionStore'
import { useSessionDetailUiStore } from './sessionDetailStore'

export function resetSessionDetailEditingStores(): void {
  const editSession = useEditSessionStore.getState()
  editSession.iframeHandle?.clearEditModeSelection()
  useEditHistoryStore.getState().clear()
  editSession.resetForPage()
  useSessionDetailUiStore.getState().resetEditingPageState()
}
