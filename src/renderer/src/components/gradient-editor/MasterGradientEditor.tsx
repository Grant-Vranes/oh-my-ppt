import { useEffect, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Blend,
  Circle,
  FolderOpen,
  ImageIcon,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { useT } from '@renderer/i18n'
import { ipc } from '@renderer/lib/ipc'
import { useMasterWorkbenchStore, useSessionStore, useToastStore } from '@renderer/store'
import {
  MAX_MASTER_GRADIENT_STOPS,
  MIN_MASTER_GRADIENT_STOPS,
  addMasterGradientStop,
  buildMasterGradientCss,
  normalizeMasterGradient,
  removeMasterGradientStop,
  updateMasterGradientStop,
  type MasterGradient
} from '@shared/master'
import { localAssetUrl } from '@shared/local-asset'
import { resolveSlideSize } from '@shared/slide-size'
import { Button } from '../ui/Button'
import { ColorPicker } from '../ui/ColorPicker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/Dialog'
import { Input } from '../ui/Input'
import { ToggleGroup, ToggleGroupItem } from '../ui/ToggleGroup'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip'
import { AssetPickerDialog } from '../session-detail/modal/AssetPickerDialog'

const gradientPresets = [
  ['#fccb90', '#d57eeb'],
  ['#67e8f9', '#4f46e5'],
  ['#34d399', '#059669'],
  ['#fda4af', '#f97316'],
  ['#c4b5fd', '#ec4899'],
  ['#facc15', '#ef4444'],
  ['#1e293b', '#0f766e'],
  ['#f1f5f9', '#94a3b8']
] as const

const directionPresets = [
  { angle: 0, Icon: ArrowUp },
  { angle: 45, Icon: ArrowUpRight },
  { angle: 90, Icon: ArrowRight },
  { angle: 180, Icon: ArrowDown }
] as const

type DraggingStop = {
  color: string
  position: number
}

export function MasterGradientEditor(): React.JSX.Element {
  const t = useT()
  const config = useMasterWorkbenchStore((state) => state.config)
  const updateConfig = useMasterWorkbenchStore((state) => state.updateConfig)
  const currentSession = useSessionStore((state) => state.currentSession)
  const sessionId = currentSession?.id || ''
  const slideSize = resolveSlideSize({
    id: currentSession?.slideSizeId,
    width: currentSession?.slideWidth,
    height: currentSession?.slideHeight
  })
  const toastError = useToastStore((state) => state.error)
  const [editorOpen, setEditorOpen] = useState(false)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeBackgroundStyle, setActiveBackgroundStyle] = useState(config.backgroundStyle)
  const [gradientDraft, setGradientDraft] = useState<MasterGradient>(() =>
    normalizeMasterGradient(config.backgroundGradient)
  )
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [selectedStopIndex, setSelectedStopIndex] = useState(0)
  const draggingStopRef = useRef<DraggingStop | null>(null)
  const gradient = gradientDraft
  const selectedStop = gradient.stops[Math.min(selectedStopIndex, gradient.stops.length - 1)]
  const isGradient = activeBackgroundStyle === 'gradient'
  const isImage = activeBackgroundStyle === 'image'

  useEffect(() => {
    setSelectedStopIndex((current) => Math.min(current, gradient.stops.length - 1))
  }, [gradient.stops.length])

  useEffect(() => {
    setActiveBackgroundStyle(config.backgroundStyle)
  }, [config.backgroundStyle])

  useEffect(() => {
    if (!sessionId || !config.backgroundImage) {
      setImagePreviewUrl(null)
      return
    }
    let cancelled = false
    void ipc
      .listAssets(sessionId, 'image')
      .then(({ assets }) => {
        const image = assets.find((asset) => asset.relativePath === config.backgroundImage)
        if (!cancelled) setImagePreviewUrl(image ? localAssetUrl(image.absolutePath) : null)
      })
      .catch(() => {
        if (!cancelled) setImagePreviewUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [config.backgroundImage, sessionId])

  const openGradientEditor = (): void => {
    setGradientDraft(normalizeMasterGradient(config.backgroundGradient))
    setSelectedStopIndex(0)
    setEditorOpen(true)
  }

  const cancelGradientEditor = (): void => {
    setActiveBackgroundStyle(config.backgroundStyle)
    setEditorOpen(false)
  }

  const selectBackgroundStyle = (value: string): void => {
    if (value !== 'solid' && value !== 'gradient' && value !== 'image') return
    if (value === 'gradient') {
      setActiveBackgroundStyle('gradient')
      openGradientEditor()
      return
    }
    setActiveBackgroundStyle(value)
    if (value === 'solid') {
      updateConfig({ backgroundMode: 'override', backgroundStyle: 'solid' })
    }
  }

  const updateSelectedStop = (patch: { color?: string; position?: number }): void => {
    if (!selectedStop) return
    setGradientDraft(updateMasterGradientStop(gradient, selectedStopIndex, patch))
  }

  const updateAngle = (angle: number): void => {
    setGradientDraft(normalizeMasterGradient({ ...gradient, angle }))
  }

  const applyPreset = (colors: readonly string[]): void => {
    const stops = colors.map((color, index) => ({
      color,
      position: Math.round((index / (colors.length - 1)) * 100)
    }))
    setGradientDraft(normalizeMasterGradient({ ...gradient, stops } satisfies MasterGradient))
    setSelectedStopIndex(0)
  }

  const findStopIndex = (
    stops: MasterGradient['stops'],
    color: string,
    position: number
  ): number => {
    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY
    stops.forEach((stop, index) => {
      if (stop.color !== color) return
      const distance = Math.abs(stop.position - position)
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })
    return closestIndex
  }

  const getTrackPosition = (event: React.PointerEvent<HTMLDivElement>): number => {
    const { left, width } = event.currentTarget.getBoundingClientRect()
    if (width === 0) return 0
    return Math.round(Math.min(100, Math.max(0, ((event.clientX - left) / width) * 100)))
  }

  const addStopAtPosition = (position: number): void => {
    if (gradient.stops.length >= MAX_MASTER_GRADIENT_STOPS) return
    const next = addMasterGradientStop(gradient, position)
    setGradientDraft(next)
    setSelectedStopIndex(
      next.stops.reduce(
        (closestIndex, stop, index) =>
          Math.abs(stop.position - position) <
          Math.abs(next.stops[closestIndex].position - position)
            ? index
            : closestIndex,
        0
      )
    )
  }

  const startDraggingStop = (event: React.PointerEvent<HTMLButtonElement>, index: number): void => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const stop = gradient.stops[index]
    draggingStopRef.current = { color: stop.color, position: stop.position }
    setSelectedStopIndex(index)
  }

  const moveDraggingStop = (event: React.PointerEvent<HTMLDivElement>): void => {
    const draggingStop = draggingStopRef.current
    if (!draggingStop) return
    const position = getTrackPosition(event)
    if (position === draggingStop.position) return
    const sourceIndex = findStopIndex(gradient.stops, draggingStop.color, draggingStop.position)
    const next = updateMasterGradientStop(gradient, sourceIndex, { position })
    const nextIndex = findStopIndex(next.stops, draggingStop.color, position)
    draggingStopRef.current = { color: draggingStop.color, position }
    setSelectedStopIndex(nextIndex)
    setGradientDraft(next)
  }

  const stopDragging = (): void => {
    draggingStopRef.current = null
  }

  const removeSelectedStop = (): void => {
    const next = removeMasterGradientStop(gradient, selectedStopIndex)
    setGradientDraft(next)
    setSelectedStopIndex((current) => Math.max(0, Math.min(current - 1, next.stops.length - 1)))
  }

  const applyGradient = (): void => {
    updateConfig({
      backgroundMode: 'override',
      backgroundStyle: 'gradient',
      backgroundGradient: normalizeMasterGradient(gradientDraft)
    })
    setActiveBackgroundStyle('gradient')
    setEditorOpen(false)
  }

  const useBackgroundImage = (relativePath: string, absolutePath?: string): void => {
    updateConfig({
      backgroundMode: 'override',
      backgroundStyle: 'image',
      backgroundImage: relativePath
    })
    setActiveBackgroundStyle('image')
    setImagePreviewUrl(absolutePath ? localAssetUrl(absolutePath) : null)
  }

  const uploadBackgroundImage = async (): Promise<void> => {
    if (!sessionId || uploading) return
    setUploading(true)
    try {
      const result = await ipc.chooseAndUploadAssets(sessionId, 'image')
      const image = result.assets[0]
      if (result.cancelled || !image) return
      useBackgroundImage(image.relativePath, image.absolutePath)
    } catch (error) {
      toastError(
        error instanceof Error
          ? error.message
          : t('sessionDetail.masterBackgroundImageUploadFailed')
      )
    } finally {
      setUploading(false)
    }
  }

  const clearBackgroundImage = (): void => {
    updateConfig({ backgroundMode: 'override', backgroundStyle: 'solid', backgroundImage: null })
    setActiveBackgroundStyle('solid')
    setImagePreviewUrl(null)
  }

  return (
    <>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3 text-sm text-[#4a563d]">
          <span>{t('sessionDetail.masterBackgroundStyle')}</span>
          <ToggleGroup
            type="single"
            value={activeBackgroundStyle}
            onValueChange={selectBackgroundStyle}
            className="flex-wrap rounded-md border border-[#e4e4e7]/70 bg-[#ffffff] p-0.5"
          >
            <ToggleGroupItem
              value="solid"
              className="w-auto gap-1 rounded px-2 text-[11px] font-medium"
            >
              <Circle className="h-3.5 w-3.5" />
              {t('sessionDetail.masterBackgroundSolid')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="gradient"
              className="w-auto gap-1 rounded px-2 text-[11px] font-medium"
            >
              <Blend className="h-3.5 w-3.5" />
              {t('sessionDetail.masterBackgroundGradient')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="image"
              className="w-auto gap-1 rounded px-2 text-[11px] font-medium"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              {t('sessionDetail.masterBackgroundImage')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {!isGradient && !isImage ? (
          <div className="flex items-center justify-between rounded-md border border-[#e4dac9] bg-[#ffffff]/70 px-2.5 py-2 text-sm text-[#4a563d]">
            <span>{t('sessionDetail.masterBackground')}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[#667257]">{config.backgroundColor}</span>
              <ColorPicker
                value={config.backgroundColor}
                allowAlpha={false}
                ariaLabel={t('sessionDetail.masterBackground')}
                onChange={(backgroundColor) =>
                  updateConfig({ backgroundColor, backgroundMode: 'override' })
                }
              />
            </div>
          </div>
        ) : isGradient ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t('sessionDetail.masterGradientConfigure')}
                className="block h-12 w-full cursor-pointer overflow-hidden rounded-md border border-[#e4e4e7]/75 shadow-[inset_0_1px_2px_rgba(74,59,42,0.08)] transition-shadow hover:shadow-[inset_0_0_0_1px_rgba(80,102,66,0.72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]"
                style={{ background: buildMasterGradientCss(config.backgroundGradient) }}
                onClick={openGradientEditor}
              />
            </TooltipTrigger>
            <TooltipContent>{t('sessionDetail.masterGradientConfigure')}</TooltipContent>
          </Tooltip>
        ) : (
          <div className="overflow-hidden rounded-md border border-[#e4dac9] bg-[#ffffff]/70">
            <div className="flex h-[196px] items-center justify-center bg-[#eee8dc] p-2">
              <div
                className="relative h-full max-w-full overflow-hidden"
                style={{ aspectRatio: `${slideSize.width}/${slideSize.height}` }}
              >
                {imagePreviewUrl ? (
                  <img src={imagePreviewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center gap-2 text-xs text-[#667257]">
                    <ImageIcon className="h-4 w-4" />
                    <span>{t('sessionDetail.masterBackgroundImageEmpty')}</span>
                  </div>
                )}
                {config.backgroundImage && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-2 top-2 h-7 w-7 rounded-md bg-[#ffffff]/90 p-0 text-[#667257] shadow-sm hover:bg-white hover:text-[#a14f4a]"
                        aria-label={t('sessionDetail.masterBackgroundImageClear')}
                        onClick={clearBackgroundImage}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('sessionDetail.masterBackgroundImageClear')}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-2.5 py-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!sessionId || uploading}
                onClick={() => setAssetPickerOpen(true)}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {t('sessionDetail.masterBackgroundImageChoose')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={!sessionId || uploading}
                onClick={() => void uploadBackgroundImage()}
              >
                <Upload className="h-3.5 w-3.5" />
                {t('sessionDetail.masterBackgroundImageUpload')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={editorOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) cancelGradientEditor()
        }}
      >
        <DialogContent className="!max-w-[520px] gap-3 p-4">
          <DialogHeader>
            <DialogTitle>{t('sessionDetail.masterGradientEditorTitle')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('sessionDetail.masterGradientEditorDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div
              aria-label={t('sessionDetail.masterGradientPreview')}
              className="h-16 overflow-hidden rounded-md border border-[#e4e4e7]/75 shadow-[inset_0_1px_2px_rgba(74,59,42,0.08)]"
              style={{ background: buildMasterGradientCss(gradient) }}
            />

            <div className="space-y-2 rounded-md border border-[#e4dac9] bg-[#ffffff]/70 p-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-[#667257]">
                <span>{t('sessionDetail.masterGradientType')}</span>
                <ToggleGroup
                  type="single"
                  value={gradient.type}
                  onValueChange={(type) => {
                    if (type === 'linear' || type === 'radial') {
                      setGradientDraft(normalizeMasterGradient({ ...gradient, type }))
                    }
                  }}
                  className="rounded-md border border-[#e4e4e7]/70 bg-[#ffffff] p-0.5"
                >
                  <ToggleGroupItem
                    value="linear"
                    className="w-auto rounded px-2 text-[11px] font-medium"
                  >
                    {t('sessionDetail.masterGradientLinear')}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="radial"
                    className="w-auto rounded px-2 text-[11px] font-medium"
                  >
                    {t('sessionDetail.masterGradientRadial')}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {gradient.type === 'linear' && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[#667257]">
                      {t('sessionDetail.masterGradientAngle')}
                    </span>
                    <div className="flex items-center gap-1">
                      {directionPresets.map(({ angle, Icon }) => (
                        <button
                          key={angle}
                          type="button"
                          aria-label={`${t('sessionDetail.masterGradientAngle')} ${angle}°`}
                          title={`${t('sessionDetail.masterGradientAngle')} ${angle}°`}
                          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-[#667257] transition-colors hover:bg-[#f4f4f5] hover:text-[#18181b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]"
                          onClick={() => updateAngle(angle)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="grid grid-cols-[1fr_48px] items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={gradient.angle}
                      aria-label={t('sessionDetail.masterGradientAngle')}
                      className="h-2 w-full cursor-pointer accent-[#18181b]"
                      onChange={(event) => updateAngle(Number(event.target.value))}
                    />
                    <Input
                      type="number"
                      min={0}
                      max={359}
                      value={gradient.angle}
                      aria-label={t('sessionDetail.masterGradientAngle')}
                      className="h-7 rounded-md border-[#e4e4e7]/70 bg-[#ffffff] px-1 text-center text-xs"
                      onChange={(event) => updateAngle(Number(event.target.value))}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="space-y-2">
              <span className="text-xs text-[#667257]">
                {t('sessionDetail.masterGradientStops')}
              </span>
              <div
                aria-label={t('sessionDetail.masterGradientAddStop')}
                title={t('sessionDetail.masterGradientAddStop')}
                className="relative h-10 cursor-copy select-none touch-none rounded-md border border-[#e4e4e7]/75"
                style={{ background: buildMasterGradientCss(gradient) }}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget)
                    addStopAtPosition(getTrackPosition(event))
                }}
                onPointerMove={moveDraggingStop}
                onPointerUp={stopDragging}
                onPointerCancel={stopDragging}
              >
                {gradient.stops.map((stop, index) => (
                  <button
                    key={`${stop.color}-${stop.position}-${index}`}
                    type="button"
                    aria-label={t('sessionDetail.masterGradientStop', { position: stop.position })}
                    title={t('sessionDetail.masterGradientStop', { position: stop.position })}
                    className="absolute top-1/2 z-10 h-9 w-4 -translate-y-1/2 cursor-grab rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(62,74,50,0.54)] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]"
                    style={{
                      backgroundColor: stop.color,
                      left: `calc(${stop.position}% - 8px)`,
                      outline: index === selectedStopIndex ? '2px solid #314028' : undefined
                    }}
                    onPointerDown={(event) => startDraggingStop(event, index)}
                    onPointerUp={stopDragging}
                    onPointerCancel={stopDragging}
                  />
                ))}
              </div>
            </div>

            {selectedStop && (
              <div className="grid grid-cols-[40px_1fr_46px_28px] items-center gap-2 rounded-md border border-[#e4dac9] bg-[#ffffff]/70 p-2">
                <ColorPicker
                  value={selectedStop.color}
                  allowAlpha={false}
                  ariaLabel={t('sessionDetail.masterGradientStopColor')}
                  onChange={(color) => updateSelectedStop({ color })}
                />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={selectedStop.position}
                  aria-label={t('sessionDetail.masterGradientStop', {
                    position: selectedStop.position
                  })}
                  className="h-2 w-full cursor-pointer accent-[#18181b]"
                  onChange={(event) => updateSelectedStop({ position: Number(event.target.value) })}
                />
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={selectedStop.position}
                  aria-label={t('sessionDetail.masterGradientStop', {
                    position: selectedStop.position
                  })}
                  className="h-7 rounded-md border-[#e4e4e7]/70 bg-[#ffffff] px-1 text-center text-xs"
                  onChange={(event) => updateSelectedStop({ position: Number(event.target.value) })}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 cursor-pointer rounded-md p-0 text-[#a14f4a] hover:text-[#8d3b36]"
                      disabled={gradient.stops.length <= MIN_MASTER_GRADIENT_STOPS}
                      onClick={removeSelectedStop}
                      aria-label={t('sessionDetail.masterGradientRemoveStop')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('sessionDetail.masterGradientRemoveStop')}</TooltipContent>
                </Tooltip>
              </div>
            )}

            <div className="space-y-2">
              <span className="text-xs text-[#667257]">
                {t('sessionDetail.masterGradientPresets')}
              </span>
              <div className="grid grid-cols-8 gap-1.5">
                {gradientPresets.map((colors) => (
                  <button
                    key={colors.join('-')}
                    type="button"
                    aria-label={t('sessionDetail.masterGradientPresets')}
                    title={colors.join(' → ')}
                    className="h-7 cursor-pointer rounded-md border border-[#e4e4e7]/70 transition-transform hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18181b]"
                    style={{ background: `linear-gradient(135deg, ${colors.join(', ')})` }}
                    onClick={() => applyPreset(colors)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={cancelGradientEditor}>
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={applyGradient}>
              {t('sessionDetail.masterGradientConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssetPickerDialog
        sessionId={sessionId}
        assetType="image"
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        onConfirm={(relativePath) => useBackgroundImage(relativePath)}
      />
    </>
  )
}
