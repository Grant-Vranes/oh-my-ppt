import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { nanoid } from 'nanoid'
import {
  buildInspectorCleanupScript,
  buildInspectorInjectScript,
  INSPECTOR_CONSOLE_PREFIX
} from './inspector-script'
import {
  buildEditModeCleanupScript,
  buildEditModeInjectScript,
  buildEditModeSetPreviewScaleScript,
  EDIT_MODE_CONSOLE_PREFIX,
  type EditableElementSnapshot,
  type EditModeMovePayload,
  type EditSnapPoints,
  type EditSnapSettings,
  type EditTextTarget,
  type EditSelectionPayload
} from './edit-mode-script'
import { ipc } from '@renderer/lib/ipc'
import type { InteractionMode } from '@renderer/store'

const buildPreviewClickAnimationInjectScript = (): string => `
(() => {
  const KEY = "__pptPreviewClickAnimationBridge";
  if (window[KEY] && typeof window[KEY].cleanup === "function") return;

  const isEditableTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, button, [contenteditable='true'], [contenteditable='']"));
  };

  const advanceClickAnimation = () => {
    try {
      const clicks = window.PPT && window.PPT.clicks;
      if (clicks && clicks.total > 0 && typeof clicks.advance === "function") {
        return clicks.advance();
      }
    } catch (_err) {}
    return false;
  };

  const onClick = (event) => {
    if (isEditableTarget(event.target)) return;
    advanceClickAnimation();
  };

  const onKeyDown = (event) => {
    if (isEditableTarget(event.target)) return;
    if (!["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) return;
    if (advanceClickAnimation()) {
      event.preventDefault();
    }
  };

  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown);
  window[KEY] = {
    cleanup() {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      delete window[KEY];
    }
  };
})();
`

const buildPreviewClickAnimationCleanupScript = (): string => `
(() => {
  const state = window.__pptPreviewClickAnimationBridge;
  if (state && typeof state.cleanup === "function") {
    state.cleanup();
  }
})();
`

export interface PreviewIframeHandle {
  patchPageContent: (pageId: string, newHtml: string) => void
  liveUpdateElement: (
    selector: string,
    patch: {
      html?: string
      text?: string
      textTarget?: EditTextTarget
      style?: { color?: string; fontSize?: string; fontWeight?: string; textAlign?: string }
    }
  ) => void
  applyElementProperties: (
    selector: string,
    patch: {
      style?: {
        zIndex?: number
        opacity?: number
        backgroundColor?: string
        color?: string
        fontSize?: string
        fontWeight?: string
        textAlign?: string
        objectFit?: string
      }
      attrs?: {
        alt?: string
        poster?: string
        controls?: boolean
        muted?: boolean
        loop?: boolean
        autoplay?: boolean
        playsInline?: boolean
        preload?: string
      }
    }
  ) => void
  setElementLayout: (
    selector: string,
    layout: { x?: number; y?: number; width?: number; height?: number }
  ) => void
  restoreEditModeSelection: (selector: string) => Promise<boolean>
  clearEditModeSelection: () => void
  hideElement: (selector: string) => void
  showElement: (selector: string) => void
  applyDragStyle: (
    selector: string,
    style: { x: number; y: number; width?: number; height?: number; isAbsoluteMode?: boolean }
  ) => void
  applyZIndex: (selector: string, zIndex: number) => void
  copyElement: (
    selector: string,
    newBlockId: string
  ) => Promise<{ selector: string; htmlFragment: string } | null>
  readElementHtml: (selector: string) => Promise<string>
  readElementSnapshot: (selector: string) => Promise<EditableElementSnapshot | null>
  applyChildUpdates: (
    selector: string,
    childUpdates: Array<{ path: number[]; width?: number; height?: number }>
  ) => void
  injectElement: (
    parentSelector: string,
    htmlFragment: string,
    insertIndex?: number,
    selectAfterInsert?: boolean
  ) => void
  setEditSnapSettings: (settings: EditSnapSettings) => Promise<boolean>
  readEditSnapPoints: () => Promise<EditSnapPoints>
}

export const PreviewIframe = forwardRef<
  PreviewIframeHandle,
  {
    html?: string
    src?: string
    title: string
    htmlPath?: string
    pageId?: string
    inspecting?: boolean
    inspectable?: boolean
    editMode?: boolean
    thumbnail?: boolean
    interactionMode?: InteractionMode
    onSelectorSelected?: (
      selector: string,
      label: string,
      elementTag?: string,
      elementText?: string
    ) => void
    onElementMoved?: (payload: EditModeMovePayload) => void
    onElementSelected?: (payload: EditSelectionPayload) => void
    onInspectExit?: () => void
    onDidReload?: () => void
    onDeleteRequest?: (selector: string) => void
  }
