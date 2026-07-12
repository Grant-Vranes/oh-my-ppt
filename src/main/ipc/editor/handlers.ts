import { ipcMain } from 'electron'
import log from 'electron-log/main.js'
import fs from 'fs'
import path from 'path'
import * as cheerio from 'cheerio'
import type { IpcContext } from '../context'
import { GitHistoryService } from '../../history/git-history-service'
import {
  parseElementAnimationConfig,
  patchElementAnimationConfig
} from '../../animation/element-animation'
import { validateDataAnimPatch } from '../../animation/data-anim-validator'
import type { ElementAnimationPatch } from '../../../shared/element-animation'
import { ensureSessionRuntimeCompatible } from '../session/runtime-assets'
import {
  withHtmlFileLock,
  clampDragValue,
  clampSizeValue,
  normalizeChildStyleUpdates,
  normalizeText,
  patchDraggedElementStyle,
  patchElementProperties,
  patchGenericElementProperties,
  ensureElementAnchorInHtml,
  patchAddElement,
  removeLegacyVideoAutoplayScript,
  stableSelectorFor
} from './shared'
import { applySyncElementToPageHtml } from './sync-element'

export function registerEditorHandlers(ctx: IpcContext): void {
  const { normalizeSessionId, assertPathInAllowedRoots, db, resolveSessionProjectDir } = ctx

  // ─── element-anchor:ensure ──────────────────────────────

  ipcMain.handle('element-anchor:ensure', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('元素锚定参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      htmlPath?: unknown
      pageId?: unknown
      selector?: unknown
      elementTag?: unknown
      formula?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    const selector = typeof record.selector === 'string' ? record.selector.trim() : ''
    const elementTag = typeof record.elementTag === 'string' ? record.elementTag.trim() : ''
    const formula = record.formula && typeof record.formula === 'object' ? record.formula : undefined
    if (!htmlPath) throw new Error('页面路径不能为空')
    if (!pageId) throw new Error('pageId 不能为空')
    if (!selector) throw new Error('元素 selector 不能为空')

    const safeHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'write',
      sessionId,
      htmlOnly: true
    })
    return await withHtmlFileLock(safeHtmlPath, async () => {
      const html = await fs.promises.readFile(safeHtmlPath, 'utf-8')
      const result = ensureElementAnchorInHtml(html, {
        pageId,
        selector,
        elementTag,
        formula: formula as Parameters<typeof ensureElementAnchorInHtml>[1]['formula']
      })
      if (result.changed) {
        await fs.promises.writeFile(safeHtmlPath, result.html, 'utf-8')
      }
      return {
        success: true,
        selector: result.selector,
        blockId: result.blockId,
        changed: result.changed
      }
    })
  })

  // ─── element-animation:get / set ───────────────────────

  ipcMain.handle('element-animation:get', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('元素动画参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      htmlPath?: unknown
      pageId?: unknown
      selector?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    const selector = typeof record.selector === 'string' ? record.selector.trim() : ''
    if (!sessionId) throw new Error('缺少 sessionId')
    if (!htmlPath) throw new Error('页面路径不能为空')
    if (!pageId) throw new Error('pageId 不能为空')
    if (!selector) throw new Error('元素 selector 不能为空')

    const safeHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'read',
      sessionId,
      htmlOnly: true
    })
    return await withHtmlFileLock(safeHtmlPath, async () => {
      const html = await fs.promises.readFile(safeHtmlPath, 'utf-8')
      return { animation: parseElementAnimationConfig(html, selector) }
    })
  })

  ipcMain.handle('element-animation:set', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('元素动画参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      htmlPath?: unknown
      pageId?: unknown
      selector?: unknown
      patch?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    const selector = typeof record.selector === 'string' ? record.selector.trim() : ''
    const patch =
      record.patch && typeof record.patch === 'object'
        ? (record.patch as ElementAnimationPatch)
        : null
    if (!sessionId) throw new Error('缺少 sessionId')
    if (!htmlPath) throw new Error('页面路径不能为空')
    if (!pageId) throw new Error('pageId 不能为空')
    if (!selector) throw new Error('元素 selector 不能为空')
    if (!patch) throw new Error('元素动画 patch 不能为空')
    const session = await db.getSession(sessionId)
    if (!session) throw new Error('会话不存在或已被删除')

    const safeHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'write',
      sessionId,
      htmlOnly: true
    })
    const projectDir = await resolveSessionProjectDir(sessionId)
    await ensureSessionRuntimeCompatible(ctx, projectDir)
    const history = new GitHistoryService(db)
    await history.ensureBaseline(sessionId, projectDir).catch((error) => {
      log.warn('[element-animation:set] ensure history baseline failed', {
        sessionId,
        message: error instanceof Error ? error.message : String(error)
      })
    })

    const result = await withHtmlFileLock(safeHtmlPath, async () => {
      const html = await fs.promises.readFile(safeHtmlPath, 'utf-8')
      const next = patchElementAnimationConfig(html, selector, patch)
      // Fail only on contract violations this patch newly introduces on the target.
      // Pre-existing violations elsewhere must not block the targeted edit.
      const { newErrors } = validateDataAnimPatch(html, next.html)
      if (newErrors.length > 0) {
        throw new Error(`元素动画验证失败：${newErrors.join('; ')}`)
      }
      if (next.changed) {
        await fs.promises.writeFile(safeHtmlPath, next.html, 'utf-8')
      }
      return next
    })

    if (result.changed) {
      await history.recordOperation({
        sessionId,
        projectDir,
        type: 'edit',
        scope: 'selector',
        prompt: result.config
          ? `为元素设置动画：${result.config.type} ${result.config.durationMs}ms`
          : '关闭元素动画',
        metadata: {
          action: 'setElementAnimation',
          pageId,
          selector,
          animation: result.config
        }
      })
    }

    return {
      success: true,
      changed: result.changed,
      animation: result.config
    }
  })

  // ─── element-editor:delete-element ──────────────────────

  ipcMain.handle('element-editor:delete-element', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('删除元素参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      htmlPath?: unknown
      pageId?: unknown
      selector?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    const selector = typeof record.selector === 'string' ? record.selector.trim() : ''
    if (!htmlPath) throw new Error('页面路径不能为空')
    if (!pageId) throw new Error('pageId 不能为空')
    if (!selector) throw new Error('删除元素 selector 不能为空')

    const safeHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'write',
      sessionId,
      htmlOnly: true
    })
    await withHtmlFileLock(safeHtmlPath, async () => {
      const html = await fs.promises.readFile(safeHtmlPath, 'utf-8')
      const $ = cheerio.load(html, { scriptingEnabled: false })
      const target = $(selector).first()
      if (!target || target.length === 0) {
        throw new Error('无法定位删除元素：页面内容可能已经变化')
      }
      target.remove()
      await fs.promises.writeFile(safeHtmlPath, $.html(), 'utf-8')
    })
    if (sessionId) {
      const projectDir = await resolveSessionProjectDir(sessionId)
      await new GitHistoryService(db).recordOperation({
        sessionId,
        projectDir,
        type: 'edit',
        scope: 'selector',
        prompt: '删除元素',
        metadata: { pageId, selector, action: 'delete' }
      })
    }
    return { success: true }
  })

  // ─── edit:save-batch ────────────────────────────────────

  ipcMain.handle('edit:save-batch', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('批量保存参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      pageId?: unknown
      htmlPath?: unknown
      dragEdits?: unknown
      textEdits?: unknown
      propertyEdits?: unknown
      deletes?: unknown
      addElements?: unknown
      prompt?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    if (!sessionId) throw new Error('缺少 sessionId')
    if (!pageId) throw new Error('缺少 pageId')
    if (!htmlPath) throw new Error('缺少 htmlPath')

    const rawDrag = Array.isArray(record.dragEdits) ? record.dragEdits : []
    const rawText = Array.isArray(record.textEdits) ? record.textEdits : []
    const rawProperty = Array.isArray(record.propertyEdits) ? record.propertyEdits : []
    const rawDeletes = Array.isArray(record.deletes) ? record.deletes : []
    const rawAddElements = Array.isArray(record.addElements) ? record.addElements : []

    const safeHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'write',
      sessionId,
      htmlOnly: true
    })

    let deleteCount = 0
    let addCount = 0
    const warnings: string[] = []
    await withHtmlFileLock(safeHtmlPath, async () => {
      let html = await fs.promises.readFile(safeHtmlPath, 'utf-8')

      // Apply deletes first
      for (const item of rawDeletes) {
        if (!item || typeof item !== 'object') continue
        const d = item as { selector?: unknown }
        const selector = typeof d.selector === 'string' ? d.selector.trim() : ''
        if (!selector) continue
        const $ = cheerio.load(html, { scriptingEnabled: false })
        const target = $(selector).first()
        if (target.length > 0) {
          const artTextBlockId =
            target.attr('data-ppt-art-text') !== undefined
              ? (target.attr('data-block-id') || '').trim()
              : ''
          if (artTextBlockId) {
            $('style[data-ppt-art-text-style]').each((_, styleNode) => {
              const style = $(styleNode)
              if ((style.attr('data-ppt-art-text-style') || '') === artTextBlockId) {
                style.remove()
              }
            })
          }
          target.remove()
          html = $.html()
          deleteCount++
        }
      }

      // Apply add elements (after deletes, before drag/text)
      for (const item of rawAddElements) {
        if (!item || typeof item !== 'object') continue
        const e = item as {
          parentSelector?: unknown
          htmlFragment?: unknown
          insertIndex?: unknown
        }
        const parentSelector = typeof e.parentSelector === 'string' ? e.parentSelector.trim() : ''
        const htmlFragment = typeof e.htmlFragment === 'string' ? e.htmlFragment : ''
        if (!parentSelector || !htmlFragment) continue
        const insertIndex = typeof e.insertIndex === 'number' ? e.insertIndex : -1
        html = patchAddElement(html, parentSelector, htmlFragment, insertIndex)
        addCount++
      }

      // Apply drag edits
      for (const item of rawDrag) {
        if (!item || typeof item !== 'object') continue
        const e = item as {
          selector?: unknown
          x?: unknown
          y?: unknown
          width?: unknown
          height?: unknown
          childUpdates?: unknown
          isAbsoluteMode?: unknown
          zIndex?: unknown
          zIndexOnly?: unknown
        }
        const selector = typeof e.selector === 'string' ? e.selector.trim() : ''
        if (!selector) continue
        const zIndex = typeof e.zIndex === 'number' ? e.zIndex : undefined
        const zIndexOnly = !!e.zIndexOnly
        html = patchDraggedElementStyle(
          html,
          selector,
          clampDragValue(e.x),
          clampDragValue(e.y),
          clampSizeValue(e.width),
          clampSizeValue(e.height),
          normalizeChildStyleUpdates(e.childUpdates),
          !!e.isAbsoluteMode,
          zIndex,
          zIndexOnly
        )
      }

      // Apply text edits
      for (const item of rawText) {
        if (!item || typeof item !== 'object') continue
        const e = item as {
          selector?: unknown
          patch?: unknown
        }
        const selector = typeof e.selector === 'string' ? e.selector.trim() : ''
        if (!selector) continue
        const rawPatch =
          e.patch && typeof e.patch === 'object' ? (e.patch as Record<string, unknown>) : {}
        const rawStyle =
          rawPatch.style && typeof rawPatch.style === 'object'
            ? (rawPatch.style as Record<string, unknown>)
            : {}
        html = patchElementProperties(html, selector, {
          html: typeof rawPatch.html === 'string' ? rawPatch.html : undefined,
          text: typeof rawPatch.text === 'string' ? rawPatch.text : undefined,
          style: {
            color: typeof rawStyle.color === 'string' ? rawStyle.color : undefined,
            fontSize: typeof rawStyle.fontSize === 'string' ? rawStyle.fontSize : undefined,
            fontWeight: typeof rawStyle.fontWeight === 'string' ? rawStyle.fontWeight : undefined,
            textAlign: typeof rawStyle.textAlign === 'string' ? rawStyle.textAlign : undefined
          }
        })
      }

      // Apply generic property edits
      for (const item of rawProperty) {
        if (!item || typeof item !== 'object') continue
        const e = item as {
          selector?: unknown
          blockId?: unknown
          patch?: unknown
        }
        const selector = typeof e.selector === 'string' ? e.selector.trim() : ''
        const blockId = typeof e.blockId === 'string' ? e.blockId.trim() : ''
        if (!selector && !blockId) continue
        const $ = cheerio.load(html, { scriptingEnabled: false })
        const blockSelector = blockId ? stableSelectorFor(pageId, blockId) : ''
        const resolvedSelector =
          blockSelector && $(blockSelector).first().length > 0
            ? blockSelector
            : selector && $(selector).first().length > 0
              ? selector
              : ''
        if (!resolvedSelector) {
          warnings.push(`属性编辑目标不存在：${blockId || selector}`)
          continue
        }
        const patch = e.patch && typeof e.patch === 'object' ? (e.patch as Record<string, unknown>) : {}
        const style = patch.style && typeof patch.style === 'object' ? patch.style : undefined
        const attrs = patch.attrs && typeof patch.attrs === 'object' ? patch.attrs : undefined
        const formula = patch.formula && typeof patch.formula === 'object' ? patch.formula : undefined
        const chart = patch.chart && typeof patch.chart === 'object' ? patch.chart : undefined
        try {
          html = patchGenericElementProperties(html, resolvedSelector, {
            text: typeof patch.text === 'string' ? patch.text : undefined,
            html: typeof patch.html === 'string' ? patch.html : undefined,
            formula: formula as Parameters<typeof patchGenericElementProperties>[2]['formula'],
            chart: chart as Parameters<typeof patchGenericElementProperties>[2]['chart'],
            textTarget: patch.textTarget,
            style: style as Parameters<typeof patchGenericElementProperties>[2]['style'],
            attrs: attrs as Parameters<typeof patchGenericElementProperties>[2]['attrs']
          })
        } catch (error) {
          warnings.push(
            error instanceof Error
              ? `属性编辑失败：${error.message}`
              : `属性编辑失败：${blockId || selector}`
          )
        }
      }

      html = removeLegacyVideoAutoplayScript(html)
      await fs.promises.writeFile(safeHtmlPath, html, 'utf-8')
    })

    // Record history snapshot
    const projectDir = await resolveSessionProjectDir(sessionId)
    const dragCount = rawDrag.length
    const textCount = rawText.length
    const propertyCount = rawProperty.length
    const prompt = typeof record.prompt === 'string' ? record.prompt : '手动调整'
    await new GitHistoryService(db).recordOperation({
      sessionId,
      projectDir,
      type: 'edit',
      scope: 'selector',
      prompt,
      metadata: { pageId, dragCount, textCount, propertyCount, deleteCount, addCount }
    })

    return { success: true, dragCount, textCount, propertyCount, deleteCount, addCount, warnings }
  })

  // ─── element-editor:apply-sync-to-all-pages ─────────────

  ipcMain.handle('element-editor:apply-sync-to-all-pages', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('同步元素参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      pageId?: unknown
      htmlPath?: unknown
      sourceHtmlFragment?: unknown
      syncElementId?: unknown
      sourceBlockId?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    const sourceHtmlFragment =
      typeof record.sourceHtmlFragment === 'string' ? record.sourceHtmlFragment.trim() : ''
    const syncElementId =
      typeof record.syncElementId === 'string' ? record.syncElementId.trim() : undefined
    const sourceBlockId =
      typeof record.sourceBlockId === 'string' ? record.sourceBlockId.trim() : undefined
    if (!sessionId) throw new Error('缺少 sessionId')
    if (!pageId) throw new Error('缺少 pageId')
    if (!htmlPath) throw new Error('缺少 htmlPath')
    if (!sourceHtmlFragment) throw new Error('缺少要同步的元素')

    const session = await db.getSession(sessionId)
    if (!session) throw new Error('会话不存在或已被删除')
    const projectDir = await resolveSessionProjectDir(sessionId)
    const safeSourceHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'write',
      sessionId,
      htmlOnly: true
    })
    const pages = await db.listSessionPages(sessionId)
    if (pages.length === 0) throw new Error('没有可同步的页面')

    let resolvedSyncElementId = syncElementId || ''
    let changedCount = 0
    let insertedCount = 0
    let updatedCount = 0
    const changedPageIds: string[] = []

    for (const page of pages) {
      const rawPagePath = page.html_path || `${page.file_slug}.html`
      const candidatePath = path.isAbsolute(rawPagePath)
        ? rawPagePath
        : path.join(projectDir, rawPagePath)
      if (!fs.existsSync(candidatePath)) continue
      const safePagePath = await assertPathInAllowedRoots({
        filePath: candidatePath,
        mode: 'write',
        sessionId,
        htmlOnly: true
      })
      const isSourcePage = path.resolve(safePagePath) === path.resolve(safeSourceHtmlPath)
      const result = await withHtmlFileLock(safePagePath, async () => {
        const html = await fs.promises.readFile(safePagePath, 'utf-8')
        const patched = applySyncElementToPageHtml({
          html,
          sourceHtmlFragment,
          syncElementId: resolvedSyncElementId || undefined,
          preserveSourceBlockId: isSourcePage ? sourceBlockId : undefined
        })
        if (patched.changed) {
          await fs.promises.writeFile(safePagePath, patched.html, 'utf-8')
        }
        return patched
      })
      if (!resolvedSyncElementId) resolvedSyncElementId = result.syncElementId
      if (result.changed) {
        changedCount++
        if (result.inserted) insertedCount++
        if (result.updated) updatedCount++
        changedPageIds.push(page.file_slug)
      }
    }

    if (changedCount > 0) {
      await new GitHistoryService(db).recordOperation({
        sessionId,
        projectDir,
        type: 'edit',
        scope: 'deck',
        prompt: '同步元素到所有页面',
        metadata: {
          action: 'applySyncElementToAllPages',
          sourcePageId: pageId,
          syncElementId: resolvedSyncElementId,
          changedCount,
          insertedCount,
          updatedCount,
          changedPageIds
        }
      })
    }

    return {
      success: true,
      syncElementId: resolvedSyncElementId,
      changedCount,
      insertedCount,
      updatedCount
    }
  })

  // ─── drag-editor:update-element-layout ──────────────────

  ipcMain.handle('drag-editor:update-element-layout', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('拖拽更新参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      htmlPath?: unknown
      pageId?: unknown
      selector?: unknown
      x?: unknown
      y?: unknown
      width?: unknown
      height?: unknown
      childUpdates?: unknown
      isAbsoluteMode?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    const selector = typeof record.selector === 'string' ? record.selector.trim() : ''
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    if (!htmlPath) throw new Error('页面路径不能为空')
    if (!pageId) throw new Error('pageId 不能为空')
    if (!selector) throw new Error('拖拽元素 selector 不能为空')

    const safeHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'write',
      sessionId,
      htmlOnly: true
    })
    await withHtmlFileLock(safeHtmlPath, async () => {
      const html = await fs.promises.readFile(safeHtmlPath, 'utf-8')
      const nextHtml = patchDraggedElementStyle(
        html,
        selector,
        clampDragValue(record.x),
        clampDragValue(record.y),
        clampSizeValue(record.width),
        clampSizeValue(record.height),
        normalizeChildStyleUpdates(record.childUpdates),
        !!record.isAbsoluteMode
      )
      await fs.promises.writeFile(safeHtmlPath, nextHtml, 'utf-8')
    })
    return { success: true }
  })

  // ─── text-editor:update-element-text ────────────────────

  ipcMain.handle('text-editor:update-element-text', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('文字更新参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      htmlPath?: unknown
      pageId?: unknown
      selector?: unknown
      text?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    const selector = typeof record.selector === 'string' ? record.selector.trim() : ''
    const text = normalizeText(record.text)
    if (!htmlPath) throw new Error('页面路径不能为空')
    if (!pageId) throw new Error('pageId 不能为空')
    if (!selector) throw new Error('文字元素 selector 不能为空')
    if (!text) throw new Error('文字不能为空')
    if (text.length > 500) throw new Error('文字不能超过 500 个字符')

    const safeHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'write',
      sessionId,
      htmlOnly: true
    })
    await withHtmlFileLock(safeHtmlPath, async () => {
      const html = await fs.promises.readFile(safeHtmlPath, 'utf-8')
      const nextHtml = patchElementProperties(html, selector, { text })
      await fs.promises.writeFile(safeHtmlPath, nextHtml, 'utf-8')
    })
    return { success: true }
  })

  // ─── text-editor:update-element-properties ──────────────

  ipcMain.handle('text-editor:update-element-properties', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      throw new Error('文字属性更新参数无效')
    }
    const record = payload as {
      sessionId?: unknown
      htmlPath?: unknown
      pageId?: unknown
      selector?: unknown
      patch?: unknown
    }
    const sessionId = normalizeSessionId(record.sessionId)
    const htmlPath = typeof record.htmlPath === 'string' ? record.htmlPath : ''
    const pageId = typeof record.pageId === 'string' ? record.pageId.trim() : ''
    const selector = typeof record.selector === 'string' ? record.selector.trim() : ''
    const rawPatch =
      record.patch && typeof record.patch === 'object'
        ? (record.patch as {
            text?: unknown
            html?: unknown
            formula?: unknown
            textTarget?: unknown
            style?: unknown
          })
        : {}
    const rawStyle =
      rawPatch.style && typeof rawPatch.style === 'object'
        ? (rawPatch.style as Record<string, unknown>)
        : {}
    if (!htmlPath) throw new Error('页面路径不能为空')
    if (!pageId) throw new Error('pageId 不能为空')
    if (!selector) throw new Error('文字元素 selector 不能为空')

    const safeHtmlPath = await assertPathInAllowedRoots({
      filePath: htmlPath,
      mode: 'write',
      sessionId,
      htmlOnly: true
    })
    await withHtmlFileLock(safeHtmlPath, async () => {
      const html = await fs.promises.readFile(safeHtmlPath, 'utf-8')
      const nextHtml = patchElementProperties(html, selector, {
        html: typeof rawPatch.html === 'string' ? rawPatch.html : undefined,
        text: typeof rawPatch.text === 'string' ? rawPatch.text : undefined,
        textTarget: rawPatch.textTarget,
        style: {
          color: typeof rawStyle.color === 'string' ? rawStyle.color : undefined,
          fontSize: typeof rawStyle.fontSize === 'string' ? rawStyle.fontSize : undefined,
          fontWeight: typeof rawStyle.fontWeight === 'string' ? rawStyle.fontWeight : undefined,
          textAlign: typeof rawStyle.textAlign === 'string' ? rawStyle.textAlign : undefined
        }
      })
      await fs.promises.writeFile(safeHtmlPath, nextHtml, 'utf-8')
    })
    return { success: true }
  })
}
