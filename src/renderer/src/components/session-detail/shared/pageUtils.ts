import type { GeneratedPage } from '@renderer/store'
import type { SessionPreviewPage } from './types'

export function isPageGenerationLocked(
  pageId: string | null | undefined,
  options: {
    isAddingPage: boolean
    addingPageId: string | null
    isRetryingSinglePage: boolean
    retryingSinglePageId: string | null
  }
): boolean {
  if (!pageId) return false
  return (
    (options.isAddingPage && (!options.addingPageId || options.addingPageId === pageId)) ||
    (options.isRetryingSinglePage &&
      (!options.retryingSinglePageId || options.retryingSinglePageId === pageId))
  )
}

export function normalizePagesForSelection(pages: GeneratedPage[]): SessionPreviewPage[] {
  return [...pages]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page) => {
      const pageId = page.pageId || `page-${page.pageNumber}`
      return {
        ...page,
        id: page.id || pageId,
        pageId
      }
    })
}
