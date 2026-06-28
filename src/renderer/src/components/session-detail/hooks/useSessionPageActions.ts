import { useCallback } from 'react'
import { useSessionDetailUiStore } from '@renderer/store'
import type { SessionPreviewPage } from '../shared/types'
import { useSessionExportActions } from './useSessionExportActions'

export function useSessionPageActions(sessionId: string): {
  isExportingPptx: boolean
  exportPagePptx: (page: SessionPreviewPage, options?: { imageOnly?: boolean }) => void
  exportOutlinesMarkdown: () => void
  renamePage: (page: SessionPreviewPage) => void
  deletePage: (page: SessionPreviewPage) => void
} {
  const isExportingPptx = useSessionDetailUiStore((state) => state.isExportingPptx)
  const openPageTitleEdit = useSessionDetailUiStore((state) => state.openPageTitleEdit)
  const setDeleteConfirmPageId = useSessionDetailUiStore((state) => state.setDeleteConfirmPageId)
  const exportActions = useSessionExportActions(sessionId)

  const exportPagePptx = useCallback(
    (page: SessionPreviewPage, options?: { imageOnly?: boolean }) => {
      void exportActions.exportPptx({ pageId: page.id, ...options })
    },
    [exportActions]
  )

  const exportOutlinesMarkdown = useCallback(() => {
    void exportActions.exportOutlinesMarkdown()
  }, [exportActions])

  const renamePage = useCallback(
    (page: SessionPreviewPage) => {
      openPageTitleEdit(page.id, page.title || '')
    },
    [openPageTitleEdit]
  )

  const deletePage = useCallback(
    (page: SessionPreviewPage) => {
      setDeleteConfirmPageId(page.id)
    },
    [setDeleteConfirmPageId]
  )

  return {
    isExportingPptx,
    exportPagePptx,
    exportOutlinesMarkdown,
    renamePage,
    deletePage
  }
}
