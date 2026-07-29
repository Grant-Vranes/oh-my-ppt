import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from 'react'
import { useHtmlEditorUiStore } from '../../store/htmlEditorUiStore'
import type { EditSnapPoints, EditSnapSettings } from '@arcsin1/presentation-editor-runtime'

export interface GuidesSnapBridge {
  setEditSnapSettings: (settings: EditSnapSettings) => Promise<boolean>
  readEditSnapPoints: () => Promise<EditSnapPoints>
}

export const RULER_SIZE = 18
export const RULER_GAP = 4
export const EDITOR_INSET = RULER_SIZE + RULER_GAP
const TICK_STEP = 20
const MAJOR_STEP = 100

type Axis = 'vertical' | 'horizontal'

interface Metrics {
  left: number
  top: number
  width: number
  height: number
  rootW: number
  rootH: number
}

/**
 * 独立 HTML 编辑器的标尺 + 辅助线 + 网格 overlay（document 模式专用，重写）。
 * - 标尺条固定在画布左上 margin（始终可见），刻度随滚动更新（左标尺）。
 * - 网格随内容滚动；辅助线可从标尺拖出、拖动、双击删除。
 * - 通过 snapBridge 把 guides/grid/snap 同步给 presentation editor runtime，元素可吸附。
 */
