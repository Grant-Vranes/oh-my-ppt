import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const readSource = (filePath: string): string => fs.readFileSync(path.resolve(filePath), 'utf8')

describe('generated page addition', () => {
  it('creates a blank target page before generating its content', () => {
    const dialogSource = readSource(
      'src/renderer/src/components/session-detail/modal/AddPageDialog.tsx'
    )
    const addPageFlowSource = readSource('src/main/generation/add-page-flow.ts')
    const blankPageServiceSource = readSource('src/main/session/page-management-service.ts')

    const createBlankPageIndex = dialogSource.indexOf(
      'ipc.createBlankSessionPage({ sessionId, sourcePageId })'
    )
    const addPageIndex = dialogSource.indexOf('await ipc.addPage({')

    expect(createBlankPageIndex).toBeGreaterThan(-1)
    expect(createBlankPageIndex).toBeLessThan(addPageIndex)
    expect(dialogSource).toContain('targetPageId = blankPage.selectedPageId')
    expect(dialogSource.indexOf('setAddingPageId(targetPageId)')).toBeGreaterThan(
      createBlankPageIndex
    )
    expect(dialogSource).toContain('targetPageId')
    expect(addPageFlowSource).toContain('targetPageId?: string')
    expect(addPageFlowSource).toContain('page.id === context.targetPageId')
    expect(addPageFlowSource).toContain('page.id === targetPage.id ? newPageEntry : page')
    expect(blankPageServiceSource).toContain('pages.slice(0, sourceIndex + 1)')
    expect(blankPageServiceSource).toContain('pages.slice(sourceIndex + 1)')
  })

  it('hands generated page insertion and single-page retry to persistent jobs', () => {
    const handlerSource = readSource('src/main/generation/handlers.ts')
    const addPageHandler = handlerSource.slice(
      handlerSource.indexOf("ipcMain.handle('generate:addPage'"),
      handlerSource.indexOf("ipcMain.handle('generate:retrySinglePage'")
    )
    const retrySinglePageHandler = handlerSource.slice(
      handlerSource.indexOf("ipcMain.handle('generate:retrySinglePage'"),
      handlerSource.indexOf("ipcMain.handle('generate:cancel'")
    )
    const jobManagerSource = readSource('src/main/generation/job-manager.ts')

    expect(addPageHandler).toContain('jobManager.enqueue({')
    expect(addPageHandler).toContain("kind: 'add-page'")
    expect(addPageHandler).toContain("activityKind: 'addPage'")
    expect(addPageHandler).toContain('targetPageId: targetPage?.id || addPageContext.targetPageId')
    expect(retrySinglePageHandler).toContain('jobManager.enqueue({')
    expect(retrySinglePageHandler).toContain("kind: 'single-page-retry'")
    expect(retrySinglePageHandler).toContain("activityKind: 'single-page-retry'")
    expect(retrySinglePageHandler).toContain('targetPageId: retryCtx.pageId')
    expect(jobManagerSource).toContain("'add-page'")
    expect(jobManagerSource).toContain("'single-page-retry'")
  })

  it('keeps placeholder state recoverable when a generated-page job fails to start or finish', () => {
    const handlerSource = readSource('src/main/generation/handlers.ts')
    const finalizationSource = readSource('src/main/generation/finalization.ts')
    const dialogSource = readSource(
      'src/renderer/src/components/session-detail/modal/AddPageDialog.tsx'
    )
    const sidebarControllerSource = readSource(
      'src/renderer/src/components/session-detail/sidebar/usePageSidebarController.ts'
    )
    const previewStageSource = readSource(
      'src/renderer/src/components/session-detail/preview/PreviewStage.tsx'
    )

    expect(handlerSource).toContain("status: 'pending'")
    expect(finalizationSource).toContain("context.effectiveMode === 'addPage'")
    expect(finalizationSource).toContain("status: 'failed'")
    expect(dialogSource).toContain('await loadSession(sessionId)')
    expect(sidebarControllerSource).toContain('useGenerateStore.getState().addPage(page)')
    expect(previewStageSource).toContain("selectedPage?.status === 'pending'")
  })
})
