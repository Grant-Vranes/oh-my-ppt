import { nanoid } from 'nanoid'
import { escapeHtmlText } from '../../lib/utils'
import { buildSelectedElementFromSnapshot } from '../session-detail/element-inspector/elementEditUtils'
import { buildArtTextHtmlFragment, type ArtTextTemplateId } from '../../lib/artTextTemplates'
import {
  buildShapeElementHtml,
  buildIconElementHtml,
  getShapeDefinition,
  type InsertShapeType
} from '../session-detail/workspace/insert-shapes'
import {
  buildChartElementHtml,
  DEFAULT_CHART_DATA,
  type InsertChartType
} from '../session-detail/workspace/insert-charts'
import type { EditableElementSnapshot } from '../preview/edit-mode-script'
import { useT } from '../../i18n'
import { useHtmlEditStore } from '../../store/htmlEditStore'
import { useHtmlEditHistoryStore } from '../../store/htmlEditHistoryStore'

/**
 * HTML 编辑器的「插入元素」hook（复制自 session-detail.tsx 的 handleAdd*Element，独立实现）。
 * 复用 session-edit 的纯插入片段构造器（shapes/charts/artText/formula），但接 html-edit store，
 * 且画布为 document 模式（按 designWidth 居中、自顶向下堆叠，不依赖固定高度）。
 * 媒体文件由 html-editor IPC 复制到当前文档的 assets 目录，再插入其 file:// URL。
 */

const ADDED_ELEMENT_EDGE_PADDING = 20
const ADDED_TEXT_WIDTH = 420
const ADDED_TEXT_MIN_HEIGHT = 96
const ADDED_TEXT_OFFSET_STEP = 28
const ADDED_ART_TEXT_WIDTH = 560
const ADDED_ART_TEXT_MIN_HEIGHT = 130
const ADDED_ICON_SIZE = 96
const ADDED_CHART_WIDTH = 520
const ADDED_CHART_HEIGHT = 300
const ADDED_IMAGE_WIDTH = 480
const ADDED_IMAGE_HEIGHT = 320
const ADDED_VIDEO_WIDTH = 640
const ADDED_VIDEO_HEIGHT = 360
const DEFAULT_NEW_ELEMENT_Z_INDEX = 20

export interface UseHtmlElementInsertionOptions {
  designWidth: number
  t: ReturnType<typeof useT>
}

async function readSnapshotWithRetry(
  read: (selector: string) => Promise<EditableElementSnapshot | null> | undefined,
  selector: string
): Promise<EditableElementSnapshot | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 50))
    const snapshot = await read(selector)
    if (snapshot) return snapshot
  }
  return null
}

