import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen, ImageIcon, Trash2, Upload } from 'lucide-react'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import { useMasterWorkbenchStore, useSessionStore, useToastStore } from '@renderer/store'
import { localAssetUrl } from '@shared/local-asset'
import { trySessionSlideSize } from '@shared/slide-size'
import {
  normalizeMasterElementsConfig,
  type MasterElementPosition,
  type MasterElementSize,
  type MasterElementsConfig
} from '@shared/master'
import { AssetPickerDialog } from '../session-detail/modal/AssetPickerDialog'
import { Button } from '../ui/Button'
import { Checkbox } from '../ui/Checkbox'
import { Input } from '../ui/Input'
import { ColorPicker } from '../ui/ColorPicker'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip'

type ElementKey = 'logo' | 'footer' | 'pageNumber' | 'watermark'
type ResizeHandle = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se'

type PointerState = {
  key: ElementKey
  mode: 'move' | 'resize'
  handle?: ResizeHandle
  startClientX: number
  startClientY: number
  startPosition: MasterElementPosition
  startSize: MasterElementSize
}

const positionKeyByElement: Record<
  ElementKey,
  'logoPosition' | 'footerPosition' | 'pageNumberPosition' | 'watermarkPosition'
> = {
  logo: 'logoPosition',
  footer: 'footerPosition',
  pageNumber: 'pageNumberPosition',
  watermark: 'watermarkPosition'
}

const sizeKeyByElement: Record<
  ElementKey,
  'logoSize' | 'footerSize' | 'pageNumberSize' | 'watermarkSize'
> = {
  logo: 'logoSize',
  footer: 'footerSize',
  pageNumber: 'pageNumberSize',
  watermark: 'watermarkSize'
}

const minSizeByElement: Record<ElementKey, MasterElementSize> = {
  logo: { width: 4, height: 3 },
  footer: { width: 12, height: 2 },
  pageNumber: { width: 3, height: 2 },
  watermark: { width: 4, height: 4 }
}

const handleClasses: Record<ResizeHandle, string> = {
  n: '-top-1 left-1/2 -translate-x-1/2 cursor-ns-resize',
  s: '-bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize',
  nw: '-left-1 -top-1 cursor-nwse-resize',
  ne: '-right-1 -top-1 cursor-nesw-resize',
  sw: '-bottom-1 -left-1 cursor-nesw-resize',
  se: '-bottom-1 -right-1 cursor-nwse-resize',
  w: '-left-1 top-1/2 -translate-y-1/2 cursor-ew-resize',
  e: '-right-1 top-1/2 -translate-y-1/2 cursor-ew-resize'
}

const clamp = (value: number, min: number, max: number): number =>
  Math.round(Math.min(max, Math.max(min, value)) * 100) / 100

const MAX_CANVAS_WIDTH = 540
const MAX_CANVAS_HEIGHT = 300
const DEFAULT_LOGO_BOUNDS: MasterElementSize = { width: 16, height: 10 }

const fitLogoSizeToCanvas = (
  imageWidth: number,
  imageHeight: number,
  slideAspectRatio: number
): MasterElementSize => {
  const imageAspectRatio = imageWidth / imageHeight
  if (!Number.isFinite(imageAspectRatio) || imageAspectRatio <= 0 || slideAspectRatio <= 0) {
    return { ...DEFAULT_LOGO_BOUNDS }
  }
  const canvasAspectRatio = imageAspectRatio / slideAspectRatio
  const width = Math.min(DEFAULT_LOGO_BOUNDS.width, DEFAULT_LOGO_BOUNDS.height * canvasAspectRatio)
  const height = Math.min(DEFAULT_LOGO_BOUNDS.height, DEFAULT_LOGO_BOUNDS.width / canvasAspectRatio)
  return {
    width: clamp(width, 1, 100),
    height: clamp(height, 1, 100)
  }
}

const readImageSize = (source: string): Promise<{ width: number; height: number } | null> =>
  new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = source
  })

