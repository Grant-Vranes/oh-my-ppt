import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Grid3X3, Magnet, Trash2 } from 'lucide-react'
import { useSessionDetailUiStore } from '@renderer/store'
import { useT } from '@renderer/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/Tooltip'
import type { PreviewIframeHandle } from '../../preview/PreviewIframe'
import type { SlideSizePreset } from '@shared/slide-size'

type GuideAxis = 'vertical' | 'horizontal'

interface CanvasMetrics {
  left: number
  top: number
  width: number
  height: number
  scale: number
}

interface GuideDragState {
  pageId: string
  axis: GuideAxis
  index: number
  position: number
  pointerOffset: number
  removeOnDrop: boolean
}

interface EditorGuidesOverlayProps {
  selectedPageId: string
  frameRef: RefObject<HTMLDivElement | null>
  canvasHostRef: RefObject<HTMLDivElement | null>
  previewIframeRef: RefObject<PreviewIframeHandle | null>
  reloadSignal: number
  slideSize: SlideSizePreset
}

export const RULER_SIZE = 22
export const RULER_GAP = 6
export const EDITOR_INSET = RULER_SIZE + RULER_GAP + 8
const EMPTY_GUIDES = { vertical: [], horizontal: [] }

const createTicks = (size: number, step = 20): number[] =>
  Array.from({ length: Math.floor(size / step) + 1 }, (_, index) => index * step)