export function useHtmlElementInsertion(opts: UseHtmlElementInsertionOptions): {
  addText: () => Promise<void>
  addArtText: (templateId: ArtTextTemplateId) => Promise<void>
  addShape: (type: InsertShapeType) => Promise<void>
  addIcon: (iconId: string) => Promise<void>
  addChart: (type: InsertChartType) => Promise<void>
  addImage: (src: string) => Promise<boolean>
  addVideo: (src: string) => Promise<boolean>
  copyElement: () => Promise<void>
} {
  const { designWidth, t } = opts

  const addAndSelect = async (blockId: string, htmlFragment: string): Promise<boolean> => {
    const edit = useHtmlEditStore.getState()
    const pc = edit.ctx?.getPageContext()
    const iframe = edit.iframeHandle
    if (!pc || !iframe) return false
    const parentSelector = `body[data-page-id="${pc.pageId}"] [data-ppt-guard-root="1"]`
    edit.commitCurrentDraft()
    const injected = await iframe.injectElement(parentSelector, htmlFragment)
    if (!injected) return false
    useHtmlEditHistoryStore.getState().addElement({
      pageId: pc.pageId,
      htmlPath: pc.htmlPath,
      parentSelector,
      htmlFragment,
      assignedBlockId: blockId,
      insertIndex: -1
    })
    const selector = `body[data-page-id="${pc.pageId}"] [data-block-id="${blockId}"]`
    const snapshot = await readSnapshotWithRetry((s) => iframe.readElementSnapshot(s), selector)
    if (!snapshot) return true
    useHtmlEditStore
      .getState()
      .selectElement(buildSelectedElementFromSnapshot({ selector, blockId, snapshot }))
    return true
  }

  // document 模式定位：按 designWidth 水平居中，纵向自顶向下堆叠（不依赖固定高度）
  const place = (w: number): { left: number; top: number; zIdx: number } => {
    const existingCount = useHtmlEditHistoryStore.getState().addElements.length
    const offset = existingCount * ADDED_TEXT_OFFSET_STEP
    const left = Math.min(
      Math.max(ADDED_ELEMENT_EDGE_PADDING, (designWidth - w) / 2) + offset,
      Math.max(ADDED_ELEMENT_EDGE_PADDING, designWidth - w - ADDED_ELEMENT_EDGE_PADDING)
    )
    return {
      left,
      top: ADDED_ELEMENT_EDGE_PADDING + offset,
      zIdx: DEFAULT_NEW_ELEMENT_Z_INDEX
    }
  }

  const addText = async (): Promise<void> => {
    const blockId = 'select-arcsin1-' + nanoid(8)
    const { left, top, zIdx } = place(ADDED_TEXT_WIDTH)
    const textStyle = [
      'position:absolute',
      `left:${left}px`,
      `top:${top}px`,
      `width:${ADDED_TEXT_WIDTH}px`,
      `min-height:${ADDED_TEXT_MIN_HEIGHT}px`,
      'margin:0',
      'padding:0',
      `z-index:${zIdx}`,
      'color:#34402c',
      'font-size:40px',
      'font-weight:700',
      'line-height:1.18',
      'letter-spacing:0',
      'white-space:pre-wrap',
      'overflow-wrap:anywhere',
      'font-family:inherit'
    ].join('; ')
    const htmlFragment = `<p data-block-id="${blockId}" style="${textStyle};">${escapeHtmlText(
      t('editMode.defaultText')
    )}</p>`
    await addAndSelect(blockId, htmlFragment)
  }

  const addArtText = async (templateId: ArtTextTemplateId): Promise<void> => {
    const blockId = 'select-arcsin1-' + nanoid(8)
    const { left, top, zIdx } = place(ADDED_ART_TEXT_WIDTH)
    const htmlFragment = buildArtTextHtmlFragment(templateId, {
      blockId,
      left,
      top,
      width: ADDED_ART_TEXT_WIDTH,
      minHeight: ADDED_ART_TEXT_MIN_HEIGHT,
      zIndex: zIdx
    })
    await addAndSelect(blockId, htmlFragment)
  }

  const addShape = async (type: InsertShapeType): Promise<void> => {
    const def = getShapeDefinition(type)
    if (!def) return
    const blockId = 'select-arcsin1-' + nanoid(8)
    const { left, top, zIdx } = place(def.defaultWidth)
    const htmlFragment = buildShapeElementHtml({
      blockId,
      type,
      left,
      top,
      width: def.defaultWidth,
      height: def.defaultHeight,
      zIndex: zIdx
    })
    await addAndSelect(blockId, htmlFragment)
  }

  const addIcon = async (iconId: string): Promise<void> => {
    const blockId = 'select-arcsin1-' + nanoid(8)
    const { left, top, zIdx } = place(ADDED_ICON_SIZE)
    const htmlFragment = buildIconElementHtml({
      blockId,
      iconId,
      left,
      top,
      width: ADDED_ICON_SIZE,
      height: ADDED_ICON_SIZE,
      zIndex: zIdx
    })
    await addAndSelect(blockId, htmlFragment)
  }

  const addChart = async (type: InsertChartType): Promise<void> => {
    // 确保 Chart.js 已在 webview 中加载（只加载一次，executeJavaScript 绕过 CORS）
    const iframe = useHtmlEditStore.getState().iframeHandle
    if (iframe) await iframe.ensureChartJs()
    const blockId = 'select-arcsin1-' + nanoid(8)
    const { left, top, zIdx } = place(ADDED_CHART_WIDTH)
    const htmlFragment = buildChartElementHtml(
      { blockId, left, top, width: ADDED_CHART_WIDTH, height: ADDED_CHART_HEIGHT, zIndex: zIdx },
      DEFAULT_CHART_DATA[type] || DEFAULT_CHART_DATA.bar
    )
    await addAndSelect(blockId, htmlFragment)
  }

  const addMedia = async (mediaType: 'image' | 'video', src: string): Promise<boolean> => {
    const normalizedSrc = src.trim()
    if (!normalizedSrc) return false
    const blockId = 'select-arcsin1-' + nanoid(8)
    const width = mediaType === 'video' ? ADDED_VIDEO_WIDTH : ADDED_IMAGE_WIDTH
    const height = mediaType === 'video' ? ADDED_VIDEO_HEIGHT : ADDED_IMAGE_HEIGHT
    const { left, top, zIdx } = place(width)
    const style = [
      'position:absolute',
      `left:${left}px`,
      `top:${top}px`,
      `width:${width}px`,
      `height:${height}px`,
      `z-index:${zIdx}`,
      'object-fit:contain',
      'box-sizing:border-box'
    ].join('; ')
    const safeSrc = escapeHtmlText(normalizedSrc)
    const htmlFragment =
      mediaType === 'video'
        ? `<video src="${safeSrc}" data-block-id="${blockId}" data-ppt-edit-kind="media" style="${style};" controls playsinline preload="metadata"></video>`
        : `<img src="${safeSrc}" alt="" data-block-id="${blockId}" data-ppt-edit-kind="media" style="${style};" />`
    return addAndSelect(blockId, htmlFragment)
  }

  const addImage = (src: string): Promise<boolean> => addMedia('image', src)

  const addVideo = (src: string): Promise<boolean> => addMedia('video', src)

  const copyElement = async (): Promise<void> => {
    const edit = useHtmlEditStore.getState()
    const pc = edit.ctx?.getPageContext()
    const iframe = edit.iframeHandle
    const selection = edit.selection
    if (!pc || !iframe || !selection) return
    const blockId = 'select-arcsin1-' + nanoid(8)
    let copyResult: { selector: string; htmlFragment: string } | null = null
    try {
      copyResult = await iframe.copyElement(selection.selector, blockId)
    } catch {
      return
    }
    if (!copyResult) return
    const parentSelector = `body[data-page-id="${pc.pageId}"] [data-ppt-guard-root="1"]`
    edit.commitCurrentDraft()
    useHtmlEditHistoryStore.getState().addElement({
      pageId: pc.pageId,
      htmlPath: pc.htmlPath,
      parentSelector,
      htmlFragment: copyResult.htmlFragment,
      assignedBlockId: blockId,
      insertIndex: -1
    })
    await iframe.injectElement(parentSelector, copyResult.htmlFragment)
    const snapshot = await readSnapshotWithRetry(
      (s) => iframe.readElementSnapshot(s),
      copyResult.selector
    )
    if (!snapshot) return
    useHtmlEditStore
      .getState()
      .selectElement(
        buildSelectedElementFromSnapshot({ selector: copyResult.selector, blockId, snapshot })
      )
  }

  return { addText, addArtText, addShape, addIcon, addChart, addImage, addVideo, copyElement }
}