>(function PreviewIframe(
  {
    src,
    title,
    htmlPath,
    pageId,
    inspecting = false,
    inspectable = false,
    editMode = false,
    thumbnail = false,
    interactionMode,
    onSelectorSelected,
    onElementMoved,
    onElementSelected,
    onInspectExit,
    onDidReload,
    onDeleteRequest
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const webviewReadyRef = useRef(false)
  const inspectorInjectedRef = useRef(false)
  const editModeInjectedRef = useRef(false)
  const previewClickInjectedRef = useRef(false)
  const previewScaleRef = useRef(1)
  const [webviewElement, setWebviewElement] = useState<Electron.WebviewTag | null>(null)
  const [webviewReady, setWebviewReady] = useState(false)
  const [transform, setTransform] = useState('scale(1)')
  const [previewScale, setPreviewScale] = useState(1)

  useEffect(() => {
    previewScaleRef.current = previewScale
  }, [previewScale])

  const resolvePageHtmlPath = (inputPath?: string, currentPageId?: string): string | undefined => {
    if (!inputPath) return undefined
    const isIndex = /[\\/]index\.html?$/i.test(inputPath)
    if (!isIndex) return inputPath
    if (!currentPageId) return undefined
    return inputPath.replace(/index\.html?$/i, `${currentPageId}.html`)
  }

  const encodePathSegments = (filePath: string): string =>
    filePath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')

  const applyPreviewUrlParams = (inputUrl: string): string => {
    const url = new URL(inputUrl)
    // PreviewIframe already does 1600x900 viewport scaling.
    // Disable page-level auto-fit to avoid double-scaling on specific pages.
    url.searchParams.set('fit', 'off')
    if (thumbnail) {
      // Historical page files contain an injected default-motion script that starts
      // many normal text/card nodes at opacity 0. Print mode makes PPT.animate
      // apply final states immediately and makes default motion scripts skip.
      url.searchParams.set('print', '1')
      url.searchParams.set('thumbnail', '1')
      if (pageId) url.searchParams.set('pageId', pageId)
    }
    return url.toString()
  }

  const toFileUrl = (absolutePath: string): string => {
    const normalizedPath = absolutePath.replace(/\\/g, '/')
    const fileUrl = /^[a-zA-Z]:\//.test(normalizedPath)
      ? `file:///${normalizedPath.slice(0, 2)}${encodePathSegments(normalizedPath.slice(2))}`
      : normalizedPath.startsWith('/')
        ? `file://${encodePathSegments(normalizedPath)}`
        : `file:///${encodePathSegments(normalizedPath)}`
    return applyPreviewUrlParams(fileUrl)
  }

  const withPreviewParams = (inputUrl: string): string => {
    return applyPreviewUrlParams(inputUrl)
  }

  // Always preview concrete page file (<pageId>.html). index.html is only for external full-deck preview.
  const pageHtmlPath = resolvePageHtmlPath(htmlPath, pageId)
  const webviewSrc = pageHtmlPath
    ? toFileUrl(pageHtmlPath)
    : src
      ? withPreviewParams(src)
      : undefined
  const currentInteractionMode: InteractionMode =
    interactionMode || (editMode ? 'edit' : inspecting ? 'ai-inspect' : 'preview')
  const pointerEnabled = inspectable

  const ensureAnchoredAnchor = async (args: {
    selector: string
    elementTag?: string
    elementText?: string
    reason: 'inspect' | 'drag' | 'text-edit'
  }): Promise<{ selector: string; blockId?: string }> => {
    if (!pageHtmlPath || !pageId) {
      throw new Error('Cannot anchor element without page path and page id')
    }
    const existingBlockId = args.selector.match(/\[data-block-id="([^"]+)"\]/)?.[1]
    if (existingBlockId) return { selector: args.selector, blockId: existingBlockId }
    try {
      const result = await ipc.ensureElementAnchor({
        htmlPath: pageHtmlPath,
        pageId,
        selector: args.selector,
        elementTag: args.elementTag,
        elementText: args.elementText,
        reason: args.reason
      })
      if (result.changed && result.blockId) {
        const webview = webviewRef.current
        if (webview) {
          safeExecuteJavaScript(
            webview,
            `(() => { var __el = document.querySelector(${JSON.stringify(args.selector)}); if (__el && !__el.getAttribute('data-block-id')) __el.setAttribute('data-block-id', ${JSON.stringify(result.blockId)}); })();`
          )
        }
      }
      return { selector: result.selector || args.selector, blockId: result.blockId }
    } catch {
      throw new Error('Failed to anchor selected element')
    }
  }

  const ensureAnchoredSelector = async (args: {
    selector: string
    elementTag?: string
    elementText?: string
    reason: 'inspect' | 'drag' | 'text-edit'
  }): Promise<string> => {
    const result = await ensureAnchoredAnchor(args)
    return result.selector
  }

  const handleWebviewRef = useCallback((node: Electron.WebviewTag | null): void => {
    webviewReadyRef.current = false
    inspectorInjectedRef.current = false
    editModeInjectedRef.current = false
    previewClickInjectedRef.current = false
    setWebviewReady(false)
    webviewRef.current = node
    setWebviewElement((prev) => (prev === node ? prev : node))
  }, [])

  const canExecuteJavaScript = (webview: Electron.WebviewTag): boolean => {
    return webview.isConnected && webviewRef.current === webview && webviewReadyRef.current
  }

  const wrapSafeVoidScript = (label: string, script: string): string => `
(() => {
  try {
    ${script}
  } catch (error) {
    const message = error && (error.stack || error.message || String(error));
    console.error("[PreviewIframe:${label}]", message || "Unknown script error");
  }
})();
`

  const safeExecuteJavaScript = (webview: Electron.WebviewTag, script: string): void => {
    if (!canExecuteJavaScript(webview)) return
    try {
      webview.executeJavaScript(wrapSafeVoidScript('void', script)).catch(() => {})
    } catch {
      // executeJavaScript may throw synchronously before dom-ready
    }
  }

  const safeExecuteHostScript = (
    webview: Electron.WebviewTag,
    label: string,
    script: string
  ): void => {
    if (!canExecuteJavaScript(webview)) return
    try {
      webview.executeJavaScript(wrapSafeVoidScript(label, script)).catch(() => {})
    } catch {
      // executeJavaScript may throw synchronously before dom-ready
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      patchPageContent(targetPageId: string, newHtml: string): void {
        const wv = webviewRef.current
        if (!wv) return
        safeExecuteJavaScript(
          wv,
          `
        var section = document.querySelector('[data-page-id="${targetPageId}"]');
        if (section) {
          section.innerHTML = ${JSON.stringify(newHtml)};
        } else {
          document.body.innerHTML = ${JSON.stringify(newHtml)};
        }
      `
        )
      },
      liveUpdateElement(
        selector: string,
        patch: {
          html?: string
          text?: string
          textTarget?: EditTextTarget
          style?: { color?: string; fontSize?: string; fontWeight?: string; textAlign?: string }
          zIndex?: number
        }
      ): void {
        const wv = webviewRef.current
        if (!wv) return
        safeExecuteJavaScript(
          wv,
          `if (window.__pptEditModeLiveUpdate) window.__pptEditModeLiveUpdate(${JSON.stringify(selector)}, ${JSON.stringify(patch)});`
        )
      },
      applyElementProperties(
        selector: string,
        patch: {
          style?: {
            zIndex?: number
            opacity?: number
            backgroundColor?: string
            color?: string
            fontSize?: string
            fontWeight?: string
            textAlign?: string
            objectFit?: string
          }
          attrs?: {
            alt?: string
            poster?: string
            controls?: boolean
            muted?: boolean
            loop?: boolean
            autoplay?: boolean
            playsInline?: boolean
            preload?: string
          }
        }
      ): void {
        const wv = webviewRef.current
        if (!wv) return
        safeExecuteJavaScript(
          wv,
          `if (window.__pptEditModeApplyProperties) window.__pptEditModeApplyProperties(${JSON.stringify(selector)}, ${JSON.stringify(patch)});`
        )
      },
      setElementLayout(
        selector: string,
        layout: { x?: number; y?: number; width?: number; height?: number }
      ): void {
        const wv = webviewRef.current
        if (!wv) return
        safeExecuteJavaScript(
          wv,
          `if (window.__pptEditModeSetLayout) window.__pptEditModeSetLayout(${JSON.stringify(selector)}, ${JSON.stringify(layout)});`
        )
      },
      async setEditSnapSettings(settings: EditSnapSettings): Promise<boolean> {
        const wv = webviewRef.current
        if (!wv || !canExecuteJavaScript(wv)) return false
        try {
          return Boolean(
            await wv.executeJavaScript(
              `(function(){` +
                `if (!window.__pptEditModeSetSnapSettings) return false;` +
                `window.__pptEditModeSetSnapSettings(${JSON.stringify(settings)});` +
                `return true;` +
              `})()`
            )
          )
        } catch {
          return false
        }
      },
      async readEditSnapPoints(): Promise<EditSnapPoints> {
        const wv = webviewRef.current
        if (!wv || !canExecuteJavaScript(wv)) return { x: [], y: [] }
        try {
          const result = (await wv.executeJavaScript(
            `(function(){` +
              `try {` +
                `return window.__pptEditModeReadSnapPoints ? window.__pptEditModeReadSnapPoints() : { x: [], y: [] };` +
              `} catch (_error) { return { x: [], y: [] }; }` +
            `})()`
          )) as Partial<EditSnapPoints> | null
          return {
            x: Array.isArray(result?.x) ? result.x.filter(Number.isFinite) : [],
            y: Array.isArray(result?.y) ? result.y.filter(Number.isFinite) : []
          }
        } catch {
          return { x: [], y: [] }
        }
      },
      async restoreEditModeSelection(selector: string): Promise<boolean> {
        const wv = webviewRef.current
        if (!wv) return false
        try {
          const result = await wv.executeJavaScript(
            `(function() {
              try {
                if (window.__pptEditModeRestoreSelection) {
                  return window.__pptEditModeRestoreSelection(${JSON.stringify(selector)});
                }
                return false;
              } catch (e) {
                console.debug("[EditMode] restore script error", e);
                return false;
              }
            })()`
          )
          return Boolean(result)
        } catch {
          return false
        }
      },
      clearEditModeSelection(): void {
        const wv = webviewRef.current
        if (!wv) return
        safeExecuteJavaScript(
          wv,
          `if (window.__pptEditModeClearSelection) window.__pptEditModeClearSelection();`
        )
      },
      hideElement(selector: string): void {
        const wv = webviewRef.current
        if (!wv) return
        safeExecuteJavaScript(
          wv,
          `(function(){` +
            `var __el = document.querySelector(${JSON.stringify(selector)});` +
            `if (!__el) return;` +
            `__el.setAttribute('data-ppt-pending-delete', '1');` +
            `if (__el.hasAttribute && __el.hasAttribute('data-ppt-art-text')) {` +
            `  var __blockId = __el.getAttribute('data-block-id') || '';` +
            `  var __style = __blockId ? Array.from(document.querySelectorAll('style[data-ppt-art-text-style]')).find(function(s){ return s.getAttribute('data-ppt-art-text-style') === __blockId; }) : null;` +
            `  if (__style) { __style.setAttribute('data-ppt-pending-delete', '1'); __style.disabled = true; }` +
            `}` +
            `if (__el.tagName === 'STYLE') { __el.disabled = true; return; }` +
            `__el.style.setProperty('display', 'none', 'important');` +
          `})()`
        )
      },
      showElement(selector: string): void {
        const wv = webviewRef.current
        if (!wv) return
        safeExecuteJavaScript(
          wv,
          `(function(){` +
            `var __el = document.querySelector(${JSON.stringify(selector)});` +
            `if (!__el || __el.getAttribute('data-ppt-pending-delete') !== '1') return;` +
            `if (__el.hasAttribute && __el.hasAttribute('data-ppt-art-text')) {` +
            `  var __blockId = __el.getAttribute('data-block-id') || '';` +
            `  var __style = __blockId ? Array.from(document.querySelectorAll('style[data-ppt-art-text-style]')).find(function(s){ return s.getAttribute('data-ppt-art-text-style') === __blockId; }) : null;` +
            `  if (__style) { __style.disabled = false; __style.removeAttribute('data-ppt-pending-delete'); }` +
            `}` +
            `if (__el.tagName === 'STYLE') { __el.disabled = false; __el.removeAttribute('data-ppt-pending-delete'); return; }` +
            `__el.style.removeProperty('display');` +
            `__el.removeAttribute('data-ppt-pending-delete');` +
          `})()`
        )
      },
      applyDragStyle(
        selector: string,
        style: { x: number; y: number; width?: number; height?: number; isAbsoluteMode?: boolean }
      ): void {
        const wv = webviewRef.current
        if (!wv) return
        if (style.isAbsoluteMode) {
          safeExecuteJavaScript(
            wv,
            `(function(){` +
              `var __el = document.querySelector(${JSON.stringify(selector)}); if (!__el) return;` +
              `__el.style.position = 'absolute';` +
              `if (!__el.style.zIndex) __el.style.zIndex = '10';` +
              `__el.style.left = ${JSON.stringify(style.x + 'px')};` +
              `__el.style.top = ${JSON.stringify(style.y + 'px')};` +
              `__el.style.translate = '';` +
              `__el.style.removeProperty('--ppt-drag-x');` +
              `__el.style.removeProperty('--ppt-drag-y');` +
              `__el.setAttribute('data-ppt-layout-converted', '1');` +
              (style.width != null ? `__el.style.width = ${JSON.stringify(style.width + 'px')};` : '') +
              (style.height != null ? `__el.style.height = ${JSON.stringify(style.height + 'px')};` : '') +
            `})()`
          )
          return
        }
        safeExecuteJavaScript(
          wv,
          `(function(){` +
            `var __el = document.querySelector(${JSON.stringify(selector)}); if (!__el) return;` +
            `var __pos = __el.style.position || getComputedStyle(__el).position;` +
            `if (!__pos || __pos === 'static') __el.style.position = 'relative';` +
            `if (!__el.style.zIndex) __el.style.zIndex = '10';` +
            `__el.style.setProperty('--ppt-drag-x', ${JSON.stringify(style.x + 'px')});` +
            `__el.style.setProperty('--ppt-drag-y', ${JSON.stringify(style.y + 'px')});` +
            `__el.style.translate = 'var(--ppt-drag-x, 0px) var(--ppt-drag-y, 0px)';` +
            (style.width != null ? `__el.style.width = ${JSON.stringify(style.width + 'px')};` : '') +
            (style.height != null ? `__el.style.height = ${JSON.stringify(style.height + 'px')};` : '') +
          `})()`
        )
      },
      applyZIndex(selector: string, zIndex: number): void {
        const wv = webviewRef.current
        if (!wv) return
        safeExecuteJavaScript(
          wv,
          `(function(){` +
          `var __el = document.querySelector(${JSON.stringify(selector)});` +
          `if (!__el) return;` +
          `var __position = window.getComputedStyle(__el).position;` +
          `if (!__position || __position === "static") __el.style.setProperty("position", "relative", "important");` +
          `__el.style.setProperty("z-index", String(${zIndex}), "important");` +
          `})()`
        )
      },
      async copyElement(
        selector: string,
        newBlockId: string
      ): Promise<{ selector: string; htmlFragment: string } | null> {
        const wv = webviewRef.current
        if (!wv || !canExecuteJavaScript(wv)) return null
        const scope = selector.match(/\[data-page-id="([^"]+)"\]/)?.[1] || ''
        const root = scope ? `body[data-page-id="${scope}"] [data-ppt-guard-root="1"]` : 'body'
        const newSelector = scope
          ? `body[data-page-id="${scope}"] [data-block-id="${newBlockId}"]`
          : `[data-block-id="${newBlockId}"]`
        try {
          // Pre-generate child block IDs with nanoid (same pattern as host code)
          const childIds = Array.from({ length: 20 }, () => 'select-arcsin1-' + nanoid(8))
          const copyResult = (await wv.executeJavaScript(
            `(function(){` +
            `var __src = document.querySelector(${JSON.stringify(selector)});` +
            `if (!__src) return null;` +
            `var __root = document.querySelector(${JSON.stringify(root)});` +
            `if (!__root) return null;` +
            `var __clone = __src.cloneNode(true);` +
            `var __childIds = ${JSON.stringify(childIds)};` +
            `var __oldBlockId = __src.getAttribute("data-block-id") || "";` +
            `var __styleClone = null;` +
            `var __styleHtml = "";` +
            `__clone.setAttribute("data-block-id", ${JSON.stringify(newBlockId)});` +
            `__clone.querySelectorAll("[data-block-id]").forEach(function(c,i){if(__childIds[i])c.setAttribute("data-block-id",__childIds[i]);});` +
            `__clone.classList.remove("ppt-edit-mode-selected","ppt-edit-mode-hover");` +
            `if (__src.hasAttribute("data-ppt-art-text") && __oldBlockId) {` +
            `  var __style = Array.from(document.querySelectorAll("style[data-ppt-art-text-style]")).find(function(s){ return s.getAttribute("data-ppt-art-text-style") === __oldBlockId; });` +
            `  if (__style) {` +
            `    __styleClone = __style.cloneNode(true);` +
            `    __styleClone.setAttribute("data-ppt-art-text-style", ${JSON.stringify(newBlockId)});` +
            `    __styleClone.textContent = String(__styleClone.textContent || "").split(__oldBlockId).join(${JSON.stringify(newBlockId)});` +
            `    __styleClone.disabled = false;` +
            `    __styleClone.removeAttribute("data-ppt-pending-delete");` +
            `    __styleHtml = __styleClone.outerHTML;` +
            `    __root.appendChild(__styleClone);` +
            `  }` +
            `}` +
            `var __rect = __src.getBoundingClientRect();` +
            `var __pos = __src.style.position || getComputedStyle(__src).position;` +
            `if (__pos === "absolute" || __src.hasAttribute("data-ppt-layout-converted")) {` +
            `  __clone.style.left = (parseFloat(__src.style.left||"0")+40)+"px";` +
            `  __clone.style.top = (parseFloat(__src.style.top||"0")+40)+"px";` +
            `  var __z = parseInt(__src.style.zIndex||"10")||10;` +
            `  __clone.style.zIndex = String(__z+1);` +
            `} else {` +
            `  __clone.style.position = "absolute";` +
            `  __clone.style.left = (__rect.left+40)+"px";` +
            `  __clone.style.top = (__rect.top+40)+"px";` +
            `  __clone.style.width = __rect.width+"px";` +
            `  __clone.style.height = __rect.height+"px";` +
            `  __clone.style.zIndex = "20";` +
            `}` +
            `__clone.removeAttribute("data-ppt-layout-converted");` +
            `__clone.removeAttribute("data-ppt-last-vp-x");` +
            `__clone.removeAttribute("data-ppt-last-vp-y");` +
            `var __htmlFragment = __styleHtml + __clone.outerHTML;` +
            `__root.appendChild(__clone);` +
            `return { selector: ${JSON.stringify(newSelector)}, htmlFragment: __htmlFragment };` +
            `})()`
          )) as { selector?: string; htmlFragment?: string } | null
          if (!copyResult?.selector || !copyResult.htmlFragment) return null
          return { selector: copyResult.selector, htmlFragment: copyResult.htmlFragment }
        } catch {
          return null
        }
      },
      async readElementHtml(selector: string): Promise<string> {
        const wv = webviewRef.current
        if (!wv || !canExecuteJavaScript(wv)) return ''
        try {
          return (await wv.executeJavaScript(
            `(function(){` +
              `var __el = document.querySelector(${JSON.stringify(selector)});` +
              `if (!__el) return '';` +
              `if (__el.hasAttribute && __el.hasAttribute('data-ppt-art-text')) {` +
              `  var __blockId = __el.getAttribute('data-block-id') || '';` +
              `  var __style = __blockId ? Array.from(document.querySelectorAll('style[data-ppt-art-text-style]')).find(function(s){ return s.getAttribute('data-ppt-art-text-style') === __blockId; }) : null;` +
              `  return (__style ? __style.outerHTML : '') + __el.outerHTML;` +
              `}` +
              `return __el.outerHTML || '';` +
            `})()`
          )) || ''
        } catch {
          return ''
        }
      },
      async readElementSnapshot(selector: string): Promise<EditableElementSnapshot | null> {
        const wv = webviewRef.current
        if (!wv || !canExecuteJavaScript(wv)) return null
        try {
          return (
            (await wv.executeJavaScript(
              `window.__pptEditModeReadSnapshot ? window.__pptEditModeReadSnapshot(${JSON.stringify(selector)}) : null`
            )) || null
          )
        } catch {
          return null
        }
      },
      applyChildUpdates(
        selector: string,
        childUpdates: Array<{ path: number[]; width?: number; height?: number }>
      ): void {
        const wv = webviewRef.current
        if (!wv || childUpdates.length === 0) return
        const updatesJs = childUpdates
          .map(
            (u) =>
              `{path:${JSON.stringify(u.path)},width:${u.width != null ? u.width : 'null'},height:${u.height != null ? u.height : 'null'}}`
          )
          .join(',')
        safeExecuteJavaScript(
          wv,
          `(function(){` +
          `var __parent = document.querySelector(${JSON.stringify(selector)}); if (!__parent) return;` +
          `var __ups = [${updatesJs}];` +
          `for (var __i = 0; __i < __ups.length; __i++) {` +
          `  var __u = __ups[__i]; var __c = __parent;` +
          `  for (var __j = 0; __j < __u.path.length; __j++) { __c = __c.children[__u.path[__j]]; if (!__c) break; }` +
          `  if (!__c) continue;` +
          `  if (__u.width !== null) __c.style.width = __u.width + 'px';` +
          `  if (__u.height !== null) __c.style.height = __u.height + 'px';` +
          `}` +
          `if (window.PPT && typeof window.PPT.resizeCharts === "function") { try { window.PPT.resizeCharts(__parent); } catch(__e) {} }` +
          `})()`
        )
      },
      injectElement(
        parentSelector: string,
        htmlFragment: string,
        insertIndex = -1,
        selectAfterInsert = true
      ): void {
        const wv = webviewRef.current
        if (!wv) return
        safeExecuteJavaScript(
          wv,
          `(function(){` +
          `var __parentSelector = ${JSON.stringify(parentSelector)};` +
          `var __html = ${JSON.stringify(htmlFragment)};` +
          `var __insertIndex = ${JSON.stringify(insertIndex)};` +
          `var __selectAfterInsert = ${JSON.stringify(selectAfterInsert)};` +
          `if (window.__pptEditModeInjectElement) { window.__pptEditModeInjectElement(__parentSelector, __html, __insertIndex, __selectAfterInsert); return; }` +
          `var __parent = document.querySelector(__parentSelector); if (!__parent) return;` +
          `var __template = document.createElement("template"); __template.innerHTML = __html;` +
          `var __nodes = Array.from(__template.content.children); if (__nodes.length === 0) return;` +
          `var __existingBlock = null;` +
          `for (var __k = 0; __k < __nodes.length; __k++) {` +
          `  var __blockId = __nodes[__k] instanceof Element ? __nodes[__k].getAttribute("data-block-id") : "";` +
          `  if (__blockId && document.querySelector('[data-block-id="' + __blockId.replace(/"/g, '\\\\"') + '"]')) { __existingBlock = __blockId; break; }` +
          `}` +
          `if (__existingBlock) return;` +
          `var __anchor = Number.isInteger(__insertIndex) && __insertIndex >= 0 && __insertIndex < __parent.children.length ? __parent.children[__insertIndex] : null;` +
          `__nodes.forEach(function(__node){ if (__anchor) __parent.insertBefore(__node, __anchor); else __parent.appendChild(__node); });` +
          `})()`
        )
      }
    }),
    []
  )

  useEffect(() => {
    const webview = webviewElement
    if (!webview) return

    webviewReadyRef.current = false
    setWebviewReady(false)

    const markReady = (): void => {
      if (webviewRef.current === webview) {
        webviewReadyRef.current = true
        setWebviewReady(true)
      }
    }
    const handleStartLoading = (): void => {
      if (webviewRef.current === webview) {
        webviewReadyRef.current = false
        setWebviewReady(false)
      }
    }

    webview.addEventListener('dom-ready', markReady as EventListener)
    webview.addEventListener('did-start-loading', handleStartLoading as EventListener)

    return () => {
      webview.removeEventListener('dom-ready', markReady as EventListener)
      webview.removeEventListener('did-start-loading', handleStartLoading as EventListener)
      if (webviewRef.current === webview) {
        webviewReadyRef.current = false
        setWebviewReady(false)
      }
    }
  }, [webviewElement])

  // Inspector effect: handles AI inspect mode only.
  useEffect(() => {
    const webview = webviewElement
    if (!webview || !inspectable || !webviewReady) return

    const runInspectorLifecycle = (): void => {
      if (inspecting) {
        safeExecuteHostScript(webview, 'inspector-inject', buildInspectorInjectScript())
        inspectorInjectedRef.current = true
      } else {
        if (!inspectorInjectedRef.current) return
        safeExecuteHostScript(webview, 'inspector-cleanup', buildInspectorCleanupScript())
        inspectorInjectedRef.current = false
      }
    }

    runInspectorLifecycle()

    return () => {
      if (!inspectorInjectedRef.current) return
      safeExecuteHostScript(webview, 'inspector-cleanup', buildInspectorCleanupScript())
      inspectorInjectedRef.current = false
    }
  }, [inspectable, inspecting, webviewReady, webviewSrc, webviewElement])

  // Unified edit mode effect: handles click-to-select, drag, and resize.
  // Use ref for onDidReload to avoid re-running effect on every parent re-render.
  const onDidReloadRef = useRef(onDidReload)
  onDidReloadRef.current = onDidReload

  useEffect(() => {
    const webview = webviewElement
    if (!webview || !inspectable || !webviewReady) return

    const runEditModeLifecycle = (): void => {
      if (editMode) {
        safeExecuteHostScript(
          webview,
          'edit-inject',
          buildEditModeInjectScript(previewScaleRef.current)
        )
        editModeInjectedRef.current = true
      } else {
        if (!editModeInjectedRef.current) return
        safeExecuteHostScript(webview, 'edit-cleanup', buildEditModeCleanupScript())
        editModeInjectedRef.current = false
      }
    }

    runEditModeLifecycle()
    if (editMode) onDidReloadRef.current?.()

    return () => {
      if (!editModeInjectedRef.current) return
      safeExecuteHostScript(webview, 'edit-cleanup', buildEditModeCleanupScript())
      editModeInjectedRef.current = false
    }
  }, [inspectable, editMode, webviewReady, webviewSrc, webviewElement])

  useEffect(() => {
    const webview = webviewElement
    if (!webview || !inspectable || !webviewReady) return

    const runPreviewClickAnimationLifecycle = (): void => {
      if (currentInteractionMode === 'preview') {
        safeExecuteHostScript(
          webview,
          'preview-click-animation-inject',
          buildPreviewClickAnimationInjectScript()
        )
        previewClickInjectedRef.current = true
      } else {
        if (!previewClickInjectedRef.current) return
        safeExecuteHostScript(
          webview,
          'preview-click-animation-cleanup',
          buildPreviewClickAnimationCleanupScript()
        )
        previewClickInjectedRef.current = false
      }
    }

    runPreviewClickAnimationLifecycle()

    return () => {
      if (!previewClickInjectedRef.current) return
      safeExecuteHostScript(
        webview,
        'preview-click-animation-cleanup',
        buildPreviewClickAnimationCleanupScript()
      )
      previewClickInjectedRef.current = false
    }
  }, [inspectable, currentInteractionMode, webviewReady, webviewSrc, webviewElement])

  useEffect(() => {
    const webview = webviewElement
    if (!webview || !inspectable || !editMode || !webviewReady) return
    safeExecuteHostScript(
      webview,
      'edit-set-preview-scale',
      buildEditModeSetPreviewScaleScript(previewScale)
    )
  }, [editMode, inspectable, previewScale, webviewReady, webviewElement])

  // Console message router: inspector + unified edit mode
  // Use refs for callback props to avoid re-registering listener on every parent re-render
  const onSelectorSelectedRef = useRef(onSelectorSelected)
  onSelectorSelectedRef.current = onSelectorSelected
  const onElementMovedRef = useRef(onElementMoved)
  onElementMovedRef.current = onElementMoved
  const onElementSelectedRef = useRef(onElementSelected)
  onElementSelectedRef.current = onElementSelected
  const onInspectExitRef = useRef(onInspectExit)
  onInspectExitRef.current = onInspectExit
  const onDeleteRequestRef = useRef(onDeleteRequest)
  onDeleteRequestRef.current = onDeleteRequest
  useEffect(() => {
    const webview = webviewElement
    if (!webview || !inspectable) return

    const handleConsoleMessage = (event: Event): void => {
      const payloadText = (event as { message?: unknown }).message
      if (typeof payloadText !== 'string') {
        return
      }
      if (payloadText.startsWith('[PreviewIframe:')) {
        console.error(payloadText)
        return
      }
      const isInspectorMessage = payloadText.startsWith(INSPECTOR_CONSOLE_PREFIX)
      const isEditModeMessage = payloadText.startsWith(EDIT_MODE_CONSOLE_PREFIX)
      if (!isInspectorMessage && !isEditModeMessage) return

      const prefixLength = isInspectorMessage
        ? INSPECTOR_CONSOLE_PREFIX.length
        : EDIT_MODE_CONSOLE_PREFIX.length
      const raw = payloadText.slice(prefixLength).trim()
      if (!raw) return
      try {
        const parsed = JSON.parse(raw) as {
          type?: string
          selector?: string
          blockId?: string
          label?: string
          elementTag?: string
          elementText?: string
          kind?: EditSelectionPayload['kind']
          capabilities?: EditSelectionPayload['capabilities']
          snapshot?: EditSelectionPayload['snapshot']
          isText?: boolean
          layoutMode?: EditModeMovePayload['layoutMode']
          x?: number
          y?: number
          deltaX?: number
          deltaY?: number
          visualX?: number
          visualY?: number
          width?: number
          height?: number
          scale?: number
          childUpdates?: Array<{
            path: number[]
            width?: number
            height?: number
          }>
          text?: string
          html?: string
          textTarget?: EditTextTarget
          style?: EditSelectionPayload['style']
          bounds?: EditSelectionPayload['bounds']
          translateX?: number
          translateY?: number
          zIndex?: number
          editability?: EditSelectionPayload['editability']
        }

        // Inspector: element selected (AI mode)
        if (isInspectorMessage && parsed.type === 'selected' && parsed.selector) {
          void (async () => {
            const anchoredSelector = await ensureAnchoredSelector({
              selector: parsed.selector || '',
              elementTag: parsed.elementTag,
              elementText: parsed.elementText,
              reason: 'inspect'
            })
            onSelectorSelectedRef.current?.(
              anchoredSelector,
              anchoredSelector,
              parsed.elementTag,
              parsed.elementText
            )
          })().catch(() => {})
          return
        }

        // Edit mode: element selected (click)
        if (isEditModeMessage && parsed.type === 'selected' && parsed.selector) {
          void (async () => {
            const anchor = await ensureAnchoredAnchor({
              selector: parsed.selector || '',
              elementTag: parsed.elementTag,
              elementText: parsed.elementText,
              reason: 'drag'
            })
            const textTarget =
              parsed.textTarget && parsed.textTarget.parentSelector === parsed.selector
                ? { ...parsed.textTarget, parentSelector: anchor.selector }
                : parsed.textTarget
            onElementSelectedRef.current?.({
              selector: anchor.selector,
              blockId: anchor.blockId || parsed.blockId,
              label: anchor.selector,
              elementTag: parsed.elementTag || '',
              elementText: parsed.elementText || '',
              kind: parsed.kind,
              capabilities: parsed.capabilities,
              snapshot: parsed.snapshot
                ? {
                    ...parsed.snapshot,
                    selector: anchor.selector,
                    blockId: anchor.blockId || parsed.snapshot.blockId || parsed.blockId
                  }
                : parsed.snapshot,
              isText: Boolean(parsed.isText),
              text: typeof parsed.text === 'string' ? parsed.text : '',
              html: typeof parsed.html === 'string' ? parsed.html : '',
              textTarget,
              style: parsed.style || {},
              bounds: parsed.bounds,
              translateX: Number(parsed.translateX || 0),
              translateY: Number(parsed.translateY || 0),
              zIndex: typeof parsed.zIndex === 'number' ? parsed.zIndex : undefined,
              editability: parsed.editability || undefined
            })
          })().catch(() => {})
          return
        }

        // Edit mode: pre-anchor request
        if (isEditModeMessage && parsed.type === 'pre-anchor' && parsed.selector) {
          void (async () => {
            let anchorResult: { selector: string; blockId?: string }
            try {
              anchorResult = await ensureAnchoredAnchor({
                selector: parsed.selector || '',
                elementTag: parsed.elementTag,
                reason: 'drag'
              })
            } catch {
              return
            }
            const wv = webviewRef.current
            if (wv) {
              safeExecuteJavaScript(
                wv,
                `if (window.__pptResolveEditModeAnchor) window.__pptResolveEditModeAnchor(${JSON.stringify(anchorResult)});`
              )
            }
          })().catch(() => {})
          return
        }

        // Edit mode: element moved/resized
        if (isEditModeMessage && parsed.type === 'moved' && parsed.selector) {
          void (async () => {
            const anchor = await ensureAnchoredAnchor({
              selector: parsed.selector || '',
              elementTag: parsed.elementTag,
              reason: 'drag'
            })
            onElementMovedRef.current?.({
              selector: anchor.selector,
              blockId: anchor.blockId || parsed.blockId,
              label: anchor.selector,
              elementTag: parsed.elementTag || '',
              layoutMode: parsed.layoutMode,
              x: Number(parsed.x || 0),
              y: Number(parsed.y || 0),
              deltaX: Number(parsed.deltaX || 0),
              deltaY: Number(parsed.deltaY || 0),
              visualX: parsed.visualX === undefined ? undefined : Number(parsed.visualX),
              visualY: parsed.visualY === undefined ? undefined : Number(parsed.visualY),
              width: parsed.width === undefined ? undefined : Number(parsed.width),
              height: parsed.height === undefined ? undefined : Number(parsed.height),
              scale: parsed.scale === undefined ? undefined : Number(parsed.scale),
              childUpdates: Array.isArray(parsed.childUpdates)
                ? parsed.childUpdates
                    .map((item) => ({
                      path: Array.isArray(item.path)
                        ? item.path
                            .map((value) => Number(value))
                            .filter((value) => Number.isInteger(value) && value >= 0)
                        : [],
                      width: item.width === undefined ? undefined : Number(item.width),
                      height: item.height === undefined ? undefined : Number(item.height)
                    }))
                    .filter(
                      (item) =>
                        item.path.length > 0 &&
                        (item.width !== undefined || item.height !== undefined)
                    )
                : undefined
            })
          })().catch(() => {})
          return
        }

        // Exit from either mode
        if (parsed.type === 'exit') {
          onInspectExitRef.current?.()
        }

        // Edit mode: keyboard delete request
        if (isEditModeMessage && parsed.type === 'delete-request' && parsed.selector) {
          onDeleteRequestRef.current?.(parsed.selector)
        }
      } catch {
        // ignore parse error
      }
    }

    webview.addEventListener('console-message', handleConsoleMessage as EventListener)
    return () => {
      webview.removeEventListener('console-message', handleConsoleMessage as EventListener)
    }
  }, [
    inspectable,
    pageHtmlPath,
    pageId,
    webviewElement
  ])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateScale = (): void => {
      const { width, height } = el.getBoundingClientRect()
      const nextScaleRaw = Math.min(width / 1600, height / 900)
      const nextScale = Number.isFinite(nextScaleRaw) && nextScaleRaw > 0 ? nextScaleRaw : 1
      const offsetX = Math.max(0, (width - 1600 * nextScale) / 2)
      const offsetY = Math.max(0, (height - 900 * nextScale) / 2)
      setPreviewScale(nextScale)
      setTransform(`translate(${offsetX}px, ${offsetY}px) scale(${nextScale})`)
    }

    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-[inherit] bg-[#f5f1e8]"
    >
      {webviewSrc ? (
        <webview
          ref={handleWebviewRef}
          src={webviewSrc}
          tabIndex={0}
          title={title}
          className={`absolute left-0 top-0 h-[900px] w-[1600px] origin-top-left ${
            pointerEnabled ? 'pointer-events-auto' : 'pointer-events-none'
          } ${editMode ? 'cursor-move' : inspecting ? 'cursor-crosshair' : ''}`}
          style={{ transform }}
        />
      ) : null}
    </div>
  )
})
