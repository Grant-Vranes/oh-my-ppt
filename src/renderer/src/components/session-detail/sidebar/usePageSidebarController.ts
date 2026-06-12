import { useMemo } from 'react'
import { ipc } from '@renderer/lib/ipc'
import {
  useGenerateStore,
  useSessionDetailUiStore,
  useSessionStore,
  useToastStore
} from '@renderer/store'
import { useT } from '@renderer/i18n'
import { useModelAction } from '@renderer/hooks/useModelAction'
import { normalizePagesForSelection } from '../shared/pageUtils'
import type { SessionPreviewPage } from '../shared/types'
import { useSessionExportActions } from '../hooks/useSessionExportActions'

export function usePageSidebarController(sessionId: string) {
  const t = useT()
  const modelAction = useModelAction()
  const currentPages = useGenerateStore((state) => state.currentPages)
  const isGenerating = useGenerateStore((state) => state.isGenerating)
  const selectedPageId = useSessionDetailUiStore((state) => state.selectedPageId)
  const interactionMode = useSessionDetailUiStore((state) => state.interactionMode)
  const isAddingPage = useSessionDetailUiStore((state) => state.isAddingPage)
  const isRetryingSinglePage = useSessionDetailUiStore((state) => state.isRetryingSinglePage)
  const isManagingPages = useSessionDetailUiStore((state) => state.isManagingPages)
  const sidebarCollapsed = useSessionDetailUiStore((state) => state.sidebarCollapsed)
  const toggleSidebarCollapsed = useSessionDetailUiStore((state) => state.toggleSidebarCollapsed)
  const setAddPageDialogOpen = useSessionDetailUiStore((state) => state.setAddPageDialogOpen)
  const setMergeSessionPagesDialogOpen = useSessionDetailUiStore(
    (state) => state.setMergeSessionPagesDialogOpen
  )
  const openBlankPageDialog = useSessionDetailUiStore((state) => state.openBlankPageDialog)
  const openPageTitleEdit = useSessionDetailUiStore((state) => state.openPageTitleEdit)
  const setDeleteConfirmPageId = useSessionDetailUiStore((state) => state.setDeleteConfirmPageId)
  const loadSession = useSessionStore((state) => state.loadSession)
  const toastError = useToastStore((state) => state.error)
  const exportActions = useSessionExportActions(sessionId)
  const pages = useMemo(() => normalizePagesForSelection(currentPages), [currentPages])
  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? pages[0] ?? null,
    [pages, selectedPageId]
  )

  const handleRetryFailedPage = async (page: SessionPreviewPage): Promise<void> => {
    if (!sessionId || !page.id) return
    useSessionDetailUiStore.getState().setIsRetryingSinglePage(true)
    useGenerateStore.setState({ isGenerating: true, error: null, status: 'running' })
    try {
      const modelConfigId = await modelAction.ensureModelActive()
      if (!modelConfigId) return
      await ipc.retrySinglePage({ sessionId, pageId: page.id, modelConfigId })
      await loadSession(sessionId)
      useGenerateStore.getState().setPages(useSessionStore.getState().currentGeneratedPages)
    } catch (err) {
      const message = err instanceof Error ? err.message : t('sessionDetail.retryPageFailed')
      toastError(message)
    } finally {
      useGenerateStore.getState().finishGeneration()
      useSessionDetailUiStore.getState().setIsRetryingSinglePage(false)
    }
  }

  const handleReorderPages = async (
    orderedPageIds: string[],
    selectedForKeep?: string
  ): Promise<void> => {
    if (!sessionId) return
    useSessionDetailUiStore.getState().setIsManagingPages(true)
    try {
      const result = await ipc.reorderSessionPages({
        sessionId,
        orderedPageIds,
        selectedPageId: selectedForKeep
      })
      useGenerateStore.getState().setPages(result.generatedPages)
      useSessionDetailUiStore.getState().setSelectedPageId(result.selectedPageId)
      useSessionDetailUiStore.getState().bumpPreviewKey()
      void ipc
        .clearSpeechScript(sessionId)
        .catch((err) => console.warn('[speech] clearSpeechScript failed', err))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('pageManagement.reorderFailed'))
    } finally {
      useSessionDetailUiStore.getState().setIsManagingPages(false)
    }
  }

  const handleUpdatePageOutline = async (
    page: SessionPreviewPage,
    contentOutline: string
  ): Promise<void> => {
    if (!sessionId) return
    const normalizedOutline = contentOutline.replace(/\s+/g, ' ').trim()
    if (normalizedOutline === (page.contentOutline || '').trim()) return
    useSessionDetailUiStore.getState().setIsManagingPages(true)
    try {
      const result = await ipc.updateSessionPageOutline({
        sessionId,
        pageId: page.id,
        contentOutline: normalizedOutline
      })
      useGenerateStore.getState().setPages(result.generatedPages)
      useSessionDetailUiStore.getState().setSelectedPageId(result.selectedPageId || page.id)
      void ipc
        .clearSpeechScript(sessionId)
        .catch((err) => console.warn('[speech] clearSpeechScript failed', err))
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('pageManagement.updateOutlineFailed'))
      throw error
    } finally {
      useSessionDetailUiStore.getState().setIsManagingPages(false)
    }
  }

  return {
    pages,
    disabled: interactionMode === 'ai-inspect' && isGenerating,
    pageManagementDisabled: isGenerating || isAddingPage || isRetryingSinglePage || isManagingPages,
    collapsed: sidebarCollapsed,
    onAddBlankPage: () => openBlankPageDialog(selectedPage?.id || pages[0]?.id || ''),
    onAddPage: () => setAddPageDialogOpen(true),
    onMergeSessionPages: () => setMergeSessionPagesDialogOpen(true),
    onRetryFailedPage: (page: SessionPreviewPage) => void handleRetryFailedPage(page),
    onReorderPages: handleReorderPages,
    onDeletePage: (page: SessionPreviewPage) => setDeleteConfirmPageId(page.id),
    onRenamePage: (page: SessionPreviewPage) => openPageTitleEdit(page.id, page.title || ''),
    onUpdatePageOutline: handleUpdatePageOutline,
    onExportPagePptx: (page: SessionPreviewPage, options?: { imageOnly?: boolean }) =>
      void exportActions.exportPptx({ pageId: page.id, ...options }),
    onDownloadAllOutlines: () => void exportActions.exportOutlinesMarkdown(),
    onToggleCollapsed: toggleSidebarCollapsed
  }
}