const resizeElement = (
  position: MasterElementPosition,
  size: MasterElementSize,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  minSize: MasterElementSize
): { position: MasterElementPosition; size: MasterElementSize } => {
  const right = position.x + size.width
  const bottom = position.y + size.height
  const resizeFromWest = handle === 'w' || handle === 'nw' || handle === 'sw'
  const resizeFromNorth = handle === 'n' || handle === 'nw' || handle === 'ne'
  const resizeHorizontally = resizeFromWest || handle === 'e' || handle === 'ne' || handle === 'se'
  const resizeVertically = resizeFromNorth || handle === 's' || handle === 'sw' || handle === 'se'
  const left = resizeFromWest
    ? clamp(position.x + deltaX, 0, right - minSize.width)
    : position.x
  const nextRight = resizeHorizontally && !resizeFromWest
    ? clamp(right + deltaX, position.x + minSize.width, 100)
    : right
  const top = resizeFromNorth
    ? clamp(position.y + deltaY, 0, bottom - minSize.height)
    : position.y
  const nextBottom = resizeVertically && !resizeFromNorth
    ? clamp(bottom + deltaY, position.y + minSize.height, 100)
    : bottom

  return {
    position: { x: left, y: top },
    size: {
      width: clamp(nextRight - left, minSize.width, 100),
      height: clamp(nextBottom - top, minSize.height, 100)
    }
  }
}

