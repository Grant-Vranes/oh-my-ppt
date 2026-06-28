import { create } from 'zustand'
import { ipc } from '@renderer/lib/ipc'
import type { I18nKey, TranslationParams } from '../i18n'
import type {
  EditModeMovePayload,
  EditSelectionPayload
} from '../components/preview/edit-mode-script'
import type { PreviewIframeHandle } from '../components/preview/PreviewIframe'
import {
  EMPTY_ELEMENT_DRAFT,
  fontSizeToNumber,
  normalizeFontWeight,
  normalizeTextAlign,
  opacityToInput,
  rgbToHex
} from '../components/session-detail/element-inspector/elementEditUtils'
import type { ElementEditDraft } from '../components/session-detail/element-inspector'
import { editTargetMatchesDeletedSelector, useEditHistoryStore } from './editHistoryStore'
import { useSessionDetailUiStore } from './sessionDetailStore'
import { useToastStore } from './toastStore'

type ElementPropertyStylePatch = {
  zIndex?: number
  opacity?: number
  backgroundColor?: string
  color?: string
  fontSize?: string
  fontWeight?: string
  textAlign?: string
  objectFit?: string
}

type ElementPropertyAttrsPatch = {
  alt?: string
  poster?: string
  controls?: boolean
  muted?: boolean
  loop?: boolean
  autoplay?: boolean
  playsInline?: boolean
  preload?: string
}

type ElementPropertyPatch = {
  html?: string
  text?: string
  textTarget?: EditSelectionPayload['textTarget']
  formula?: {
    latex: string
    html: string
    displayMode: boolean
    originalLatex?: string
  }
  style?: ElementPropertyStylePatch
  attrs?: ElementPropertyAttrsPatch
}

export interface EditSessionContext {
  t: (key: I18nKey, params?: TranslationParams) => string
  requestRefresh: () => void
  bumpThumbnail: (pageId: string) => void
  getPageContext: () => { pageId: string; htmlPath: string; sessionId: string } | null
}

function getCommitFieldsForSelection(selection: EditSelectionPayload): Set<keyof ElementEditDraft> {
  const fields = new Set<keyof ElementEditDraft>()
  const capabilities = selection.capabilities || []
  if (capabilities.includes('layer')) fields.add('layoutZIndex')
  if (capabilities.includes('appearance')) {
    fields.add('opacity')
    fields.add('backgroundColor')
  }
  if (capabilities.includes('media')) {
    fields.add('objectFit')
    fields.add('alt')
    fields.add('poster')
    fields.add('controls')
    fields.add('muted')
    fields.add('loop')
    fields.add('autoplay')
    fields.add('playsInline')
    fields.add('preload')
  }
  if (capabilities.includes('text')) {
    fields.add('html')
    fields.add('text')
    fields.add('color')
    fields.add('fontSize')
    fields.add('fontWeight')
    fields.add('textAlign')
  }
  if (capabilities.includes('formula')) {
    fields.add('formulaLatex')
    fields.add('formulaHtml')
    fields.add('formulaDisplayMode')
  }
  return fields
}

