import { BrowserWindow } from 'electron'
import { pathToFileURL } from 'url'
import log from 'electron-log/main.js'
import type { PPTDatabase } from '../../db/database'
import { FREEZE_PAGE_FOR_EXPORT_SCRIPT } from '../../io/html-pptx/browser-scripts'
import { sleep } from '../utils'
import type { RuntimeLocalFiles } from './local-files'
import type { SessionProjectResolver } from './session-project'

export type SessionPageFile = {
  id: string
  pageNumber: number
  pageId: string
  title: string
  htmlPath: string
}

export type PageExport = {
  PRINT_READY_PREFIX: string
  EXPORT_PAGE_READY_TIMEOUT_MS: number
  EXPORT_CAPTURE_SETTLE_MS: number
  resolveSessionPageFiles(sessionId: string): Promise<{
    session: Record<string, unknown>
    pages: SessionPageFile[]
    projectDir: string
  }>
  waitForPrintReadySignal(args: {
    win: BrowserWindow
    pageId: string
    timeoutMs: number
  }): Promise<{ timedOut: boolean; reportedPageId?: string }>
  renderPageToPdfBuffer(args: {
    page: SessionPageFile
    timeoutMs: number
    slideSize: import('@shared/slide-size').SlideSizePreset
  }): Promise<{ pngBuffer: Buffer; warning?: string }>
}

const PRINT_READY_PREFIX = '__PPT_PRINT_READY__'
const EXPORT_PAGE_READY_TIMEOUT_MS = 4000
const EXPORT_CAPTURE_SETTLE_MS = 120