export function MasterElementsEditor(): React.JSX.Element {
  const t = useT()
  const config = useMasterWorkbenchStore((state) => state.config)
  const updateConfig = useMasterWorkbenchStore((state) => state.updateConfig)
  const currentSession = useSessionStore((state) => state.currentSession)
  const sessionId = currentSession?.id || ''
  const toastError = useToastStore((state) => state.error)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [pointerState, setPointerState] = useState<PointerState | null>(null)
  const [selectedElement, setSelectedElement] = useState<ElementKey | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const watermarkTextRef = useRef<HTMLSpanElement>(null)
  const elements = normalizeMasterElementsConfig(config.elements)
  const slideSize = trySessionSlideSize(currentSession)
  const aspectRatio = slideSize ? `${slideSize.width} / ${slideSize.height}` : '16 / 9'
  const canvasWidth = slideSize
    ? Math.min(MAX_CANVAS_WIDTH, Math.round((slideSize.width / slideSize.height) * MAX_CANVAS_HEIGHT))
    : MAX_CANVAS_WIDTH
  const canvasHeight = slideSize
    ? Math.round(canvasWidth * (slideSize.height / slideSize.width))
    : Math.round(canvasWidth * (9 / 16))
  const slideAspectRatio = slideSize ? slideSize.width / slideSize.height : 16 / 9
  const visibleElements = {
    logo: elements.showLogo && Boolean(elements.logoImage),
    footer: elements.showFooter && Boolean(elements.footerText),
    pageNumber: elements.showPageNumber,
    watermark: elements.showWatermark && Boolean(elements.watermarkText)
  }

  const updateElements = (patch: Partial<MasterElementsConfig>): void =>
    updateConfig({ elements: { ...elements, ...patch } })

  useEffect(() => {
    if (!sessionId || !elements.logoImage) {
      setLogoPreviewUrl(null)
      return
    }
    let cancelled = false
    void ipc
      .listAssets(sessionId, 'image')
      .then(({ assets }) => {
        const image = assets.find((asset) => asset.relativePath === elements.logoImage)
        if (!cancelled) setLogoPreviewUrl(image ? localAssetUrl(image.absolutePath) : null)
      })
      .catch(() => {
        if (!cancelled) setLogoPreviewUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [elements.logoImage, sessionId])

  useEffect(() => {
    if (selectedElement && !visibleElements[selectedElement]) setSelectedElement(null)
  }, [selectedElement, visibleElements.footer, visibleElements.logo, visibleElements.pageNumber, visibleElements.watermark])

  useEffect(() => {
    if (!pointerState) return
    const updateElement = (event: PointerEvent): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const deltaX = ((event.clientX - pointerState.startClientX) / rect.width) * 100
      const deltaY = ((event.clientY - pointerState.startClientY) / rect.height) * 100
      if (pointerState.mode === 'move') {
        const position = {
          x: clamp(
            pointerState.startPosition.x + deltaX,
            0,
            100 - pointerState.startSize.width
          ),
          y: clamp(
            pointerState.startPosition.y + deltaY,
            0,
            100 - pointerState.startSize.height
          )
        }
        updateElements({ [positionKeyByElement[pointerState.key]]: position })
        return
      }
      const resized = resizeElement(
        pointerState.startPosition,
        pointerState.startSize,
        pointerState.handle as ResizeHandle,
        deltaX,
        deltaY,
        minSizeByElement[pointerState.key]
      )
      updateElements({
        [positionKeyByElement[pointerState.key]]: resized.position,
        [sizeKeyByElement[pointerState.key]]: resized.size,
        ...(pointerState.key === 'watermark' ? { watermarkSizeAuto: false } : {})
      })
    }
    const stopInteraction = (): void => setPointerState(null)
    window.addEventListener('pointermove', updateElement)
    window.addEventListener('pointerup', stopInteraction)
    window.addEventListener('pointercancel', stopInteraction)
    return () => {
      window.removeEventListener('pointermove', updateElement)
      window.removeEventListener('pointerup', stopInteraction)
      window.removeEventListener('pointercancel', stopInteraction)
    }
  }, [elements, pointerState, updateConfig])

  useEffect(() => {
    if (!elements.watermarkSizeAuto || !visibleElements.watermark) return
    const canvas = canvasRef.current
    const text = watermarkTextRef.current
    if (!canvas || !text) return
    const canvasWidth = canvas.getBoundingClientRect().width
    if (canvasWidth <= 0) return
    const width = clamp(
      ((text.getBoundingClientRect().width + 16) / canvasWidth) * 100,
      minSizeByElement.watermark.width,
      100
    )
    if (Math.abs(width - elements.watermarkSize.width) < 0.1) return
    updateElements({ watermarkSize: { ...elements.watermarkSize, width } })
  }, [
    elements.watermarkSize,
    elements.watermarkSizeAuto,
    elements.watermarkText,
    updateConfig,
    visibleElements.watermark
  ])

  const selectLogo = async (relativePath: string, absolutePath?: string): Promise<void> => {
    let source = absolutePath ? localAssetUrl(absolutePath) : null
    if (!source && sessionId) {
      try {
        const { assets } = await ipc.listAssets(sessionId, 'image')
        const image = assets.find((asset) => asset.relativePath === relativePath)
        source = image ? localAssetUrl(image.absolutePath) : null
      } catch {
        source = null
      }
    }
    const naturalSize = source ? await readImageSize(source) : null
    updateElements({
      logoImage: relativePath,
      showLogo: true,
      logoSize: naturalSize
        ? fitLogoSizeToCanvas(naturalSize.width, naturalSize.height, slideAspectRatio)
        : { ...DEFAULT_LOGO_BOUNDS }
    })
    if (source) setLogoPreviewUrl(source)
  }

  const uploadLogo = async (): Promise<void> => {
    if (!sessionId || uploading) return
    setUploading(true)
    try {
      const result = await ipc.chooseAndUploadAssets(sessionId, 'image')
      const image = result.assets[0]
      if (!result.cancelled && image) {
        await selectLogo(image.relativePath, image.absolutePath)
      }
    } catch (error) {
      toastError(error instanceof Error ? error.message : t('sessionDetail.masterLogoUploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const elementStyles = useMemo(
    () => ({
      logo: {
        left: `${elements.logoPosition.x}%`,
        top: `${elements.logoPosition.y}%`,
        width: `${elements.logoSize.width}%`,
        height: `${elements.logoSize.height}%`
      },
      footer: {
        left: `${elements.footerPosition.x}%`,
        top: `${elements.footerPosition.y}%`,
        width: `${elements.footerSize.width}%`,
        height: `${elements.footerSize.height}%`
      },
      pageNumber: {
        left: `${elements.pageNumberPosition.x}%`,
        top: `${elements.pageNumberPosition.y}%`,
        width: `${elements.pageNumberSize.width}%`,
        height: `${elements.pageNumberSize.height}%`
      },
      watermark: {
        left: `${elements.watermarkPosition.x}%`,
        top: `${elements.watermarkPosition.y}%`,
        width: `${elements.watermarkSize.width}%`,
        height: `${elements.watermarkSize.height}%`
      }
    }),
    [elements]
  )

  const previewWatermarkFontSize = (height: number): number =>
    Math.max(8, Math.min(36, canvasHeight * (height / 100) * 0.45))
  const previewTextFontSize = (fontSize: number): number =>
    Math.max(8, Math.min(36, fontSize * (canvasHeight / (slideSize?.height || 720))))
  const textPreviewHeight = (fontSize: number): string =>
    `${clamp((fontSize / (slideSize?.height || 720)) * 150, 2, 100)}%`

  const updateElementNumber = (
    key: 'footerFontSize' | 'pageNumberFontSize' | 'watermarkRotation',
    value: string
  ): void => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return
    const [min, max] = key === 'watermarkRotation' ? [-180, 180] : [8, 160]
    updateElements({ [key]: Math.round(clamp(parsed, min, max)) } as Partial<MasterElementsConfig>)
  }

  const updateWatermarkRotationFromPointer = (
    event: React.PointerEvent<HTMLButtonElement>
  ): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    if (Math.hypot(event.clientX - centerX, event.clientY - centerY) < rect.width * 0.22) return
    const degrees = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI
    const rotation = Math.round(((degrees + 270) % 360 + 360) % 360) - 180
    updateElements({ watermarkRotation: rotation === -180 ? 180 : rotation })
  }

  const beginInteraction = (
    key: ElementKey,
    event: React.PointerEvent<HTMLElement>,
    mode: PointerState['mode'],
    handle?: ResizeHandle
  ): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    setSelectedElement(key)
    setPointerState({
      key,
      mode,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: elements[positionKeyByElement[key]],
      startSize: elements[sizeKeyByElement[key]]
    })
  }

  const renderResizeHandles = (key: ElementKey): React.JSX.Element | null => {
    if (selectedElement !== key || (key !== 'logo' && key !== 'watermark')) return null
    return (
      <>
        <div className="pointer-events-none absolute inset-0 z-20 border border-dashed border-[#71805d]" />
        {Object.keys(handleClasses).map((handle) => (
          <button
            key={handle}
            type="button"
            className={`absolute z-30 h-2 w-2 rounded-full border border-white bg-[#71805d] p-0 shadow-sm ${handleClasses[handle as ResizeHandle]}`}
            aria-label={`Resize ${key}`}
            onPointerDown={(event) =>
              beginInteraction(key, event, 'resize', handle as ResizeHandle)
            }
          />
        ))}
      </>
    )
  }

  return (
    <>
      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 justify-center rounded-md border border-[#e4dac9] bg-[#f7f2e8]/68 p-3">
          <div
            ref={canvasRef}
            className="relative max-w-full select-none overflow-hidden border border-[#cfc3ae] bg-[#ffffff] shadow-[0_12px_28px_rgba(73,61,43,0.12)]"
            style={{ aspectRatio, width: `${canvasWidth}px` }}
            onPointerDown={() => setSelectedElement(null)}
          >
            <div className="pointer-events-none absolute inset-[7%] border border-dashed border-[#e4e4e7]" />
            <div className="pointer-events-none absolute left-[10%] right-[10%] top-[24%] h-px bg-[#eee5d7]" />
            <div className="pointer-events-none absolute left-[10%] right-[10%] top-[58%] h-px bg-[#eee5d7]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(232,242,221,.32),transparent_48%)]" />

            {visibleElements.logo && (
              <div
                className={`absolute z-10 cursor-grab touch-none active:cursor-grabbing ${selectedElement === 'logo' ? 'z-20' : ''}`}
                style={elementStyles.logo}
                onPointerDown={(event) => beginInteraction('logo', event, 'move')}
              >
                <img
                  src={logoPreviewUrl || ''}
                  alt=""
                  className="h-full w-full object-contain object-left-top"
                  draggable={false}
                />
                {renderResizeHandles('logo')}
              </div>
            )}

            {visibleElements.footer && (
              <div
                className={`absolute z-10 cursor-grab touch-none active:cursor-grabbing ${selectedElement === 'footer' ? 'z-20' : ''}`}
                style={{ ...elementStyles.footer, height: textPreviewHeight(elements.footerFontSize) }}
                onPointerDown={(event) => beginInteraction('footer', event, 'move')}
              >
                <div
                  className="flex h-full w-full items-center truncate"
                  style={{
                    color: elements.footerColor,
                    fontSize: `${previewTextFontSize(elements.footerFontSize)}px`
                  }}
                >
                  {elements.footerText}
                </div>
                {renderResizeHandles('footer')}
              </div>
            )}

            {visibleElements.pageNumber && (
              <div
                className={`absolute z-10 cursor-grab touch-none active:cursor-grabbing ${selectedElement === 'pageNumber' ? 'z-20' : ''}`}
                style={{
                  ...elementStyles.pageNumber,
                  height: textPreviewHeight(elements.pageNumberFontSize)
                }}
                onPointerDown={(event) => beginInteraction('pageNumber', event, 'move')}
              >
                <div
                  className="flex h-full w-full items-center justify-end tabular-nums"
                  style={{
                    color: elements.pageNumberColor,
                    fontSize: `${previewTextFontSize(elements.pageNumberFontSize)}px`
                  }}
                >
                  1
                </div>
                {renderResizeHandles('pageNumber')}
              </div>
            )}

            {visibleElements.watermark && (
              <div
                className={`absolute z-10 cursor-grab touch-none active:cursor-grabbing ${selectedElement === 'watermark' ? 'z-20' : ''}`}
                style={elementStyles.watermark}
                onPointerDown={(event) => beginInteraction('watermark', event, 'move')}
              >
                <div
                  className="flex h-full w-full items-center justify-center truncate text-center font-bold text-[#738065]/55"
                  style={{
                    fontSize: `${previewWatermarkFontSize(elements.watermarkSize.height)}px`,
                    transform: `rotate(${elements.watermarkRotation}deg)`
                  }}
                >
                  <span ref={watermarkTextRef} className="inline-block shrink-0 whitespace-nowrap">
                    {elements.watermarkText}
                  </span>
                </div>
                {renderResizeHandles('watermark')}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm text-[#4a563d]">
              <span>{t('sessionDetail.masterElementLogo')}</span>
              <label className="flex items-center gap-2 text-xs text-[#667257]">
                <Checkbox
                  checked={elements.showLogo}
                  disabled={!elements.logoImage}
                  onCheckedChange={(checked) => updateElements({ showLogo: checked === true })}
                />
                {t('sessionDetail.masterElementVisible')}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-12 min-w-0 flex-1 items-center justify-center overflow-hidden rounded border border-[#e4dac9] bg-[#ffffff] p-1.5 text-xs text-[#667257]">
                {logoPreviewUrl ? (
                  <img src={logoPreviewUrl} alt="" className="h-full max-w-full object-contain" />
                ) : (
                  <ImageIcon className="h-4 w-4 shrink-0" />
                )}
              </div>
              {elements.logoImage && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0 text-[#a14f4a]"
                      aria-label={t('sessionDetail.masterLogoClear')}
                      onClick={() => updateElements({ logoImage: null, showLogo: false })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('sessionDetail.masterLogoClear')}</TooltipContent>
                </Tooltip>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                disabled={!sessionId || uploading}
                aria-label={t('sessionDetail.masterLogoChoose')}
                onClick={() => setPickerOpen(true)}
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                disabled={!sessionId || uploading}
                aria-label={t('sessionDetail.masterLogoUpload')}
                onClick={() => void uploadLogo()}
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid gap-1.5 text-sm text-[#4a563d]">
            <div className="flex items-center justify-between gap-3">
              <span>{t('sessionDetail.masterFooter')}</span>
              <label className="flex items-center gap-2 text-xs text-[#667257]">
                <Checkbox
                  checked={elements.showFooter}
                  onCheckedChange={(checked) => updateElements({ showFooter: checked === true })}
                />
                {t('sessionDetail.masterElementVisible')}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={elements.footerText}
                maxLength={180}
                className="h-8 min-w-0 flex-1"
                onChange={(event) => updateElements({ footerText: event.target.value })}
              />
              <Input
                key={`footer-font-size-${elements.footerFontSize}`}
                type="number"
                min={8}
                max={160}
                step={1}
                defaultValue={elements.footerFontSize}
                className="h-8 w-14 shrink-0 px-1.5 text-center"
                title={t('sessionDetail.masterElementFontSize')}
                aria-label={t('sessionDetail.masterElementFontSize')}
                onBlur={(event) => updateElementNumber('footerFontSize', event.target.value)}
              />
              <ColorPicker
                value={elements.footerColor}
                allowAlpha={false}
                ariaLabel={t('sessionDetail.masterElementColor')}
                onChange={(footerColor) => updateElements({ footerColor })}
              />
            </div>
          </div>

          <div className="grid gap-1.5 text-sm text-[#4a563d]">
            <div className="flex items-center justify-between gap-3">
              <span>{t('sessionDetail.masterWatermark')}</span>
              <label className="flex items-center gap-2 text-xs text-[#667257]">
                <Checkbox
                  checked={elements.showWatermark}
                  onCheckedChange={(checked) => updateElements({ showWatermark: checked === true })}
                />
                {t('sessionDetail.masterElementVisible')}
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Input
                value={elements.watermarkText}
                maxLength={80}
                className="h-8 min-w-0 flex-1"
                onChange={(event) => updateElements({ watermarkText: event.target.value })}
              />
              <button
                type="button"
                className="relative h-20 w-20 shrink-0 touch-none border-[9px] border-[#dce0da] bg-[#fbfaf7] shadow-[inset_0_1px_2px_rgba(70,80,60,0.08)]"
                style={{ borderRadius: '50%' }}
                aria-label={t('sessionDetail.masterWatermarkRotation')}
                title={`${t('sessionDetail.masterWatermarkRotation')}: ${elements.watermarkRotation}°`}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  updateWatermarkRotationFromPointer(event)
                }}
                onPointerMove={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    updateWatermarkRotationFromPointer(event)
                  }
                }}
                onPointerUp={(event) => {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  }
                }}
              >
                <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-[#7c8779]">
                  {elements.watermarkRotation}°
                </span>
                <span
                  className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#4f5d43] shadow-[0_1px_4px_rgba(48,57,42,0.28)]"
                  style={{
                    left: `${50 + Math.sin((elements.watermarkRotation * Math.PI) / 180) * 40}%`,
                    top: `${50 - Math.cos((elements.watermarkRotation * Math.PI) / 180) * 40}%`
                  }}
                />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#e6ddcf] pt-4 text-sm text-[#4a563d]">
            <span>{t('sessionDetail.masterShowPageNumber')}</span>
            <div className="flex items-center gap-2">
              <Input
                key={`page-number-font-size-${elements.pageNumberFontSize}`}
                type="number"
                min={8}
                max={160}
                step={1}
                defaultValue={elements.pageNumberFontSize}
                className="h-8 w-14 px-1.5 text-center"
                title={t('sessionDetail.masterElementFontSize')}
                aria-label={t('sessionDetail.masterElementFontSize')}
                onBlur={(event) => updateElementNumber('pageNumberFontSize', event.target.value)}
              />
              <ColorPicker
                value={elements.pageNumberColor}
                allowAlpha={false}
                ariaLabel={t('sessionDetail.masterElementColor')}
                onChange={(pageNumberColor) => updateElements({ pageNumberColor })}
              />
              <Checkbox
                checked={elements.showPageNumber}
                onCheckedChange={(checked) => updateElements({ showPageNumber: checked === true })}
              />
            </div>
          </div>
        </div>
      </div>

      <AssetPickerDialog
        sessionId={sessionId}
        assetType="image"
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConfirm={(relativePath) => void selectLogo(relativePath)}
      />
    </>
  )
}