function buildElementPropertyPatch(
  selection: EditSelectionPayload,
  draft: ElementEditDraft,
  fields?: Array<keyof ElementEditDraft>
): ElementPropertyPatch | null {
  if (!selection.snapshot) return null

  const commitFields =
    fields && fields.length > 0 ? new Set(fields) : getCommitFieldsForSelection(selection)
  const initial = selection.snapshot
  const style: ElementPropertyStylePatch = {}
  const attrs: ElementPropertyAttrsPatch = {}
  let text: string | undefined
  let html: string | undefined
  let formula: ElementPropertyPatch['formula'] | undefined

  if (commitFields.has('layoutZIndex')) {
    const value = parseInt(draft.layoutZIndex, 10)
    const initialValue = selection.zIndex ?? 10
    if (Number.isFinite(value) && value !== initialValue) style.zIndex = value
  }
  if (commitFields.has('opacity')) {
    const value = Number(draft.opacity)
    const initialValue = Number(opacityToInput(initial.computed.opacity))
    if (Number.isFinite(value) && value !== initialValue) style.opacity = value
  }
  if (
    commitFields.has('backgroundColor') &&
    draft.backgroundColor !== rgbToHex(initial.computed.backgroundColor)
  ) {
    style.backgroundColor = draft.backgroundColor
  }
  if (
    commitFields.has('objectFit') &&
    draft.objectFit !== (initial.computed.objectFit || 'contain')
  ) {
    style.objectFit = draft.objectFit
  }
  const initialHtml = initial.text?.html || ''
  if (commitFields.has('html') && draft.html.trim() && draft.html.trim() !== initialHtml.trim()) {
    html = draft.html.trim()
  }
  const initialText = selection.textTarget?.text ?? initial.text?.value ?? ''
  if (!html && commitFields.has('text') && draft.text.trim() && draft.text.trim() !== initialText) {
    text = draft.text.trim()
  }
  if (
    (commitFields.has('formulaLatex') ||
      commitFields.has('formulaHtml') ||
      commitFields.has('formulaDisplayMode')) &&
    draft.formulaLatex.trim() &&
    draft.formulaHtml.trim()
  ) {
    const initialFormula = initial.formula
    const nextLatex = draft.formulaLatex.trim()
    const nextHtml = draft.formulaHtml.trim()
    const nextDisplayMode = draft.formulaDisplayMode
    if (
      nextLatex !== (initialFormula?.latex || '') ||
      nextHtml !== (initialFormula?.html || '') ||
      nextDisplayMode !== Boolean(initialFormula?.displayMode)
    ) {
      formula = {
        latex: nextLatex,
        html: nextHtml,
        displayMode: nextDisplayMode,
        originalLatex: initialFormula?.latex || ''
      }
    }
  }
  if (commitFields.has('color') && draft.color !== rgbToHex(initial.computed.color)) {
    style.color = draft.color
  }
  if (
    commitFields.has('fontSize') &&
    draft.fontSize !== fontSizeToNumber(initial.computed.fontSize)
  ) {
    style.fontSize = draft.fontSize ? `${draft.fontSize}px` : undefined
  }
  if (
    commitFields.has('fontWeight') &&
    draft.fontWeight !== normalizeFontWeight(initial.computed.fontWeight)
  ) {
    style.fontWeight = draft.fontWeight
  }
  if (
    commitFields.has('textAlign') &&
    draft.textAlign !== normalizeTextAlign(initial.computed.textAlign)
  ) {
    style.textAlign = draft.textAlign
  }
  if (commitFields.has('alt') && draft.alt !== (initial.attrs.alt || '')) attrs.alt = draft.alt
  if (commitFields.has('poster') && draft.poster !== (initial.attrs.poster || '')) {
    attrs.poster = draft.poster
  }
  if (commitFields.has('controls') && draft.controls !== Boolean(initial.attrs.controls)) {
    attrs.controls = draft.controls
  }
  if (commitFields.has('muted') && draft.muted !== Boolean(initial.attrs.muted)) {
    attrs.muted = draft.muted
  }
  if (commitFields.has('loop') && draft.loop !== Boolean(initial.attrs.loop)) {
    attrs.loop = draft.loop
  }
  if (commitFields.has('autoplay') && draft.autoplay !== Boolean(initial.attrs.autoplay)) {
    attrs.autoplay = draft.autoplay
  }
  if (
    commitFields.has('playsInline') &&
    draft.playsInline !== (initial.attrs.playsInline !== false)
  ) {
    attrs.playsInline = draft.playsInline
  }
  if (commitFields.has('preload') && draft.preload !== (initial.attrs.preload || 'metadata')) {
    attrs.preload = draft.preload
  }

  if (
    html === undefined &&
    text === undefined &&
    formula === undefined &&
    Object.keys(style).length === 0 &&
    Object.keys(attrs).length === 0
  ) {
    return null
  }

  return {
    html,
    text,
    formula,
    textTarget: text !== undefined ? selection.textTarget : undefined,
    style: Object.keys(style).length > 0 ? style : undefined,
    attrs: Object.keys(attrs).length > 0 ? attrs : undefined
  }
}