export function createPageExport(args: {
  db: PPTDatabase
  localFiles: RuntimeLocalFiles
  sessionProject: SessionProjectResolver
}): PageExport {
  const { db, localFiles, sessionProject } = args

  const resolveSessionPageFiles = async (
    sessionId: string
  ): Promise<{
    session: Record<string, unknown>
    pages: SessionPageFile[]
    projectDir: string
  }> => {
    const session = await db.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    const sessionRecord = session as unknown as Record<string, unknown>
    const projectDir = await sessionProject.resolveSessionProjectDir(sessionId)
    const sessionPages = await db.listSessionPages(sessionId)
    if (sessionPages.length === 0) {
      throw new Error(
        'session_pages is empty after migration; export path requires session_pages as source of truth'
      )
    }
    const pages = sessionPages.map((page) => ({
      id: page.id,
      pageNumber: page.page_number,
      pageId: page.file_slug,
      title: page.title,
      htmlPath: sessionProject.resolveProjectPageHtmlPath(
        projectDir,
        page.file_slug,
        page.html_path
      )
    }))

    const missingPages: string[] = []
    const safePages: SessionPageFile[] = []
    for (const page of pages) {
      try {
        const safePath = await localFiles.assertPathInAllowedRoots({
          filePath: page.htmlPath,
          mode: 'read',
          sessionId,
          htmlOnly: true
        })
        safePages.push({ ...page, htmlPath: safePath })
      } catch {
        missingPages.push(page.pageId)
      }
    }
    if (missingPages.length > 0) {
      throw new Error(`页面文件缺失：${missingPages.join(', ')}`)
    }
    return { session: sessionRecord, pages: safePages, projectDir }
  }

  const waitForPrintReadySignal = async (args: {
    win: BrowserWindow
    pageId: string
    timeoutMs: number
  }): Promise<{ timedOut: boolean; reportedPageId?: string }> => {
    const { win, pageId, timeoutMs } = args
    return new Promise((resolve) => {
      let done = false
      let timeoutRef: NodeJS.Timeout | null = null
      let closedListenerBound = false

      const finalize = (timedOut: boolean, reportedPageId?: string): void => {
        if (done) return
        done = true
        if (timeoutRef) clearTimeout(timeoutRef)
        win.webContents.removeListener('console-message', onConsoleMessage)
        if (closedListenerBound) win.removeListener('closed', onClosed)
        resolve({ timedOut, reportedPageId })
      }

      const resolveConsoleMessageText = (...rawArgs: unknown[]): string => {
        if (rawArgs.length >= 3 && typeof rawArgs[2] === 'string') return rawArgs[2]
        const firstArg = rawArgs[0] as
          | { message?: unknown; params?: { message?: unknown } }
          | undefined
        if (firstArg && typeof firstArg === 'object') {
          if (typeof firstArg.message === 'string') return firstArg.message
          if (firstArg.params && typeof firstArg.params.message === 'string') {
            return firstArg.params.message
          }
        }
        return ''
      }

      const extractReportedPageId = (message: string): string | null => {
        if (typeof message !== 'string') return null
        const prefixIndex = message.indexOf(PRINT_READY_PREFIX)
        if (prefixIndex < 0) return null
        const suffix = message.slice(prefixIndex + PRINT_READY_PREFIX.length)
        const colonIndex = suffix.indexOf(':')
        if (colonIndex < 0) return null
        return suffix.slice(colonIndex + 1).trim() || null
      }

      const onConsoleMessage = (...rawArgs: unknown[]): void => {
        const reported = extractReportedPageId(resolveConsoleMessageText(...rawArgs))
        if (reported === pageId || reported === 'page-unknown') finalize(false, reported)
      }
      const onClosed = (): void => finalize(true)

      timeoutRef = setTimeout(() => finalize(true), Math.max(500, timeoutMs))
      win.webContents.on('console-message', onConsoleMessage as (...args: unknown[]) => void)
      win.on('closed', onClosed)
      closedListenerBound = true
    })
  }

  const renderPageToPdfBuffer = async (args: {
    page: SessionPageFile
    timeoutMs: number
    slideSize: import('@shared/slide-size').SlideSizePreset
  }): Promise<{ pngBuffer: Buffer; warning?: string }> => {
    const { page, timeoutMs, slideSize } = args
    const captureWidth = slideSize.width
    const captureHeight = slideSize.height
    const win = new BrowserWindow({
      show: false,
      width: captureWidth,
      height: captureHeight,
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        sandbox: false,
        nodeIntegration: false,
        backgroundThrottling: false,
        offscreen: false
      }
    })

    try {
      win.webContents.setZoomFactor(1)
      win.setContentSize(captureWidth, captureHeight)
      const pageUrl = new URL(pathToFileURL(page.htmlPath).toString())
      pageUrl.searchParams.set('fit', 'off')
      pageUrl.searchParams.set('print', '1')
      pageUrl.searchParams.set('export', '1')
      pageUrl.searchParams.set('pageId', page.pageId)
      pageUrl.searchParams.set('printTimeoutMs', String(timeoutMs))
      pageUrl.searchParams.set('_ts', String(Date.now()))

      const readyWaitPromise = waitForPrintReadySignal({ win, pageId: page.pageId, timeoutMs })
      await win.loadURL(pageUrl.toString())
      await win.webContents.executeJavaScript(FREEZE_PAGE_FOR_EXPORT_SCRIPT, true)
      const readyResult = await readyWaitPromise
      if (readyResult.timedOut) {
        log.warn('[export:pdf] print ready timeout', {
          pageId: page.pageId,
          htmlPath: page.htmlPath,
          timeoutMs
        })
      }
      await sleep(EXPORT_CAPTURE_SETTLE_MS)
      await win.webContents.executeJavaScript(FREEZE_PAGE_FOR_EXPORT_SCRIPT, true)
      await sleep(450)
      await win.webContents.executeJavaScript(FREEZE_PAGE_FOR_EXPORT_SCRIPT, true)
      await sleep(80)
      const pngBuffer = (await win.webContents.capturePage({
        x: 0,
        y: 0,
        width: captureWidth,
        height: captureHeight
      })).toPNG()

      return {
        pngBuffer,
        warning: readyResult.timedOut
          ? `页面 ${page.pageId} 未收到打印就绪信号，已按当前状态导出`
          : undefined
      }
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  }

  return {
    PRINT_READY_PREFIX,
    EXPORT_PAGE_READY_TIMEOUT_MS,
    EXPORT_CAPTURE_SETTLE_MS,
    resolveSessionPageFiles,
    waitForPrintReadySignal,
    renderPageToPdfBuffer
  }
}
