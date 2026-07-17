import { create } from 'zustand'
import { ipc, type HtmlEditorImportResult } from '../lib/ipc'

/**
 * HTML 编辑器的文档态（与 session-edit 完全独立）。
 * 持有当前打开文档的身份（docId）、工作文件路径、设计宽度，以及**真相源 HTML 串**。
 * 不持有编辑选择/草稿/撤销栈——那些在 htmlEditStore / htmlEditHistoryStore。
 */

const INITIAL_DESIGN_WIDTH = 1280

export interface HtmlEditDocumentSummary {
  id: string
  title: string
  sourcePath: string | null
  htmlPath: string
  designWidth: number
  updatedAt: number
}

export interface HtmlEditorDocSnapshot {
  docId: string | null
  title: string
  htmlPath: string | null
  sourcePath: string | null
  designWidth: number
  html: string
  importing: boolean
  exporting: boolean
  error: string | null
  documents: HtmlEditDocumentSummary[]
}

export type HtmlEditorImportOutcome =
  | { ok: true }
  | { ok: false; reason: 'user-cancelled' | 'storage-not-configured' | 'error'; message?: string }

interface HtmlEditorStore extends HtmlEditorDocSnapshot {
  importFile: () => Promise<HtmlEditorImportOutcome>
  openDocument: (docId: string) => Promise<HtmlEditorImportOutcome>
  loadDocuments: () => Promise<void>
  setHtml: (html: string) => void
  exportAs: () => Promise<string | null>
  reset: () => void
}

const initial: HtmlEditorDocSnapshot = {
  docId: null,
  title: '',
  htmlPath: null,
  sourcePath: null,
  designWidth: INITIAL_DESIGN_WIDTH,
  html: '',
  importing: false,
  exporting: false,
  error: null,
  documents: []
}

export const useHtmlEditorStore = create<HtmlEditorStore>((set, get) => ({
  ...initial,

  importFile: async () => {
    set({ importing: true, error: null })
    try {
      const result = await ipc.importHtmlFile()
      if (result.cancelled) {
        set({ importing: false })
        return { ok: false, reason: result.reason ?? 'user-cancelled' }
      }
      applyDocResult(set, result)
      return { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      set({ importing: false, error: message })
      return { ok: false, reason: 'error', message }
    }
  },

  openDocument: async (docId: string) => {
    set({
      docId: null,
      title: '',
      htmlPath: null,
      sourcePath: null,
      designWidth: INITIAL_DESIGN_WIDTH,
      html: '',
      importing: true,
      error: null
    })
    try {
      const result = await ipc.openHtmlDocument({ docId })
      if (result.cancelled) {
        set({ importing: false })
        return { ok: false, reason: 'user-cancelled' }
      }
      applyDocResult(set, result)
      return { ok: true }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      set({ importing: false, error: message })
      return { ok: false, reason: 'error', message }
    }
  },

  loadDocuments: async () => {
    try {
      const { documents } = await ipc.listHtmlDocuments()
      set({ documents })
    } catch {
      /* 忽略，列表保持空 */
    }
  },

  setHtml: (html) => set({ html }),

  exportAs: async () => {
    const { html, title } = get()
    if (!html) return null
    set({ exporting: true })
    try {
      const result = await ipc.exportHtml({
        html,
        suggestedName: title ? `${title}.html` : 'edited.html'
      })
      set({ exporting: false })
      return result.cancelled ? null : result.path
    } catch {
      set({ exporting: false })
      return null
    }
  },

  reset: () => set({ ...initial, documents: get().documents })
}))

function applyDocResult(
  set: (partial: Partial<HtmlEditorDocSnapshot>) => void,
  result: HtmlEditorImportResult
): void {
  set({
    docId: result.docId,
    title: result.title,
    htmlPath: result.htmlPath,
    sourcePath: result.sourcePath,
    designWidth: result.designWidth,
    html: result.html,
    importing: false,
    error: null
  })
}