interface EditSessionState {
  iframeHandle: PreviewIframeHandle | null
  selection: EditSelectionPayload | null
  draft: ElementEditDraft
  isSavingEdits: boolean
  ctx: EditSessionContext | null

  attach: (ctx: EditSessionContext) => void
  setIframeHandle: (handle: PreviewIframeHandle | null) => void
  resetForPage: () => void
  reset: () => void
  selectElement: (payload: EditSelectionPayload) => void
  handleMoved: (payload: EditModeMovePayload) => void
  updateDraft: (
    draft: ElementEditDraft,
    options?: { commit?: boolean; fields?: Array<keyof ElementEditDraft> }
  ) => void
  cancelEdit: () => void
  deleteSelected: () => void
  deleteBySelector: (selector: string) => void
  discardAll: () => void
  undo: () => void
  redo: () => void
  replayPending: () => void
  commitDraft: (draft: ElementEditDraft, fields?: Array<keyof ElementEditDraft>) => boolean
  commitCurrentDraft: () => boolean
  flushPendingDrags: () => Promise<void>
  save: () => Promise<{ saved: boolean; error?: string }>
}

export const useEditSessionStore = create<EditSessionState>((set, get) => ({
  iframeHandle: null,
  selection: null,
  draft: EMPTY_ELEMENT_DRAFT,
  isSavingEdits: false,
  ctx: null,

  attach: (ctx) => set({ ctx }),
  setIframeHandle: (iframeHandle) => set({ iframeHandle }),
  resetForPage: () => set({ selection: null, draft: EMPTY_ELEMENT_DRAFT }),
  reset: () =>
    set({
      iframeHandle: null,
      selection: null,
      draft: EMPTY_ELEMENT_DRAFT,
      isSavingEdits: false,
      ctx: null
    }),

  commitDraft: (draft, fields) => {
    const selection = get().selection
    const pc = get().ctx?.getPageContext()
    if (!selection || !pc) return false
    const patch = buildElementPropertyPatch(selection, draft, fields)
    if (!patch) return false
    useEditHistoryStore.getState().upsertPropertyEdit({
      pageId: pc.pageId,
      htmlPath: pc.htmlPath,
      selector: selection.selector,
      blockId: selection.blockId,
      patch
    })
    return true
  },
  commitCurrentDraft: () => get().commitDraft(get().draft),

  selectElement: (payload) => {
    get().commitCurrentDraft()
    if (!payload.snapshot) {
      set({ selection: null, draft: EMPTY_ELEMENT_DRAFT })
      useSessionDetailUiStore.getState().clearEditSelectedElement()
      return
    }
    set({ selection: payload })
    useSessionDetailUiStore.getState().setEditSelectedElement(payload.selector)
    const zValue = payload.zIndex !== undefined ? String(payload.zIndex) : '10'
    const bounds = payload.snapshot.metrics.page
    const computed = payload.snapshot.computed
    const attrs = payload.snapshot.attrs
    const formula = payload.snapshot.formula
    if (payload.isText) {
      set({
        draft: {
          text: payload.textTarget?.text ?? payload.text,
          html: payload.html || payload.snapshot.text?.html || '',
          color: rgbToHex(computed.color),
          fontSize: fontSizeToNumber(computed.fontSize),
          fontWeight: normalizeFontWeight(computed.fontWeight),
          textAlign: normalizeTextAlign(computed.textAlign),
          layoutX: String(Math.round(bounds.x)),
          layoutY: String(Math.round(bounds.y)),
          layoutWidth: String(Math.round(bounds.width)),
          layoutHeight: String(Math.round(bounds.height)),
          layoutZIndex: zValue,
          opacity: opacityToInput(computed.opacity),
          backgroundColor: rgbToHex(computed.backgroundColor),
          objectFit: computed.objectFit || 'contain',
          alt: attrs.alt || '',
          poster: attrs.poster || '',
          controls: Boolean(attrs.controls),
          muted: Boolean(attrs.muted),
          loop: Boolean(attrs.loop),
          autoplay: Boolean(attrs.autoplay),
          playsInline: attrs.playsInline !== false,
          preload: attrs.preload || 'metadata',
          artTextTemplateId: attrs.artTextTemplate || '',
          formulaLatex: formula?.latex || '',
          formulaHtml: formula?.html || '',
          formulaDisplayMode: Boolean(formula?.displayMode)
        }
      })
    } else {
      set({
        draft: {
          ...EMPTY_ELEMENT_DRAFT,
          layoutX: String(Math.round(bounds.x)),
          layoutY: String(Math.round(bounds.y)),
          layoutWidth: String(Math.round(bounds.width)),
          layoutHeight: String(Math.round(bounds.height)),
          layoutZIndex: zValue,
          opacity: opacityToInput(computed.opacity),
          backgroundColor: rgbToHex(computed.backgroundColor),
          objectFit: computed.objectFit || 'contain',
          alt: attrs.alt || '',
          poster: attrs.poster || '',
          controls: Boolean(attrs.controls),
          muted: Boolean(attrs.muted),
          loop: Boolean(attrs.loop),
          autoplay: Boolean(attrs.autoplay),
          playsInline: attrs.playsInline !== false,
          preload: attrs.preload || 'metadata',
          artTextTemplateId: attrs.artTextTemplate || '',
          formulaLatex: formula?.latex || '',
          formulaHtml: formula?.html || '',
          formulaDisplayMode: Boolean(formula?.displayMode)
        }
      })
    }
  },

  handleMoved: (payload) => {
    const pc = get().ctx?.getPageContext()
    if (!pc) return
    const selection = get().selection
    const draftZIndex = parseInt(get().draft.layoutZIndex, 10)

    if (selection && payload.selector === selection.selector) {
      const visualX =
        payload.visualX ??
        (selection.pageBounds?.x ?? selection.bounds?.x ?? 0) +
          (payload.layoutMode === 'translate' ? payload.x : payload.deltaX)
      const visualY =
        payload.visualY ??
        (selection.pageBounds?.y ?? selection.bounds?.y ?? 0) +
          (payload.layoutMode === 'translate' ? payload.y : payload.deltaY)
      set((state) => ({
        draft: {
          ...state.draft,
          layoutX: String(Math.round(visualX)),
          layoutY: String(Math.round(visualY)),
          ...(payload.width !== undefined
            ? { layoutWidth: String(Math.round(payload.width)) }
            : {}),
          ...(payload.height !== undefined
            ? { layoutHeight: String(Math.round(payload.height)) }
            : {})
        }
      }))
    }

    useEditHistoryStore.getState().upsertDragEdit({
      pageId: pc.pageId,
      htmlPath: pc.htmlPath,
      selector: payload.selector,
      x: payload.x,
      y: payload.y,
      width: payload.width ?? null,
      height: payload.height ?? null,
      childUpdates: payload.childUpdates ?? [],
      isAbsoluteMode: payload.layoutMode === 'absolute',
      zIndex: Number.isFinite(draftZIndex) ? draftZIndex : undefined
    })
  },

  updateDraft: (draft, options) => {
    const selection = get().selection
    const prevDraft = get().draft
    const pc = get().ctx?.getPageContext()
    const liveStyle: ElementPropertyStylePatch = {}
    const liveAttrs: ElementPropertyAttrsPatch = {}

    if (selection && pc && draft.layoutZIndex !== prevDraft.layoutZIndex) {
      const zNum = parseInt(draft.layoutZIndex, 10)
      if (Number.isFinite(zNum)) liveStyle.zIndex = zNum
    }
    if (draft.opacity !== prevDraft.opacity) {
      const opacity = Number(draft.opacity)
      if (Number.isFinite(opacity)) liveStyle.opacity = opacity
    }
    if (draft.backgroundColor !== prevDraft.backgroundColor)
      liveStyle.backgroundColor = draft.backgroundColor
    if (draft.objectFit !== prevDraft.objectFit) liveStyle.objectFit = draft.objectFit
    if (draft.textAlign !== prevDraft.textAlign) liveStyle.textAlign = draft.textAlign
    if (draft.alt !== prevDraft.alt) liveAttrs.alt = draft.alt
    if (draft.poster !== prevDraft.poster) liveAttrs.poster = draft.poster
    if (draft.controls !== prevDraft.controls) liveAttrs.controls = draft.controls
    if (draft.muted !== prevDraft.muted) liveAttrs.muted = draft.muted
    if (draft.loop !== prevDraft.loop) liveAttrs.loop = draft.loop
    if (draft.autoplay !== prevDraft.autoplay) liveAttrs.autoplay = draft.autoplay
    if (draft.playsInline !== prevDraft.playsInline) liveAttrs.playsInline = draft.playsInline
    if (draft.preload !== prevDraft.preload) liveAttrs.preload = draft.preload
    const formulaChanged =
      draft.formulaLatex !== prevDraft.formulaLatex ||
      draft.formulaHtml !== prevDraft.formulaHtml ||
      draft.formulaDisplayMode !== prevDraft.formulaDisplayMode

    set({ draft })

    if (selection && pc) {
      const iframe = get().iframeHandle
      const zNum = parseInt(draft.layoutZIndex, 10)
      if (Number.isFinite(zNum) && draft.layoutZIndex !== prevDraft.layoutZIndex) {
        iframe?.applyZIndex(selection.selector, zNum)
      }
      if (Object.keys(liveStyle).length > 0 || Object.keys(liveAttrs).length > 0) {
        iframe?.applyElementProperties(selection.selector, {
          style: liveStyle,
          attrs: liveAttrs
        })
      }
      if (selection.isText) {
        iframe?.liveUpdateElement(selection.selector, {
          html: draft.html,
          text: draft.text,
          textTarget: selection.textTarget,
          style: {
            color: draft.color,
            fontSize: draft.fontSize ? `${draft.fontSize}px` : undefined,
            fontWeight: draft.fontWeight
          }
        })
      }
      if (selection.capabilities?.includes('formula') && formulaChanged && draft.formulaHtml) {
        iframe?.liveUpdateElement(selection.selector, {
          formula: {
            latex: draft.formulaLatex.trim(),
            html: draft.formulaHtml,
            displayMode: draft.formulaDisplayMode
          }
        })
      }
      if (options?.commit) get().commitDraft(draft, options.fields)
    }
  },

  cancelEdit: () => {
    get().commitCurrentDraft()
    get().iframeHandle?.clearEditModeSelection()
    set({ selection: null, draft: EMPTY_ELEMENT_DRAFT })
    useSessionDetailUiStore.getState().clearEditSelectedElement()
  },

  deleteSelected: () => {
    const selection = get().selection
    const pc = get().ctx?.getPageContext()
    if (!selection || !pc) return
    const selector = selection.selector
    useEditHistoryStore.getState().addDelete({
      pageId: pc.pageId,
      htmlPath: pc.htmlPath,
      selector
    })
    get().iframeHandle?.hideElement(selector)
    get().iframeHandle?.clearEditModeSelection()
    set({ selection: null, draft: EMPTY_ELEMENT_DRAFT })
    useSessionDetailUiStore.getState().clearEditSelectedElement()
  },

  deleteBySelector: (selector) => {
    const pc = get().ctx?.getPageContext()
    if (!pc || !selector) return
    const selection = get().selection
    if (selection && selection.selector === selector) get().commitCurrentDraft()
    useEditHistoryStore.getState().addDelete({
      pageId: pc.pageId,
      htmlPath: pc.htmlPath,
      selector
    })
    get().iframeHandle?.hideElement(selector)
    get().iframeHandle?.clearEditModeSelection()
    set({ selection: null, draft: EMPTY_ELEMENT_DRAFT })
    useSessionDetailUiStore.getState().clearEditSelectedElement()
  },

  discardAll: () => {
    const ctx = get().ctx
    const pc = ctx?.getPageContext()
    if (!ctx || !pc) return
    const editHistory = useEditHistoryStore.getState()
    const snapshot = editHistory.getSnapshotForPage(pc.pageId)
    const hadPending =
      snapshot.dragEdits.length > 0 ||
      snapshot.textEdits.length > 0 ||
      snapshot.propertyEdits.length > 0 ||
      snapshot.deletes.length > 0 ||
      snapshot.addElements.length > 0
    editHistory.clearPage(pc.pageId)
    get().iframeHandle?.clearEditModeSelection()
    set({ selection: null, draft: EMPTY_ELEMENT_DRAFT })
    useSessionDetailUiStore.getState().clearEditSelectedElement()
    if (hadPending) ctx.requestRefresh()
    if (hadPending) useToastStore.getState().info(ctx.t('sessionDetail.discardedAdjustments'))
  },

  undo: () => {
    const ctx = get().ctx
    const pc = ctx?.getPageContext()
    if (!ctx || !pc) return
    get().commitCurrentDraft()
    if (!useEditHistoryStore.getState().undo(pc.pageId)) return
    get().iframeHandle?.clearEditModeSelection()
    set({ selection: null, draft: EMPTY_ELEMENT_DRAFT })
    useSessionDetailUiStore.getState().clearEditSelectedElement()
    ctx.requestRefresh()
  },

  redo: () => {
    const ctx = get().ctx
    const pc = ctx?.getPageContext()
    if (!ctx || !pc) return
    if (!useEditHistoryStore.getState().redo(pc.pageId)) return
    get().iframeHandle?.clearEditModeSelection()
    set({ selection: null, draft: EMPTY_ELEMENT_DRAFT })
    useSessionDetailUiStore.getState().clearEditSelectedElement()
    ctx.requestRefresh()
  },

  replayPending: () => {
    const pc = get().ctx?.getPageContext()
    const iframe = get().iframeHandle
    if (!pc || !iframe) return
    const snapshot = useEditHistoryStore.getState().getSnapshotForPage(pc.pageId)
    for (const d of snapshot.deletes) iframe.hideElement(d.selector)
    for (const a of snapshot.addElements)
      iframe.injectElement(a.parentSelector, a.htmlFragment, a.insertIndex)
    for (const d of snapshot.dragEdits) {
      iframe.applyDragStyle(d.selector, {
        x: d.x,
        y: d.y,
        width: d.width ?? undefined,
        height: d.height ?? undefined,
        isAbsoluteMode: d.isAbsoluteMode
      })
      if (d.zIndex !== undefined) iframe.applyZIndex(d.selector, d.zIndex)
      if (d.childUpdates.length > 0) iframe.applyChildUpdates(d.selector, d.childUpdates)
    }
    for (const t of snapshot.textEdits) {
      iframe.liveUpdateElement(t.selector, {
        text: t.patch.text,
        textTarget: undefined,
        style: t.patch.style
      })
    }
    for (const p of snapshot.propertyEdits) {
      iframe.applyElementProperties(p.selector, {
        style: p.patch.style,
        attrs: p.patch.attrs
      })
      if (
        p.patch.formula ||
        p.patch.html ||
        p.patch.text ||
        p.patch.style?.color ||
        p.patch.style?.fontSize ||
        p.patch.style?.fontWeight
      ) {
        iframe.liveUpdateElement(p.selector, {
          text: p.patch.text,
          html: p.patch.html,
          formula: p.patch.formula,
          textTarget: p.patch.textTarget,
          style: {
            color: p.patch.style?.color,
            fontSize: p.patch.style?.fontSize,
            fontWeight: p.patch.style?.fontWeight
          }
        })
      }
    }
    const selection = get().selection
    const selectedDeleted = selection
      ? snapshot.deletes.some((d) =>
          editTargetMatchesDeletedSelector(selection.selector, d.selector, selection.blockId)
        )
      : false
    if (selection?.selector && !selectedDeleted) {
      void iframe.restoreEditModeSelection?.(selection.selector)
    }
  },

  flushPendingDrags: async () => {
    const pc = get().ctx?.getPageContext()
    const iframe = get().iframeHandle
    if (!pc || !iframe) return
    const editHistory = useEditHistoryStore.getState()
    const snap = editHistory.getSnapshotForPage(pc.pageId)
    const deletedSelectors = new Set(snap.deletes.map((d) => d.selector))
    const covered = new Set<string>()
    for (const d of snap.dragEdits) {
      if (deletedSelectors.has(d.selector)) continue
      covered.add(d.selector)
      const layout = await iframe.readElementLayout(d.selector)
      if (!layout) continue
      editHistory.upsertDragEdit({
        pageId: d.pageId,
        htmlPath: d.htmlPath,
        selector: d.selector,
        x: layout.x,
        y: layout.y,
        isAbsoluteMode: layout.isAbsoluteMode,
        width: d.width != null ? (layout.width > 0 ? layout.width : d.width) : null,
        height: d.height != null ? (layout.height > 0 ? layout.height : d.height) : null,
        childUpdates: d.childUpdates ?? [],
        zIndex: d.zIndex
      })
    }
    // Capture an in-flight first move/resize: a `moved` whose async `ensureAnchoredAnchor`
    // is still straddling the save has not upserted a dragEdit yet, so the loop
    // above skipped it. If the currently selected element has actually moved from
    // its selection-time position or size, read its current DOM layout and persist it now
    // (mirroring what that late `moved` would have produced). Without this, an
    // empty save + refresh would silently drop the edit. The stale `moved` itself
    // is dropped by the PreviewIframe page-instance guard after the refresh.
    const selection = get().selection
    if (
      selection?.selector &&
      selection.snapshot &&
      !covered.has(selection.selector) &&
      !deletedSelectors.has(selection.selector)
    ) {
      const layout = await iframe.readElementLayout(selection.selector)
      if (layout) {
        const base = selection.snapshot.metrics.page
        const movedX = Math.abs((layout.visualX ?? 0) - base.x)
        const movedY = Math.abs((layout.visualY ?? 0) - base.y)
        const resizedWidth = layout.width > 0 && Math.abs(layout.width - base.width) >= 0.5
        const resizedHeight = layout.height > 0 && Math.abs(layout.height - base.height) >= 0.5
        const resized = resizedWidth || resizedHeight
        if (movedX >= 0.5 || movedY >= 0.5 || resized) {
          const draftZIndex = parseInt(get().draft.layoutZIndex, 10)
          editHistory.upsertDragEdit({
            pageId: pc.pageId,
            htmlPath: pc.htmlPath,
            selector: selection.selector,
            x: layout.x,
            y: layout.y,
            isAbsoluteMode: layout.isAbsoluteMode,
            width: resized && layout.width > 0 ? layout.width : null,
            height: resized && layout.height > 0 ? layout.height : null,
            childUpdates: [],
            zIndex: Number.isFinite(draftZIndex) ? draftZIndex : undefined
          })
        }
      }
    }
  },

  save: async () => {
    if (get().isSavingEdits) return { saved: false }
    const ctx = get().ctx
    const iframe = get().iframeHandle
    const pc = ctx?.getPageContext()
    if (!ctx || !pc) return { saved: false }
    set({ isSavingEdits: true })
    try {
      get().commitCurrentDraft()
      await get().flushPendingDrags()
      const editHistory = useEditHistoryStore.getState()
      const snapshot = editHistory.getSnapshotForPage(pc.pageId)
      const hasEdits =
        snapshot.dragEdits.length > 0 ||
        snapshot.textEdits.length > 0 ||
        snapshot.propertyEdits.length > 0 ||
        snapshot.deletes.length > 0 ||
        snapshot.addElements.length > 0
      if (!hasEdits) {
        iframe?.clearEditModeSelection()
        set({ selection: null, draft: EMPTY_ELEMENT_DRAFT })
        useSessionDetailUiStore.getState().clearEditSelectedElement()
        ctx.requestRefresh()
        return { saved: false }
      }

      const filledAddElements = await Promise.all(
        snapshot.addElements.map(async (el) => {
          if (el.htmlFragment) return el
          const selector = el.assignedBlockId
            ? `body[data-page-id="${el.pageId}"] [data-block-id="${el.assignedBlockId}"]`
            : ''
          if (!selector || !iframe) return el
          try {
            const html = await iframe.readElementHtml?.(selector)
            return html ? { ...el, htmlFragment: html } : el
          } catch {
            return el
          }
        })
      )
      const isDeletedTarget = (selector: string, blockId?: string): boolean =>
        snapshot.deletes.some((d) =>
          editTargetMatchesDeletedSelector(selector, d.selector, blockId)
        )
      const safeDragEdits = snapshot.dragEdits.filter((e) => !isDeletedTarget(e.selector))
      const safeTextEdits = snapshot.textEdits.filter((e) => !isDeletedTarget(e.selector))
      const safePropertyEdits = snapshot.propertyEdits.filter(
        (e) => !isDeletedTarget(e.selector, e.blockId)
      )
      const parts: string[] = []
      const ac = snapshot.addElements.length
      const dc = snapshot.deletes.length
      const rc = safeDragEdits.length
      const tc = safeTextEdits.length
      const pcount = safePropertyEdits.length
      if (ac > 0) parts.push(`添加 ${ac} 个元素`)
      if (dc > 0) parts.push(`删除 ${dc} 个元素`)
      if (rc > 0) parts.push(`调整 ${rc} 个元素位置`)
      if (tc > 0) parts.push(`编辑 ${tc} 个元素文字`)
      if (pcount > 0) parts.push(`编辑 ${pcount} 个元素属性`)
      const prompt = parts.join('、') || '手动调整'
      const result = await ipc.saveEditBatch({
        sessionId: pc.sessionId,
        htmlPath: pc.htmlPath,
        pageId: pc.pageId,
        dragEdits: safeDragEdits,
        textEdits: safeTextEdits,
        propertyEdits: safePropertyEdits,
        deletes: snapshot.deletes,
        addElements: filledAddElements,
        prompt
      })
      if (!result.success) throw new Error(ctx.t('sessionDetail.layoutSaveFailed'))
      useEditHistoryStore.getState().markPageSaved(pc.pageId)
      iframe?.clearEditModeSelection()
      set({ selection: null, draft: EMPTY_ELEMENT_DRAFT })
      useSessionDetailUiStore.getState().clearEditSelectedElement()
      ctx.bumpThumbnail(pc.pageId)
      ctx.requestRefresh()
      const totalCount =
        result.dragCount +
        result.textCount +
        (result.propertyCount || 0) +
        result.deleteCount +
        result.addCount
      useToastStore
        .getState()
        .success(ctx.t('sessionDetail.adjustmentsSaved', { count: totalCount }))
      return { saved: true }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : ctx.t('sessionDetail.layoutSaveFailed')
      useToastStore.getState().error(message)
      return { saved: false, error: message }
    } finally {
      set({ isSavingEdits: false })
    }
  }
}))
