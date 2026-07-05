import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import {
  buildStyleSwitchUserMessage,
  collectFailedStyleSwitchPageIds
} from '../../../src/main/ipc/generation/style-switch'

describe('style switch generation', () => {
  it('builds a strict visual-only deck edit instruction', () => {
    const message = buildStyleSwitchUserMessage('极简白')
    expect(message).toContain('现有风格「极简白」')
    expect(message).toContain('禁止修改每页文字内容')
    expect(message).toContain('必须逐字逐项原样保留')
    expect(message).toContain('页面布局与视觉结构可以按现有风格重新设计')
    expect(message).not.toContain('禁止改变信息结构和内容层级')
  })

  it('preserves style names containing prompt delimiters', () => {
    const styleName = '「未来」“数据”\n第二行'
    const message = buildStyleSwitchUserMessage(styleName)

    expect(message).toContain(`现有风格「${styleName}」`)
    expect(message).toContain('禁止修改每页文字内容')
    expect(message).toContain('页面布局与视觉结构可以按现有风格重新设计')
  })

  it('collects failed retry page ids with legacy fallbacks', () => {
    expect(
      collectFailedStyleSwitchPageIds([
        { id: 'row-0', page_id: 'page-0', file_slug: 'slug-0', status: 'failed' },
        { id: 'row-1', file_slug: 'page-1', legacy_page_id: 'legacy-1', status: 'failed' },
        { id: 'row-2', file_slug: '', legacy_page_id: 'legacy-2', status: 'failed' },
        { id: 'row-3', file_slug: '', legacy_page_id: '', status: 'failed' },
        { id: 'row-4', file_slug: 'page-4', legacy_page_id: 'legacy-4', status: 'completed' },
        { id: '', file_slug: '', legacy_page_id: '', status: 'failed' }
      ])
    ).toEqual(['page-0', 'page-1', 'legacy-2', 'row-3'])
  })

  it('updates the session snapshot before resolving the deck edit context', () => {
    const source = fs.readFileSync(
      path.resolve('src/main/ipc/engine/generation-handlers.ts'),
      'utf8'
    )
    const handler = source.slice(source.indexOf("ipcMain.handle('generate:switchStyle'"))
    expect(handler.indexOf('jobManager.assertNotCancelled(reserved)')).toBeLessThan(
      handler.indexOf('await db.updateSessionStyleId')
    )
    expect(handler.indexOf('await db.updateSessionStyleId')).toBeGreaterThan(-1)
    expect(
      handler.indexOf('const updatedStyleSnapshot = await db.getSessionStyleSnapshot')
    ).toBeGreaterThan(handler.indexOf('await db.updateSessionStyleId'))
    expect(
      handler.indexOf('await db.updateSessionDesignContract(sessionId, null)')
    ).toBeGreaterThan(handler.indexOf('await db.getSessionStyleSnapshot'))
    expect(handler.indexOf('context = await resolveEditContext')).toBeGreaterThan(
      handler.indexOf('await db.updateSessionDesignContract(sessionId, null)')
    )
    expect(handler).toContain('resetVisualStyle: true')
    expect(handler.indexOf('await buildDesignContractWithLLM')).toBeGreaterThan(
      handler.indexOf('resetVisualStyle: true')
    )
    expect(handler.indexOf('context.designContract = designContract')).toBeGreaterThan(
      handler.indexOf('await db.updateSessionDesignContract(sessionId, designContract)')
    )
    expect(handler.indexOf('await executeDeckAllPageEditGeneration')).toBeGreaterThan(
      handler.indexOf('context.designContract = designContract')
    )
    expect(handler).toContain('await executeDeckAllPageEditGeneration')
    expect(handler).toContain('restoreSessionStyleState')
    expect(handler).toContain('styleStateCommitted = true')
    expect(handler).toContain('stylePageEditingStarted = true')
    expect(handler).toContain('error instanceof DeckEditIndexMutationError')
    expect(handler).toContain('failed to restore previous style snapshot')
    expect(handler).toContain('failed to restore previous design contract')

    const databaseSource = fs.readFileSync(path.resolve('src/main/db/database.ts'), 'utf8')
    const restoreMethod = databaseSource.slice(
      databaseSource.indexOf('async restoreSessionStyleState'),
      databaseSource.indexOf('async updateSessionDesignContract')
    )
    expect(restoreMethod).toContain('styleId: string | null')
    expect(restoreMethod).toContain('this.db.transaction')
    expect(restoreMethod).toContain('.delete(schema.sessionStyleSnapshots)')
  })

  it('does not carry the previous visual contract into the new style', () => {
    const message = buildStyleSwitchUserMessage('极简白')

    expect(message).toContain('禁止沿用此前风格的配色、装饰和布局语言')
    expect(message).toContain('视觉设计必须以当前现有风格规范为准')

    const flowSource = fs.readFileSync(
      path.resolve('src/main/ipc/generation/edit-deck-allpage-flow.ts'),
      'utf8'
    )
    expect(flowSource).toContain('!context.resetVisualStyle &&')
    expect(flowSource).toContain('!context.resetVisualStyle && page.layout_intent')
    expect(flowSource).toContain(
      'let savedDesignContract: DesignContract | undefined = context.designContract'
    )
  })

  it('closes only completed style switches and refreshes through shared stores', () => {
    const styleViewSource = fs.readFileSync(
      path.resolve('src/renderer/src/components/session-detail/style/StyleView.tsx'),
      'utf8'
    )
    const activityDialogSource = fs.readFileSync(
      path.resolve('src/renderer/src/components/session-detail/modal/GenerationActivityDialog.tsx'),
      'utf8'
    )

    expect(styleViewSource).toContain('setSwitchTarget(null)')
    expect(styleViewSource).toContain('startStyleSwitch')
    expect(activityDialogSource).toContain('activeRetryContext')
    expect(activityDialogSource).toContain('shouldAutoCloseGenerationActivity(')
    expect(activityDialogSource).toContain("activityKind === 'style-switch'")

    const ipcContextSource = fs.readFileSync(path.resolve('src/main/ipc/context.ts'), 'utf8')
    expect(ipcContextSource).toContain('activityKind: state.activityKind')
    expect(ipcContextSource).toContain('activityKind: chunk.payload.activityKind ?? null')
    const autoCloseIndex = activityDialogSource.indexOf(
      'if (shouldAutoCloseGenerationActivity(event.type, nextFailedPageCount))'
    )
    expect(activityDialogSource.indexOf('setOpen(false)', autoCloseIndex)).toBeGreaterThan(
      activityDialogSource.indexOf('activeRetryContext')
    )
    expect(activityDialogSource.indexOf('.loadSession(sessionId,')).toBeGreaterThan(
      activityDialogSource.indexOf('setOpen(false)')
    )
    expect(activityDialogSource).toContain('useSessionDetailUiStore.getState().bumpPreviewKey()')
    expect(activityDialogSource).toContain('activeSessionIdRef.current === sessionId')
    expect(activityDialogSource).not.toContain('onStyleSwitchCompleted')
  })

  it('retries only failed style-switch pages through a dedicated handler', () => {
    const handlerSource = fs.readFileSync(
      path.resolve('src/main/ipc/engine/generation-handlers.ts'),
      'utf8'
    )
    const retryHandler = handlerSource.slice(
      handlerSource.indexOf("ipcMain.handle('generate:retryStyleSwitch'")
    )

    expect(retryHandler).toContain('collectFailedStyleSwitchPageIds')
    expect(retryHandler).toContain('await listFailedGenerationPagesForRetry(sessionId, failedRunId)')
    expect(retryHandler).toContain('context.selectPageIds = failedPageIds')
    expect(retryHandler).toContain('buildStyleSwitchUserMessage(styleSnapshot.styleName)')
    expect(retryHandler).toContain('context.designContract = JSON.parse(session.designContract)')
    expect(retryHandler).not.toContain("if (!style || style.active === false)")
    expect(retryHandler).toContain('await executeDeckAllPageEditGeneration')

    const activityDialogSource = fs.readFileSync(
      path.resolve('src/renderer/src/components/session-detail/modal/GenerationActivityDialog.tsx'),
      'utf8'
    )
    expect(activityDialogSource).toContain('await ipc.retrySessionStyle')
    expect(activityDialogSource).toContain('await ipc.retryDeckEdit')
    expect(activityDialogSource).toContain('RetryFailedPagesButton')
    expect(activityDialogSource).toContain("t('sessionDetail.activityRetryFailedPages'")
  })

  it('uses the session style snapshot when the global style has been disabled', () => {
    const handlerSource = fs.readFileSync(
      path.resolve('src/main/ipc/config/style-handlers.ts'),
      'utf8'
    )

    expect(handlerSource).toContain('await db.getSessionStyleSnapshot(sessionId)')
    expect(handlerSource).toContain('items.unshift({')
    expect(handlerSource).toContain('id: snapshot.styleId')
  })

  it('retries normal deck edits with their original request instead of generation retry', () => {
    const handlerSource = fs.readFileSync(
      path.resolve('src/main/ipc/engine/generation-handlers.ts'),
      'utf8'
    )
    const retryHandler = handlerSource.slice(
      handlerSource.indexOf("ipcMain.handle('generate:retryDeckEdit'"),
      handlerSource.indexOf("ipcMain.handle('generate:startTemplate'")
    )

    expect(retryHandler).toContain('await listFailedGenerationPagesForRetry(sessionId, failedRunId)')
    expect(retryHandler).toContain('userMessage,')
    expect(retryHandler).toContain('selectPageIds: failedPageIds')
    expect(retryHandler).toContain('persistUserMessage: false')
    expect(retryHandler).toContain('await executeDeckAllPageEditGeneration')
    expect(retryHandler).not.toContain('executeRetryFailedPages')
  })

  it('keeps internal style-switch prompts out of the visible chat history', () => {
    const handlerSource = fs.readFileSync(
      path.resolve('src/main/ipc/engine/generation-handlers.ts'),
      'utf8'
    )
    const editFlowSource = fs.readFileSync(
      path.resolve('src/main/ipc/generation/edit-flow.ts'),
      'utf8'
    )

    expect(handlerSource).toContain('persistUserMessage: false')
    expect(editFlowSource).toContain('if (input.persistUserMessage)')
  })

  it('keeps the activity dialog open while failed style-switch pages are pending retry', () => {
    const activityDialogSource = fs.readFileSync(
      path.resolve('src/renderer/src/components/session-detail/modal/GenerationActivityDialog.tsx'),
      'utf8'
    )

    // 失败状态 + 有 retryContext + 有 failedPageCount 时弹窗不可关：
    // 失败 + 走开 + 回来，retryContext 仍在线，能直接点「重试失败页面」。
    // 这避免了 styleId 已提交、retryContext 被清、再也无法重试的死锁。
    expect(activityDialogSource).toContain(
      'const blockClose = status === \'running\' || (retryContext !== null && failedPageCount > 0)'
    )
    expect(activityDialogSource).toContain('if (!nextOpen && blockClose) return')
    expect(activityDialogSource).toContain('showClose={!blockClose}')
    expect(activityDialogSource).toContain('if (blockClose) event.preventDefault()')
  })
})
