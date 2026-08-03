import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'node:url'
import log from 'electron-log/main.js'
import { nanoid } from 'nanoid'
import * as cheerio from 'cheerio'
import type { IpcContext } from '../ipc/context'
import { allowLocalAssetRoot } from '../io/local-asset-roots'
import {
  clampDragValue,
  clampSizeValue,
  ensureElementAnchorInHtml,
  normalizeChildStyleUpdates,
  normalizeLayoutIslandStyle,
  patchAddElement,
  patchDraggedElementStyle,
  patchElementProperties,
  patchGenericElementProperties,
  removeLegacyVideoAutoplayScript,
  stableSelectorFor
} from '../element-editor/shared'
import { normalizeImportedHtml } from './html-editor-import'
import {
  commitHtmlFile,
  ensureHtmlRepo,
  getHtmlRepoHead,
  readHtmlAtCommit,
  restoreHtmlFileAtCommit,
  restoreHtmlRepoHead
} from './html-editor-git'
import {
  refreshHtmlEditorCoverThumbnail,
  warmHtmlEditorCoverThumbnails
} from './html-editor-thumbnail'
import {
  getHtmlEditorMediaExtensions,
  importHtmlEditorMedia,
  listHtmlEditorMedia,
  type HtmlEditorMediaType
} from './html-editor-media'

const HTML_EDITOR_DIRNAME = 'html-editor'
const HTML_EDITOR_HTML_CACHE_LIMIT = 24
const htmlDocumentHtmlCache = new Map<string, string>()
const htmlDocumentOpenCache = new Map<
  string,
  { html: string; modifiedAtMs: number; size: number }
>()

function rememberHtmlEditorDocumentHtml(docId: string, html: string): void {
  if (!docId || !html) return
  htmlDocumentHtmlCache.delete(docId)
  htmlDocumentHtmlCache.set(docId, html)
  while (htmlDocumentHtmlCache.size > HTML_EDITOR_HTML_CACHE_LIMIT) {
    const oldestDocId = htmlDocumentHtmlCache.keys().next().value
    if (!oldestDocId) break
    htmlDocumentHtmlCache.delete(oldestDocId)
  }
}

function rememberHtmlEditorOpenHtml(
  docId: string,
  html: string,
  file: { mtimeMs: number; size: number }
): void {
  if (!docId || !html) return
  htmlDocumentOpenCache.delete(docId)
  htmlDocumentOpenCache.set(docId, { html, modifiedAtMs: file.mtimeMs, size: file.size })
  while (htmlDocumentOpenCache.size > HTML_EDITOR_HTML_CACHE_LIMIT) {
    const oldestDocId = htmlDocumentOpenCache.keys().next().value
    if (!oldestDocId) break
    htmlDocumentOpenCache.delete(oldestDocId)
  }
}

function forgetHtmlEditorDocumentHtml(docId: string): void {
  htmlDocumentHtmlCache.delete(docId)
  htmlDocumentOpenCache.delete(docId)
}

export function resolveHtmlEditorDocumentPath(input: {
  storagePath: string
  docId: string
  storedHtmlPath: string
}): string {
  const expectedPath = path.resolve(
    input.storagePath,
    HTML_EDITOR_DIRNAME,
    input.docId,
    'current.html'
  )
  if (path.resolve(input.storedHtmlPath) !== expectedPath) {
    throw new Error('HTML 编辑文档路径无效')
  }
  return expectedPath
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
}

function resolveRuntimeScriptHrefs(): string[] {
  const resourcesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'resources')
    : path.join(process.cwd(), 'resources')
  return ['chart.v4.js', 'ppt-runtime.js']
    .map((fileName) => path.join(resourcesDir, fileName))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => pathToFileURL(filePath).href)
}

export interface HtmlEditorImportResult {
  docId: string
  title: string
  htmlPath: string
  sourcePath: string
  designWidth: number
  html: string
}