export function HtmlEditorGuidesOverlay({
  rootRef,
  scrollRef,
  hostRef,
  previewIframeRef,
  designWidth,
  contentHeight,
  scale,
  selectedPageId,
  reloadSignal
}: {
  rootRef: RefObject<HTMLDivElement | null>
  scrollRef: RefObject<HTMLDivElement | null>
  hostRef: RefObject<HTMLDivElement | null>
  previewIframeRef: RefObject<GuidesSnapBridge | null>
  designWidth: number
  contentHeight: number
  scale: number
  selectedPageId: string
  reloadSignal: number
}): React.JSX.Element | null {
  const [m, setM] = useState<Metrics | null>(null)

  const editorSnapEnabled = useHtmlEditorUiStore((s) => s.editorSnapEnabled)
  const editorGridVisible = useHtmlEditorUiStore((s) => s.editorGridVisible)
  const editorGridSize = useHtmlEditorUiStore((s) => s.editorGridSize)
  const guides =
    useHtmlEditorUiStore((s) => s.editorGuidesByPage[selectedPageId]) ?? {
      vertical: [],
      horizontal: []
    }
  const addEditorGuide = useHtmlEditorUiStore((s) => s.addEditorGuide)
  const moveEditorGuide = useHtmlEditorUiStore((s) => s.moveEditorGuide)
  const removeEditorGuide = useHtmlEditorUiStore((s) => s.removeEditorGuide)

  const measure = useCallback((): void => {
    const root = rootRef.current
    const host = hostRef.current
    if (!root || !host) {
      setM(null)
      return
    }
    const rr = root.getBoundingClientRect()
    const hr = host.getBoundingClientRect()
    setM({
      left: hr.left - rr.left,
      top: hr.top - rr.top,
      width: hr.width,
      height: hr.height,
      rootW: rr.width,
      rootH: rr.height
    })
  }, [hostRef, rootRef])

  useLayoutEffect(() => {
    measure()
    const scroll = scrollRef.current
    if (scroll) {
      const onScroll = (): void => measure()
      scroll.addEventListener('scroll', onScroll, { passive: true })
      return () => scroll.removeEventListener('scroll', onScroll)
    }
    return undefined
  }, [scrollRef, measure])

  useEffect(() => {
    const root = rootRef.current
    const host = hostRef.current
    if (!root || !host) return undefined
    const ro = new ResizeObserver(() => measure())
    ro.observe(root)
    ro.observe(host)
    return () => ro.disconnect()
  }, [hostRef, rootRef, measure])

  // 同步 snap 设置（guides/grid/enable）给 presentation editor runtime
  useEffect(() => {
    void previewIframeRef.current?.setEditSnapSettings({
      enabled: editorSnapEnabled,
      guides: { vertical: guides.vertical, horizontal: guides.horizontal },
      grid: { enabled: editorGridVisible, size: editorGridSize }
    })
  }, [
    previewIframeRef,
    editorSnapEnabled,
    editorGridVisible,
    editorGridSize,
    guides.vertical,
    guides.horizontal,
    reloadSignal,
    selectedPageId
  ])

  const dragRef = useRef<{ axis: Axis; index: number } | null>(null)

  const startGuideDrag = (axis: Axis, index: number) => (event: ReactPointerEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { axis, index }
    const onMove = (e: PointerEvent): void => {
      const cur = dragRef.current
      const mm = m
      if (!cur || !mm) return
      const pos =
        cur.axis === 'vertical'
          ? (e.clientX - (mm.left + (rootRef.current?.getBoundingClientRect().left ?? 0))) / scale
          : (e.clientY - (mm.top + (rootRef.current?.getBoundingClientRect().top ?? 0))) / scale
      if (Number.isFinite(pos) && pos >= 0) {
        moveEditorGuide(selectedPageId, cur.axis, cur.index, Math.round(pos * 10) / 10)
      }
    }
    const onUp = (): void => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const addGuideFromRuler = (axis: Axis) => (event: React.MouseEvent): void => {
    if (!m) return
    const root = rootRef.current
    if (!root) return
    const rr = root.getBoundingClientRect()
    const pos =
      axis === 'vertical'
        ? (event.clientX - rr.left - m.left) / scale
        : (event.clientY - rr.top - m.top) / scale
    if (!Number.isFinite(pos) || pos < 0) return
    addEditorGuide(selectedPageId, axis, Math.round(pos * 10) / 10)
  }

  if (!m) return null

  const canvasW = designWidth * scale
  const cx = m.left
  const cy = m.top
  const hTicks = Array.from({ length: Math.floor(designWidth / TICK_STEP) + 1 }, (_, i) => i * TICK_STEP)
  const vTicks = Array.from(
    { length: Math.floor(contentHeight / TICK_STEP) + 1 },
    (_, i) => i * TICK_STEP
  )

  const guideLineClass =
    'pointer-events-auto absolute bg-[#ff5a5f]/80 shadow-[0_0_0_0.5px_rgba(255,90,95,0.4)]'

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* 顶部标尺（固定在顶部 margin，始终可见） */}
      <div
        className="pointer-events-auto absolute top-0 overflow-hidden border-b border-[#c9c0ad]/70 bg-[#eee8dc]/96 text-[8px] text-[#746d60]"
        style={{ left: cx, width: canvasW, height: RULER_SIZE, cursor: 'crosshair' }}
        onMouseDown={addGuideFromRuler('vertical')}
      >
        {hTicks.map((value) => {
          const major = value % MAJOR_STEP === 0
          return (
            <span
              key={value}
              className="pointer-events-none absolute bottom-0 border-l border-[#8f8778]/70"
              style={{ left: value * scale, height: major ? 10 : 5 }}
            >
              {major && value > 0 && (
                <span className="absolute -left-2.5 -top-2.5 w-8 text-center">{value}</span>
              )}
            </span>
          )
        })}
      </div>

      {/* 左侧标尺（固定在左侧 margin，刻度随滚动） */}
      <div
        className="pointer-events-auto absolute left-0 top-0 overflow-hidden border-r border-[#c9c0ad]/70 bg-[#eee8dc]/96 text-[8px] text-[#746d60]"
        style={{ width: RULER_SIZE, height: m.rootH, cursor: 'crosshair' }}
        onMouseDown={addGuideFromRuler('horizontal')}
      >
        {vTicks.map((value) => {
          const major = value % MAJOR_STEP === 0
          const top = cy + value * scale
          if (top < -20 || top > m.rootH + 20) return null
          return (
            <span
              key={value}
              className="pointer-events-none absolute right-0 border-t border-[#8f8778]/70"
              style={{ top, width: major ? 10 : 5, height: 0 }}
            >
              {major && value > 0 && (
                <span className="absolute -left-1 -top-2 w-8 text-center">{value}</span>
              )}
            </span>
          )
        })}
      </div>

      {/* 左上角块 */}
      <div
        className="absolute left-0 top-0 border-b border-r border-[#c9c0ad]/70 bg-[#eee8dc]/96"
        style={{ width: RULER_SIZE, height: RULER_SIZE }}
      />

      {/* 网格（随内容滚动） */}
      {editorGridVisible && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: cx,
            top: cy,
            width: canvasW,
            height: contentHeight * scale,
            backgroundImage:
              'linear-gradient(to right, rgba(77,174,255,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(77,174,255,0.16) 1px, transparent 1px)',
            backgroundSize: `${editorGridSize * scale}px ${editorGridSize * scale}px`
          }}
        />
      )}

      {/* 垂直辅助线 */}
      {guides.vertical.map((g, index) => (
        <div
          key={`v-${index}`}
          className={guideLineClass}
          style={{ left: cx + g * scale, top: 0, width: 1, height: m.rootH, cursor: 'ew-resize' }}
          onPointerDown={startGuideDrag('vertical', index)}
          onDoubleClick={() => removeEditorGuide(selectedPageId, 'vertical', index)}
        />
      ))}
      {/* 水平辅助线 */}
      {guides.horizontal.map((g, index) => (
        <div
          key={`h-${index}`}
          className={guideLineClass}
          style={{ top: cy + g * scale, left: 0, width: m.rootW, height: 1, cursor: 'ns-resize' }}
          onPointerDown={startGuideDrag('horizontal', index)}
          onDoubleClick={() => removeEditorGuide(selectedPageId, 'horizontal', index)}
        />
      ))}
    </div>
  )
}