export function EditorGuidesOverlay({
  selectedPageId,
  frameRef,
  canvasHostRef,
  previewIframeRef,
  reloadSignal,
  slideSize
}: EditorGuidesOverlayProps): React.JSX.Element | null {
  const pageWidth = slideSize.width
  const pageHeight = slideSize.height
  const horizontalTicks = useMemo(() => createTicks(pageWidth), [pageWidth])
  const verticalTicks = useMemo(() => createTicks(pageHeight), [pageHeight])
  const t = useT()
  const guideSnapPointsRef = useRef<{ x: number[]; y: number[] }>({ x: [], y: [] })
  const snapSyncTimerRef = useRef<number | null>(null)
  const snapSyncVersionRef = useRef(0)
  const editorSnapEnabled = useSessionDetailUiStore((state) => state.editorSnapEnabled)
  const editorGridVisible = useSessionDetailUiStore((state) => state.editorGridVisible)
  const editorGridSize = useSessionDetailUiStore((state) => state.editorGridSize)
  const editorGuides = useSessionDetailUiStore(
    (state) => state.editorGuidesByPage[selectedPageId] || EMPTY_GUIDES
  )
  const setEditorSnapEnabled = useSessionDetailUiStore((state) => state.setEditorSnapEnabled)
  const setEditorGridVisible = useSessionDetailUiStore((state) => state.setEditorGridVisible)
  const addEditorGuide = useSessionDetailUiStore((state) => state.addEditorGuide)
  const moveEditorGuide = useSessionDetailUiStore((state) => state.moveEditorGuide)
  const removeEditorGuide = useSessionDetailUiStore((state) => state.removeEditorGuide)
  const [canvasMetrics, setCanvasMetrics] = useState<CanvasMetrics | null>(null)
  const [guideDrag, setGuideDrag] = useState<GuideDragState | null>(null)
  const hasEditorGuides = editorGuides.vertical.length > 0 || editorGuides.horizontal.length > 0

  const editSnapSettings = useMemo(
    () => ({
      enabled: editorSnapEnabled,
      guides: editorGuides,
      grid: { enabled: editorGridVisible, size: editorGridSize }
    }),
    [editorGridSize, editorGridVisible, editorGuides, editorSnapEnabled]
  )

  const syncEditSnapSettings = useCallback(
    (settings: typeof editSnapSettings): void => {
      const syncVersion = snapSyncVersionRef.current + 1
      snapSyncVersionRef.current = syncVersion
      if (snapSyncTimerRef.current !== null) {
        window.clearTimeout(snapSyncTimerRef.current)
        snapSyncTimerRef.current = null
      }
      let attempts = 0
      const trySync = (): void => {
        if (snapSyncVersionRef.current !== syncVersion) return
        attempts += 1
        const handle = previewIframeRef.current
        if (!handle) {
          if (attempts < 4) snapSyncTimerRef.current = window.setTimeout(trySync, 50)
          return
        }
        void handle.setEditSnapSettings(settings).then((synced) => {
          if (snapSyncVersionRef.current !== syncVersion) return
          if (synced || attempts >= 4) return
          snapSyncTimerRef.current = window.setTimeout(trySync, 50)
        })
      }
      snapSyncTimerRef.current = window.setTimeout(trySync, 0)
    },
    [previewIframeRef]
  )

  useEffect(() => {
    return () => {
      snapSyncVersionRef.current += 1
      if (snapSyncTimerRef.current !== null) {
        window.clearTimeout(snapSyncTimerRef.current)
        snapSyncTimerRef.current = null
      }
    }
  }, [])

  const updateCanvasMetrics = useCallback((): void => {
    const frame = frameRef.current
    const host = canvasHostRef.current
    if (!frame || !host) {
      setCanvasMetrics(null)
      return
    }
    const frameRect = frame.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    const scale = Math.min(hostRect.width / pageWidth, hostRect.height / pageHeight)
    const width = pageWidth * scale
    const height = pageHeight * scale
    setCanvasMetrics({
      left: hostRect.left - frameRect.left + Math.max(0, (hostRect.width - width) / 2),
      top: hostRect.top - frameRect.top + Math.max(0, (hostRect.height - height) / 2),
      width,
      height,
      scale
    })
  }, [canvasHostRef, frameRef, pageHeight, pageWidth])

  useEffect(() => {
    updateCanvasMetrics()
    const frame = frameRef.current
    const host = canvasHostRef.current
    if (!frame || !host) return
    const observer = new ResizeObserver(updateCanvasMetrics)
    observer.observe(frame)
    observer.observe(host)
    return () => observer.disconnect()
  }, [canvasHostRef, frameRef, selectedPageId, updateCanvasMetrics])

  useEffect(() => {
    syncEditSnapSettings(editSnapSettings)
  }, [editSnapSettings, reloadSignal, selectedPageId, syncEditSnapSettings])

  const snapGuidePosition = useCallback(
    (axis: GuideAxis, rawPosition: number): number => {
      if (!canvasMetrics) return rawPosition
      const max = axis === 'vertical' ? pageWidth : pageHeight
      const clamped = Math.max(0, Math.min(max, rawPosition))
      if (!editorSnapEnabled) return clamped
      const candidates =
        axis === 'vertical' ? guideSnapPointsRef.current.x : guideSnapPointsRef.current.y
      const threshold = 7 / Math.max(0.01, canvasMetrics.scale)
      let best = clamped
      let bestDistance = Number.POSITIVE_INFINITY
      for (const candidate of candidates) {
        const distance = Math.abs(candidate - clamped)
        if (distance <= threshold && distance < bestDistance) {
          best = candidate
          bestDistance = distance
        }
      }
      if (editorGridVisible) {
        const gridPosition = Math.round(clamped / editorGridSize) * editorGridSize
        const distance = Math.abs(gridPosition - clamped)
        if (distance <= threshold && distance < bestDistance) best = gridPosition
      }
      return Number(Math.max(0, Math.min(max, best)).toFixed(1))
    },
    [canvasMetrics, editorGridSize, editorGridVisible, editorSnapEnabled, pageHeight, pageWidth]
  )

  const rawPositionFromPointer = useCallback(
    (axis: GuideAxis, clientX: number, clientY: number): number => {
      const frame = frameRef.current
      if (!frame || !canvasMetrics) return 0
      const frameRect = frame.getBoundingClientRect()
      const pixelPosition =
        axis === 'vertical'
          ? clientX - frameRect.left - canvasMetrics.left
          : clientY - frameRect.top - canvasMetrics.top
      return pixelPosition / canvasMetrics.scale
    },
    [canvasMetrics, frameRef]
  )

  const positionFromPointer = useCallback(
    (axis: GuideAxis, clientX: number, clientY: number): number =>
      snapGuidePosition(axis, rawPositionFromPointer(axis, clientX, clientY)),
    [rawPositionFromPointer, snapGuidePosition]
  )

  const isGuideOutsideCanvas = useCallback((axis: GuideAxis, position: number): boolean => {
    const max = axis === 'vertical' ? pageWidth : pageHeight
    return position < 0 || position > max
  }, [pageHeight, pageWidth])

  const guideDragRef = useRef<GuideDragState | null>(null)
  const guideDragActive = guideDrag !== null

  useEffect(() => {
    guideDragRef.current = guideDrag
  }, [guideDrag])

  useEffect(() => {
    guideDragRef.current = null
    setGuideDrag(null)
  }, [selectedPageId])

  const startGuideDrag = useCallback(
    (axis: GuideAxis, index: number, event: React.PointerEvent): void => {
      if (!canvasMetrics) return
      event.preventDefault()
      event.stopPropagation()
      guideSnapPointsRef.current = { x: [], y: [] }
      void previewIframeRef.current?.readEditSnapPoints().then((points) => {
        guideSnapPointsRef.current = points
      })
      const position =
        editorGuides[axis][index] ?? positionFromPointer(axis, event.clientX, event.clientY)
      const nextDrag = {
        pageId: selectedPageId,
        axis,
        index,
        position,
        pointerOffset: rawPositionFromPointer(axis, event.clientX, event.clientY) - position,
        removeOnDrop: false
      }
      guideDragRef.current = nextDrag
      setGuideDrag(nextDrag)
    },
    [
      canvasMetrics,
      editorGuides,
      positionFromPointer,
      previewIframeRef,
      rawPositionFromPointer,
      selectedPageId
    ]
  )

  const addGuideFromRuler = useCallback(
    (axis: GuideAxis, event: React.MouseEvent): void => {
      if (!canvasMetrics) return
      event.preventDefault()
      event.stopPropagation()
      const rawPosition = rawPositionFromPointer(axis, event.clientX, event.clientY)
      if (isGuideOutsideCanvas(axis, rawPosition)) return
      addEditorGuide(selectedPageId, axis, snapGuidePosition(axis, rawPosition))
    },
    [
      addEditorGuide,
      canvasMetrics,
      isGuideOutsideCanvas,
      rawPositionFromPointer,
      selectedPageId,
      snapGuidePosition
    ]
  )

  const clearCurrentPageGuides = useCallback((): void => {
    if (!hasEditorGuides) return
    for (let index = editorGuides.vertical.length - 1; index >= 0; index -= 1) {
      removeEditorGuide(selectedPageId, 'vertical', index)
    }
    for (let index = editorGuides.horizontal.length - 1; index >= 0; index -= 1) {
      removeEditorGuide(selectedPageId, 'horizontal', index)
    }
  }, [
    editorGuides.horizontal,
    editorGuides.vertical,
    hasEditorGuides,
    removeEditorGuide,
    selectedPageId
  ])

  useEffect(() => {
    if (!guideDragRef.current) return
    const onPointerMove = (event: PointerEvent): void => {
      const current = guideDragRef.current
      if (!current) return
      const rawPosition =
        rawPositionFromPointer(current.axis, event.clientX, event.clientY) - current.pointerOffset
      const removeOnDrop = isGuideOutsideCanvas(current.axis, rawPosition)
      const nextDrag = {
        ...current,
        position: removeOnDrop
          ? Number(rawPosition.toFixed(1))
          : snapGuidePosition(current.axis, rawPosition),
        removeOnDrop
      }
      guideDragRef.current = nextDrag
      setGuideDrag(nextDrag)
    }
    const onPointerUp = (): void => {
      const current = guideDragRef.current
      if (!current) return
      const axis = current.axis
      if (current.removeOnDrop) {
        removeEditorGuide(current.pageId, axis, current.index)
      } else {
        moveEditorGuide(current.pageId, axis, current.index, current.position)
      }
      guideDragRef.current = null
      setGuideDrag(null)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    window.addEventListener('pointercancel', onPointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [
    guideDragActive,
    isGuideOutsideCanvas,
    moveEditorGuide,
    rawPositionFromPointer,
    removeEditorGuide,
    selectedPageId,
    snapGuidePosition
  ])

  if (!canvasMetrics) return null

  return (
    <>
      {editorGridVisible && (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            left: canvasMetrics.left,
            top: canvasMetrics.top,
            width: canvasMetrics.width,
            height: canvasMetrics.height,
            backgroundImage:
              'linear-gradient(to right, rgba(77,174,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(77,174,255,0.18) 1px, transparent 1px)',
            backgroundSize: `${editorGridSize * canvasMetrics.scale}px ${editorGridSize * canvasMetrics.scale}px`
          }}
        />
      )}

      <div
        className="absolute z-30 overflow-hidden border border-[#c9c0ae]/75 bg-[#eee8dc]/96 text-[8px] text-[#746d60] shadow-sm"
        style={{
          left: canvasMetrics.left,
          top: canvasMetrics.top - RULER_GAP - RULER_SIZE,
          width: canvasMetrics.width,
          height: RULER_SIZE,
          cursor: 'crosshair'
        }}
        onClick={(event) => addGuideFromRuler('vertical', event)}
        title={t('sessionDetail.editorRulerHint')}
      >
        {horizontalTicks.map((value) => {
          const major = value % 100 === 0
          return (
            <span
              key={value}
              className="pointer-events-none absolute bottom-0 border-l border-[#8f8778]/70"
              style={{
                left: value * canvasMetrics.scale,
                height: major ? 10 : 5
              }}
            >
              {major && value > 0 && (
                <span className="absolute -left-2.5 -top-2.5 w-8 text-center">{value}</span>
              )}
            </span>
          )
        })}
      </div>

      <div
        className="absolute z-30 overflow-hidden border border-[#c9c0ae]/75 bg-[#eee8dc]/96 text-[8px] text-[#746d60] shadow-sm"
        style={{
          left: canvasMetrics.left - RULER_GAP - RULER_SIZE,
          top: canvasMetrics.top,
          width: RULER_SIZE,
          height: canvasMetrics.height,
          cursor: 'crosshair'
        }}
        onClick={(event) => addGuideFromRuler('horizontal', event)}
        title={t('sessionDetail.editorRulerHint')}
      >
        {verticalTicks.map((value) => {
          const major = value % 100 === 0
          return (
            <span
              key={value}
              className="pointer-events-none absolute right-0 border-t border-[#8f8778]/70"
              style={{
                top: value * canvasMetrics.scale,
                width: major ? 10 : 5
              }}
            >
              {major && value > 0 && (
                <span className="absolute -left-4 -top-2.5 w-7 -rotate-90 text-center">
                  {value}
                </span>
              )}
            </span>
          )
        })}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="absolute z-40"
            style={{
              left: canvasMetrics.left - RULER_GAP - RULER_SIZE,
              top: canvasMetrics.top - RULER_GAP - RULER_SIZE,
              width: RULER_SIZE,
              height: RULER_SIZE
            }}
          >
            <button
              type="button"
              aria-label={t('sessionDetail.editorClearGuides')}
              aria-disabled={!hasEditorGuides}
              className={`flex h-full w-full items-center justify-center rounded-tl-md border border-[#c9c0ae]/75 transition-colors ${
                hasEditorGuides
                  ? 'bg-[#e4ddcf] text-[#746d60] hover:bg-[#d9cfbd]'
                  : 'cursor-not-allowed bg-[#e4ddcf]/70 text-[#a59b8c]'
              }`}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!hasEditorGuides) return
                clearCurrentPageGuides()
              }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          {t('sessionDetail.editorClearGuides')}
        </TooltipContent>
      </Tooltip>

      {editorGuides.vertical.map((position, index) =>
        guideDrag?.axis === 'vertical' && guideDrag.index === index ? null : (
          <button
            key={`vertical-${index}`}
            type="button"
            className="absolute z-40 w-[7px] -translate-x-1/2 cursor-col-resize border-0 bg-transparent p-0 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-[#ff4d8d] before:shadow-[0_0_0_1px_rgba(255,77,141,0.12)]"
            style={{
              left: canvasMetrics.left + position * canvasMetrics.scale,
              top: canvasMetrics.top - RULER_GAP - RULER_SIZE,
              height: canvasMetrics.height + RULER_GAP + RULER_SIZE
            }}
            onPointerDown={(event) => startGuideDrag('vertical', index, event)}
            title={`${Math.round(position)} px · ${t('sessionDetail.editorGuideRemoveHint')}`}
          />
        )
      )}
      {editorGuides.horizontal.map((position, index) =>
        guideDrag?.axis === 'horizontal' && guideDrag.index === index ? null : (
          <button
            key={`horizontal-${index}`}
            type="button"
            className="absolute z-40 h-[7px] -translate-y-1/2 cursor-row-resize border-0 bg-transparent p-0 before:absolute before:left-0 before:top-1/2 before:h-px before:w-full before:-translate-y-1/2 before:bg-[#ff4d8d] before:shadow-[0_0_0_1px_rgba(255,77,141,0.12)]"
            style={{
              left: canvasMetrics.left - RULER_GAP - RULER_SIZE,
              top: canvasMetrics.top + position * canvasMetrics.scale,
              width: canvasMetrics.width + RULER_GAP + RULER_SIZE
            }}
            onPointerDown={(event) => startGuideDrag('horizontal', index, event)}
            title={`${Math.round(position)} px · ${t('sessionDetail.editorGuideRemoveHint')}`}
          />
        )
      )}

      {guideDrag?.axis === 'vertical' && (
        <div
          className={`pointer-events-none absolute z-50 w-px shadow-[0_0_0_1px_rgba(255,77,141,0.16)] ${
            guideDrag.removeOnDrop
              ? 'border-l border-dashed border-[#d75151] bg-transparent opacity-55'
              : 'bg-[#ff4d8d]'
          }`}
          style={{
            left: canvasMetrics.left + guideDrag.position * canvasMetrics.scale,
            top: canvasMetrics.top - RULER_GAP - RULER_SIZE,
            height: canvasMetrics.height + RULER_GAP + RULER_SIZE
          }}
        />
      )}
      {guideDrag?.axis === 'horizontal' && (
        <div
          className={`pointer-events-none absolute z-50 h-px shadow-[0_0_0_1px_rgba(255,77,141,0.16)] ${
            guideDrag.removeOnDrop
              ? 'border-t border-dashed border-[#d75151] bg-transparent opacity-55'
              : 'bg-[#ff4d8d]'
          }`}
          style={{
            left: canvasMetrics.left - RULER_GAP - RULER_SIZE,
            top: canvasMetrics.top + guideDrag.position * canvasMetrics.scale,
            width: canvasMetrics.width + RULER_GAP + RULER_SIZE
          }}
        />
      )}

      <div className="absolute right-2 top-1 z-50 flex items-center gap-0.5 rounded-md border border-[#cfc5b4]/80 bg-[#fffaf1]/94 p-0.5 shadow-[0_5px_14px_rgba(88,72,54,0.12)] backdrop-blur-sm">
        <button
          type="button"
          aria-pressed={editorSnapEnabled}
          aria-label={t('sessionDetail.editorSnap')}
          title={t('sessionDetail.editorSnap')}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            editorSnapEnabled ? 'bg-[#dce8cf] text-[#4f613f]' : 'text-[#8b8376] hover:bg-[#eee7da]'
          }`}
          onClick={() => setEditorSnapEnabled(!editorSnapEnabled)}
        >
          <Magnet className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-pressed={editorGridVisible}
          aria-label={t('sessionDetail.editorGrid')}
          title={t('sessionDetail.editorGrid')}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            editorGridVisible ? 'bg-[#dce8cf] text-[#4f613f]' : 'text-[#8b8376] hover:bg-[#eee7da]'
          }`}
          onClick={() => setEditorGridVisible(!editorGridVisible)}
        >
          <Grid3X3 className="h-3 w-3" />
        </button>
      </div>
    </>
  )
}