/**
 * 把一批编辑应用到 html 串（纯函数，便于单测）。
 * 编排复制自 `edit:save-batch`（deletes → adds → drags → text → property → 清理），
 * 去掉文件读取、sessionId 校验、git history——输入即真相源 html 串。
 */
export function applyEditsToHtml(
  html: string,
  pageId: string,
  batch: {
    dragEdits?: unknown
    textEdits?: unknown
    propertyEdits?: unknown
    deletes?: unknown
    addElements?: unknown
  }
): { html: string; warnings: string[] } {
  const warnings: string[] = []
  let out = html

  const rawDeletes = Array.isArray(batch.deletes) ? batch.deletes : []
  const rawAddElements = Array.isArray(batch.addElements) ? batch.addElements : []
  const rawDrag = Array.isArray(batch.dragEdits) ? batch.dragEdits : []
  const rawText = Array.isArray(batch.textEdits) ? batch.textEdits : []
  const rawProperty = Array.isArray(batch.propertyEdits) ? batch.propertyEdits : []

  // deletes（含 art-text <style> 清理）
  for (const item of rawDeletes) {
    if (!item || typeof item !== 'object') continue
    const d = item as { selector?: unknown }
    const selector = typeof d.selector === 'string' ? d.selector.trim() : ''
    if (!selector) continue
    const $ = cheerio.load(out, { scriptingEnabled: false })
    const target = $(selector).first()
    if (target.length > 0) {
      const artTextBlockId =
        target.attr('data-ppt-art-text') !== undefined
          ? (target.attr('data-block-id') || '').trim()
          : ''
      if (artTextBlockId) {
        $('style[data-ppt-art-text-style]').each((_, styleNode) => {
          const style = $(styleNode)
          if ((style.attr('data-ppt-art-text-style') || '') === artTextBlockId) style.remove()
        })
      }
      target.remove()
      out = $.html()
    }
  }

  // adds
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
    out = patchAddElement(out, parentSelector, htmlFragment, insertIndex)
  }

  // drags
  for (const item of rawDrag) {
    if (!item || typeof item !== 'object') continue
    const e = item as {
      selector?: unknown
      x?: unknown
      y?: unknown
      width?: unknown
      height?: unknown
      childUpdates?: unknown
      layoutIsland?: unknown
      isAbsoluteMode?: unknown
      zIndex?: unknown
      zIndexOnly?: unknown
    }
    const selector = typeof e.selector === 'string' ? e.selector.trim() : ''
    if (!selector) continue
    const zIndex = typeof e.zIndex === 'number' ? e.zIndex : undefined
    const zIndexOnly = !!e.zIndexOnly
    out = patchDraggedElementStyle(
      out,
      selector,
      clampDragValue(e.x),
      clampDragValue(e.y),
      clampSizeValue(e.width),
      clampSizeValue(e.height),
      normalizeChildStyleUpdates(e.childUpdates),
      !!e.isAbsoluteMode,
      zIndex,
      zIndexOnly,
      normalizeLayoutIslandStyle(e.layoutIsland)
    )
  }

  // text
  for (const item of rawText) {
    if (!item || typeof item !== 'object') continue
    const e = item as { selector?: unknown; patch?: unknown }
    const selector = typeof e.selector === 'string' ? e.selector.trim() : ''
    if (!selector) continue
    const rawPatch =
      e.patch && typeof e.patch === 'object' ? (e.patch as Record<string, unknown>) : {}
    const rawStyle =
      rawPatch.style && typeof rawPatch.style === 'object'
        ? (rawPatch.style as Record<string, unknown>)
        : {}
    out = patchElementProperties(out, selector, {
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

  // property（blockId 优先解析 selector）
  for (const item of rawProperty) {
    if (!item || typeof item !== 'object') continue
    const e = item as { selector?: unknown; blockId?: unknown; patch?: unknown }
    const selector = typeof e.selector === 'string' ? e.selector.trim() : ''
    const blockId = typeof e.blockId === 'string' ? e.blockId.trim() : ''
    if (!selector && !blockId) continue
    const $ = cheerio.load(out, { scriptingEnabled: false })
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
      out = patchGenericElementProperties(out, resolvedSelector, {
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

  out = removeLegacyVideoAutoplayScript(out)
  return { html: out, warnings }
}

async function resolveHtmlEditorDocument(
  ctx: Pick<IpcContext, 'db' | 'resolveStoragePath'>,
  docId: string
) {
  const doc = await ctx.db.getHtmlEditDocument(docId)
  if (!doc) throw new Error('文档不存在')
  const storagePath = await ctx.resolveStoragePath()
  const htmlPath = resolveHtmlEditorDocumentPath({
    storagePath,
    docId: doc.id,
    storedHtmlPath: doc.htmlPath
  })
  return { doc, htmlPath, dir: path.dirname(htmlPath) }
}

export async function resolveHtmlEditorDocumentWorkspace(
  ctx: Pick<IpcContext, 'db' | 'resolveStoragePath'>,
  docId: string
): Promise<string> {
  if (!docId) throw new Error('HTML 文档 ID 不能为空')
  const document = await resolveHtmlEditorDocument(ctx, docId)
  return document.dir
}

export async function applyHtmlEditsForDocument(
  ctx: Pick<IpcContext, 'db' | 'resolveStoragePath'>,
  args: {
    docId: string
    html?: string
    batch: {
      dragEdits?: unknown
      textEdits?: unknown
      propertyEdits?: unknown
      deletes?: unknown
      addElements?: unknown
    }
    message?: string
  }
): Promise<{ html: string; warnings: string[]; changed: boolean }> {
  if (!args.docId) throw new Error('applyEdits 参数无效')
  const document = await resolveHtmlEditorDocument(ctx, args.docId)
  const html =
    args.html ||
    htmlDocumentHtmlCache.get(args.docId) ||
    (await fs.promises.readFile(document.htmlPath, 'utf-8'))
  if (!html) throw new Error('applyEdits 参数无效')
  const { html: next, warnings } = applyEditsToHtml(html, args.docId, args.batch)
  if (next === html) {
    rememberHtmlEditorDocumentHtml(args.docId, html)
    return { html: next, warnings, changed: false }
  }
  await ensureHtmlRepo(document.dir)
  const previousCommit = await getHtmlRepoHead(document.dir)
  const previousHtml = await fs.promises.readFile(document.htmlPath, 'utf-8')
  const message = args.message || '编辑'
  try {
    await fs.promises.writeFile(document.htmlPath, next, 'utf-8')
    const commitSha = await commitHtmlFile(document.dir, 'current.html', message)
    await ctx.db.createHtmlEditVersionAndTouch({
      id: nanoid(12),
      docId: args.docId,
      commitSha,
      message,
      createdAt: Date.now()
    })
    rememberHtmlEditorDocumentHtml(args.docId, next)
    refreshHtmlEditorCoverThumbnail({
      id: document.doc.id,
      htmlPath: document.htmlPath,
      designWidth: document.doc.designWidth
    })
  } catch (error) {
    await restoreHtmlFileAtCommit(document.dir, 'current.html', previousCommit).catch(
      (rollbackError) => {
        log.error('[html-editor:applyEdits] git rollback failed', {
          message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        })
      }
    )
    await restoreHtmlRepoHead(document.dir, previousCommit).catch((rollbackError) => {
      log.error('[html-editor:applyEdits] git head rollback failed', {
        message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      })
    })
    await fs.promises.writeFile(document.htmlPath, previousHtml, 'utf-8').catch((rollbackError) => {
      log.error('[html-editor:applyEdits] rollback failed', {
        message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      })
    })
    rememberHtmlEditorDocumentHtml(args.docId, previousHtml)
    throw error
  }
  return { html: next, warnings, changed: true }
}

export function registerHtmlEditorHandlers(ctx: IpcContext): void {
  const { mainWindow, resolveStoragePath, db } = ctx

  const resolveOwnerWindow = (sender: WebContents): BrowserWindow =>
    BrowserWindow.fromWebContents(sender) ?? BrowserWindow.getFocusedWindow() ?? mainWindow

  const resolveDocument = (docId: string) => resolveHtmlEditorDocument(ctx, docId)

  // ─── html-editor:listMedia ─────────────────────────────
  ipcMain.handle('html-editor:listMedia', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId.trim() : ''
    const mediaType: HtmlEditorMediaType = r.mediaType === 'video' ? 'video' : 'image'
    if (!docId) throw new Error('文档 ID 不能为空')

    const document = await resolveDocument(docId)
    allowLocalAssetRoot(document.dir)
    return { assets: await listHtmlEditorMedia({ workspaceDir: document.dir, mediaType }) }
  })

  // ─── html-editor:chooseAndImportMedia ──────────────────
  ipcMain.handle('html-editor:chooseAndImportMedia', async (event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId.trim() : ''
    const mediaType: HtmlEditorMediaType = r.mediaType === 'video' ? 'video' : 'image'
    if (!docId) throw new Error('文档 ID 不能为空')

    const document = await resolveDocument(docId)
    const ownerWindow = resolveOwnerWindow(event.sender)
    const result = await dialog.showOpenDialog(ownerWindow, {
      title: mediaType === 'video' ? '选择视频' : '选择图片',
      buttonLabel: '添加',
      properties: ['openFile'],
      filters: [
        {
          name: mediaType === 'video' ? 'Videos' : 'Images',
          extensions: getHtmlEditorMediaExtensions(mediaType)
        }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return { cancelled: true }

    const media = await importHtmlEditorMedia({
      workspaceDir: document.dir,
      sourcePath: result.filePaths[0],
      mediaType
    })
    allowLocalAssetRoot(document.dir)
    return { cancelled: false, ...media }
  })

  // ─── html-editor:import ────────────────────────────────
  ipcMain.handle('html-editor:import', async (event) => {
    let storagePath: string
    try {
      storagePath = await resolveStoragePath()
    } catch {
      return { cancelled: true, reason: 'storage-not-configured' }
    }

    const ownerWindow = resolveOwnerWindow(event.sender)
    const openResult = await dialog.showOpenDialog(ownerWindow, {
      title: '导入 HTML 文件',
      buttonLabel: '导入',
      properties: ['openFile'],
      filters: [
        { name: 'HTML', extensions: ['html', 'htm'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (openResult.canceled || openResult.filePaths.length === 0) {
      return { cancelled: true, reason: 'user-cancelled' }
    }

    const sourcePath = openResult.filePaths[0]
    let workingDir: string | null = null
    try {
      const raw = await fs.promises.readFile(sourcePath, 'utf-8')
      const docId = 'hedit-' + nanoid(10)
      const { html, designWidth, title } = normalizeImportedHtml({
        html: raw,
        sourceDir: path.dirname(sourcePath),
        docId,
        runtimeScriptHrefs: resolveRuntimeScriptHrefs()
      })
      const dir = path.join(storagePath, HTML_EDITOR_DIRNAME, docId)
      workingDir = dir
      const htmlPath = path.join(dir, 'current.html')
      await ensureHtmlRepo(dir)
      await fs.promises.writeFile(htmlPath, html, 'utf-8')
      const commitSha = await commitHtmlFile(dir, 'current.html', '导入')
      const now = Date.now()
      await db.createHtmlEditDocumentWithVersion({
        document: {
          id: docId,
          title,
          sourcePath,
          htmlPath,
          designWidth,
          createdAt: now,
          updatedAt: now
        },
        version: {
          id: nanoid(12),
          commitSha,
          message: '导入',
          createdAt: now
        }
      })
      rememberHtmlEditorDocumentHtml(docId, html)
      refreshHtmlEditorCoverThumbnail({ id: docId, htmlPath, designWidth })
      const result: HtmlEditorImportResult = {
        docId,
        title,
        htmlPath,
        sourcePath,
        designWidth,
        html
      }
      log.info('[html-editor:import] ok', { docId, sourcePath, commitSha })
      return { cancelled: false, ...result }
    } catch (error) {
      if (workingDir) {
        await fs.promises.rm(workingDir, { recursive: true, force: true }).catch((cleanupError) => {
          log.warn('[html-editor:import] cleanup failed', {
            workingDir,
            message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          })
        })
      }
      log.error('[html-editor:import] failed', {
        sourcePath,
        message: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  })

  // ─── html-editor:ensureAnchor ──────────────────────────
  ipcMain.handle('html-editor:ensureAnchor', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const html = typeof r.html === 'string' ? r.html : ''
    const pageId = typeof r.pageId === 'string' ? r.pageId : ''
    const selector = typeof r.selector === 'string' ? r.selector : ''
    if (!html || !pageId || !selector) throw new Error('ensureAnchor 参数无效')
    const result = ensureElementAnchorInHtml(html, {
      pageId,
      selector,
      elementTag: typeof r.elementTag === 'string' ? r.elementTag : undefined,
      formula: r.formula as Parameters<typeof ensureElementAnchorInHtml>[1]['formula']
    })
    rememberHtmlEditorDocumentHtml(pageId, result.html)
    return result
  })

  // ─── html-editor:applyEdits ────────────────────────────
  ipcMain.handle('html-editor:applyEdits', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const html = typeof r.html === 'string' ? r.html : ''
    const pageId = typeof r.pageId === 'string' ? r.pageId : ''
    return applyHtmlEditsForDocument(ctx, {
      docId: pageId,
      html,
      batch: {
        dragEdits: r.dragEdits,
        textEdits: r.textEdits,
        propertyEdits: r.propertyEdits,
        deletes: r.deletes,
        addElements: r.addElements
      }
    })
  })

  // ─── html-editor:listVersions ──────────────────────────
  ipcMain.handle('html-editor:listVersions', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId : ''
    if (!docId) return { versions: [] }
    const rows = await db.listHtmlEditVersions(docId)
    return {
      versions: rows.map((v) => ({
        id: v.id,
        commitSha: v.commitSha,
        message: v.message,
        createdAt: v.createdAt
      }))
    }
  })

  // ─── html-editor:restoreVersion ────────────────────────
  ipcMain.handle('html-editor:restoreVersion', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId : ''
    const versionId = typeof r.versionId === 'string' ? r.versionId : ''
    if (!docId || !versionId) throw new Error('参数无效')
    const version = await db.getHtmlEditVersion(versionId)
    if (!version || version.docId !== docId) throw new Error('版本不存在')
    const document = await resolveDocument(docId)
    const html = await readHtmlAtCommit(document.dir, 'current.html', version.commitSha)
    await ensureHtmlRepo(document.dir)
    const previousCommit = await getHtmlRepoHead(document.dir)
    const previousHtml = await fs.promises.readFile(document.htmlPath, 'utf-8')
    try {
      await fs.promises.writeFile(document.htmlPath, html, 'utf-8')
      const commitSha =
        previousHtml === html
          ? version.commitSha
          : await commitHtmlFile(document.dir, 'current.html', '恢复')
      await db.createHtmlEditVersionAndTouch({
        id: nanoid(12),
        docId,
        commitSha,
        message: '恢复',
        createdAt: Date.now()
      })
      rememberHtmlEditorDocumentHtml(docId, html)
      refreshHtmlEditorCoverThumbnail({
        id: document.doc.id,
        htmlPath: document.htmlPath,
        designWidth: document.doc.designWidth
      })
      return { html }
    } catch (error) {
      await restoreHtmlFileAtCommit(document.dir, 'current.html', previousCommit).catch(
        (rollbackError) => {
          log.error('[html-editor:restoreVersion] git rollback failed', {
            message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
          })
        }
      )
      await restoreHtmlRepoHead(document.dir, previousCommit).catch((rollbackError) => {
        log.error('[html-editor:restoreVersion] git head rollback failed', {
          message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        })
      })
      await fs.promises
        .writeFile(document.htmlPath, previousHtml, 'utf-8')
        .catch((rollbackError) => {
          log.error('[html-editor:restoreVersion] rollback failed', {
            message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
          })
        })
      rememberHtmlEditorDocumentHtml(docId, previousHtml)
      throw error
    }
  })

  // ─── html-editor:export ────────────────────────────────
  ipcMain.handle('html-editor:export', async (event, payload: unknown) => {
    const r = asRecord(payload)
    const html = typeof r.html === 'string' ? r.html : ''
    if (!html) throw new Error('导出内容为空')
    const ownerWindow = resolveOwnerWindow(event.sender)
    const saveResult = await dialog.showSaveDialog(ownerWindow, {
      title: '导出 HTML',
      defaultPath: typeof r.suggestedName === 'string' ? r.suggestedName : 'edited.html',
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
    })
    if (saveResult.canceled || !saveResult.filePath) return { cancelled: true }
    await fs.promises.writeFile(saveResult.filePath, html, 'utf-8')
    return { cancelled: false, path: saveResult.filePath }
  })

  // ─── html-editor:openInBrowser ─────────────────────────
  ipcMain.handle('html-editor:openInBrowser', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId : ''
    if (!docId) return { ok: false }
    try {
      const document = await resolveDocument(docId)
      const error = await shell.openPath(document.htmlPath)
      if (error) {
        log.warn('[html-editor:openInBrowser] failed', {
          htmlPath: document.htmlPath,
          message: error
        })
        return { ok: false }
      }
      return { ok: true }
    } catch (error) {
      log.warn('[html-editor:openInBrowser] failed', {
        message: error instanceof Error ? error.message : String(error)
      })
      return { ok: false }
    }
  })

  // ─── html-editor:revealFile ─────────────────────────────
  ipcMain.handle('html-editor:revealFile', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId.trim() : ''
    if (!docId) return { ok: false }
    try {
      const document = await resolveDocument(docId)
      await fs.promises.access(document.htmlPath, fs.constants.R_OK)
      shell.showItemInFolder(document.htmlPath)
      return { ok: true }
    } catch (error) {
      log.warn('[html-editor:revealFile] failed', {
        docId,
        message: error instanceof Error ? error.message : String(error)
      })
      return { ok: false }
    }
  })

  // ─── html-editor:listDocuments ─────────────────────────
  ipcMain.handle('html-editor:listDocuments', async () => {
    const docs = await db.listHtmlEditDocuments()
    const thumbnails = await warmHtmlEditorCoverThumbnails(docs)
    return {
      documents: docs.map((d) => ({
        id: d.id,
        title: d.title,
        sourcePath: d.sourcePath,
        htmlPath: d.htmlPath,
        designWidth: d.designWidth,
        updatedAt: d.updatedAt,
        thumbnailPath: thumbnails.get(d.id) || null
      }))
    }
  })

  // ─── html-editor:listMessages ──────────────────────────
  ipcMain.handle('html-editor:listMessages', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId.trim() : ''
    if (!docId) return { messages: [] }
    const rows = await db.listHtmlEditMessages(docId)
    return {
      messages: rows.map((message) => ({
        id: message.id,
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
        intent: message.intent || undefined,
        plan: message.planJson ? parseHtmlEditorMessagePlan(message.planJson) : null,
        requiresConfirmation: message.requiresConfirmation === 1,
        selectedElement: message.selectedSelector
          ? {
              selector: message.selectedSelector,
              label: message.selectedLabel || undefined,
              elementTag: message.selectedElementTag || undefined,
              elementText: message.selectedElementText || undefined
            }
          : undefined,
        createdAt: message.createdAt
      }))
    }
  })

  // ─── html-editor:clearMessages ─────────────────────────
  ipcMain.handle('html-editor:clearMessages', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId.trim() : ''
    if (!docId) return { ok: false }
    await db.clearHtmlEditMessages(docId)
    return { ok: true }
  })

  // ─── html-editor:openDocument ──────────────────────────
  ipcMain.handle('html-editor:openDocument', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId : ''
    if (!docId) throw new Error('参数无效')
    const document = await resolveDocument(docId)
    const { doc } = document
    let file: { mtimeMs: number; size: number }
    try {
      file = await fs.promises.stat(document.htmlPath)
    } catch (error) {
      throw new Error('HTML 文档文件不存在或无法读取', { cause: error })
    }
    const cached = htmlDocumentOpenCache.get(doc.id)
    let html =
      cached && cached.modifiedAtMs === file.mtimeMs && cached.size === file.size ? cached.html : ''
    if (!html) {
      let htmlMatchesDisk = true
      let needsFileMetadataRefresh = false
      try {
        html = await fs.promises.readFile(document.htmlPath, 'utf-8')
      } catch (error) {
        throw new Error('HTML 文档文件不存在或无法读取', { cause: error })
      }
      const normalized = normalizeImportedHtml({
        html,
        sourceDir: path.dirname(doc.sourcePath || document.htmlPath),
        docId: doc.id,
        defaultDesignWidth: doc.designWidth,
        runtimeScriptHrefs: resolveRuntimeScriptHrefs()
      })
      if (normalized.html !== html) {
        try {
          await fs.promises.writeFile(document.htmlPath, normalized.html, 'utf-8')
          needsFileMetadataRefresh = true
          await ensureHtmlRepo(document.dir)
          const commitSha = await commitHtmlFile(document.dir, 'current.html', '补全编辑运行时')
          await db.createHtmlEditVersionAndTouch({
            id: nanoid(12),
            docId: doc.id,
            commitSha,
            message: '补全编辑运行时',
            createdAt: Date.now()
          })
        } catch (error) {
          log.warn('[html-editor:openDocument] runtime migration failed', {
            docId: doc.id,
            message: error instanceof Error ? error.message : String(error)
          })
          htmlMatchesDisk = false
        }
        html = normalized.html
      }
      if (htmlMatchesDisk) {
        if (needsFileMetadataRefresh) file = await fs.promises.stat(document.htmlPath)
        rememberHtmlEditorOpenHtml(doc.id, html, file)
      }
    }
    const result: HtmlEditorImportResult = {
      docId: doc.id,
      title: doc.title,
      htmlPath: document.htmlPath,
      sourcePath: doc.sourcePath ?? '',
      designWidth: doc.designWidth,
      html
    }
    rememberHtmlEditorDocumentHtml(doc.id, html)
    return { cancelled: false, ...result }
  })

  // ─── html-editor:cleanup（只删数据库记录，不删磁盘文件） ─────
  ipcMain.handle('html-editor:cleanup', async (_event, payload: unknown) => {
    const r = asRecord(payload)
    const docId = typeof r.docId === 'string' ? r.docId : ''
    if (!docId) return { ok: false }
    try {
      await db.deleteHtmlEditDocument(docId)
      forgetHtmlEditorDocumentHtml(docId)
      return { ok: true }
    } catch (error) {
      log.warn('[html-editor:cleanup] failed', {
        message: error instanceof Error ? error.message : String(error)
      })
      return { ok: false }
    }
  })
}

function parseHtmlEditorMessagePlan(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
