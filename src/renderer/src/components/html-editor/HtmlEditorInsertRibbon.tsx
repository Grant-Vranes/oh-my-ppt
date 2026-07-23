import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ChartColumn,
  ChartLine,
  ChartPie,
  Donut,
  ImagePlus,
  Radar,
  Shapes,
  Smile,
  Sparkles,
  Type,
  Video
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover'
import { useT, type I18nKey } from '../../i18n'
import {
  ICON_LIST,
  ICON_VIEWBOX,
  serializeIconInner,
  SHAPE_LIST,
  type InsertShapeType
} from '../session-detail/workspace/insert-shapes'
import { CHART_TYPE_LIST, type InsertChartType } from '../session-detail/workspace/insert-charts'
import { ART_TEXT_TEMPLATES, type ArtTextTemplateId } from '../../lib/artTextTemplates'
import type { useHtmlElementInsertion } from './useHtmlElementInsertion'
import { HtmlEditorMediaInsertDialog } from './HtmlEditorMediaInsertDialog'

type Insertion = ReturnType<typeof useHtmlElementInsertion>

const triggerBtnClass =
  'flex h-9 w-9 items-center justify-center rounded-md text-[#5d6b4d] transition-colors hover:bg-[#ece5d6] disabled:pointer-events-none disabled:opacity-40'

const shapeLabelKey: Record<InsertShapeType, I18nKey> = {
  rect: 'editMode.shapeRect',
  'rounded-rect': 'editMode.shapeRoundedRect',
  ellipse: 'editMode.shapeEllipse',
  triangle: 'editMode.shapeTriangle',
  diamond: 'editMode.shapeDiamond',
  pentagon: 'editMode.shapePentagon',
  hexagon: 'editMode.shapeHexagon',
  parallelogram: 'editMode.shapeParallelogram',
  trapezoid: 'editMode.shapeTrapezoid',
  'star-5': 'editMode.shapeStar',
  line: 'editMode.shapeLine',
  'arrow-right': 'editMode.shapeArrowRight',
  'chevron-right': 'editMode.shapeChevron'
}

const chartIcons: Record<InsertChartType, typeof ChartColumn> = {
  bar: ChartColumn,
  line: ChartLine,
  pie: ChartPie,
  doughnut: Donut,
  radar: Radar
}

/** hover 弹出的画廊按钮：鼠标移入打开、移出关闭（含跨入内容的容忍延时）。 */
function HoverInsertButton({
  icon: Icon,
  label,
  disabled,
  children
}: {
  icon: typeof Type
  label: string
  disabled?: boolean
  children: ReactNode
}): ReactNode {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const cancelClose = (): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const openNow = (): void => {
    if (disabled) return
    cancelClose()
    setOpen(true)
  }
  const scheduleClose = (): void => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }
  useEffect(() => () => cancelClose(), [])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          title={label}
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          className={triggerBtnClass}
        >
          <Icon className="h-4 w-4" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        className="z-50 border-[#d8ccb5]/85 bg-[#fff9ef] p-2 shadow-lg"
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

function DirectButton({
  icon: Icon,
  label,
  disabled,
  onClick
}: {
  icon: typeof Type
  label: string
  disabled?: boolean
  onClick: () => void
}): ReactNode {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={triggerBtnClass}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

export function HtmlEditorInsertRibbon({
  insertion,
  disabled
}: {
  insertion: Insertion
  disabled?: boolean
}): ReactNode {
  const t = useT()
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null)
  const strokeIcons = ICON_LIST.filter((icon) => icon.variant !== 'badge')
  const badgeIcons = ICON_LIST.filter((icon) => icon.variant === 'badge')

  const iconGrid = (icons: typeof ICON_LIST): ReactNode => (
    <div className="grid grid-cols-6 gap-1.5">
      {icons.map((icon) => {
        const isBadge = icon.variant === 'badge'
        return (
          <button
            key={icon.id}
            type="button"
            title={icon.label}
            className="flex h-12 items-center justify-center rounded-lg border border-transparent text-[#3e4a32] transition-colors hover:border-[#8fbc8f] hover:bg-white"
            onClick={() => void insertion.addIcon(icon.id)}
          >
            <svg
              viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
              className={isBadge ? 'h-6 w-6' : 'h-5 w-5'}
              fill="none"
              stroke={isBadge ? 'none' : 'currentColor'}
              strokeWidth={isBadge ? 0 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dangerouslySetInnerHTML={{ __html: serializeIconInner(icon) }}
            />
          </button>
        )
      })}
    </div>
  )

  return (
    <aside className="flex w-12 flex-col items-center gap-1 border-r border-[#e2dccf] bg-[#f5f1e8] py-3">
      <DirectButton
        icon={Type}
        label={t('editMode.addText')}
        disabled={disabled}
        onClick={() => void insertion.addText()}
      />

      <DirectButton
        icon={ImagePlus}
        label={t('editMode.addImage')}
        disabled={disabled}
        onClick={() => setMediaType('image')}
      />

      <DirectButton
        icon={Video}
        label={t('editMode.addVideo')}
        disabled={disabled}
        onClick={() => setMediaType('video')}
      />

      <HoverInsertButton icon={Sparkles} label={t('editMode.artText')} disabled={disabled}>
        <div className="grid max-h-[420px] w-[420px] grid-cols-3 gap-2 overflow-y-auto pr-1">
          {ART_TEXT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              className="flex min-h-[90px] flex-col items-center justify-center gap-2 rounded-lg border border-[#d8ccb5]/78 bg-[#1f261d] px-2 py-3 text-center transition-colors hover:border-[#8fbc8f]"
              onClick={() => void insertion.addArtText(tpl.id as ArtTextTemplateId)}
            >
              <span className="text-[18px] font-extrabold text-white">{tpl.defaultText}</span>
              <span className="text-[10px] text-white/70">{tpl.label}</span>
            </button>
          ))}
        </div>
      </HoverInsertButton>

      <HoverInsertButton icon={Shapes} label={t('editMode.addShape')} disabled={disabled}>
        <div className="grid w-[280px] grid-cols-3 gap-2">
          {SHAPE_LIST.map((def) => (
            <button
              key={def.type}
              type="button"
              className="flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-lg border border-[#d8ccb5]/70 bg-white/70 px-2 py-2 text-[10px] font-bold text-[#3e4a32] transition-colors hover:border-[#8fbc8f] hover:bg-white"
              onClick={() => void insertion.addShape(def.type)}
            >
              <svg
                viewBox={`0 0 ${def.defaultWidth} ${def.defaultHeight}`}
                className="h-9 w-12"
                preserveAspectRatio="xMidYMid meet"
                dangerouslySetInnerHTML={{
                  __html: def.renderInner(def.defaultWidth, def.defaultHeight, {
                    fill: def.defaultFill,
                    stroke: def.defaultStroke,
                    strokeWidth: def.strokeWidth
                  })
                }}
              />
              <span>{t(shapeLabelKey[def.type])}</span>
            </button>
          ))}
        </div>
      </HoverInsertButton>

      <HoverInsertButton icon={Smile} label={t('editMode.addIcon')} disabled={disabled}>
        <div className="max-h-[360px] w-[390px] space-y-2 overflow-y-auto pr-1">
          <div>
            <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-[#7a875f]">
              {t('editMode.iconSectionIcons')}
            </div>
            {iconGrid(strokeIcons)}
          </div>
          <div>
            <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-[#7a875f]">
              {t('editMode.iconSectionNumbers')}
            </div>
            {iconGrid(badgeIcons)}
          </div>
        </div>
      </HoverInsertButton>

      <HoverInsertButton icon={ChartColumn} label={t('editMode.chart')} disabled={disabled}>
        <div className="grid w-[280px] grid-cols-3 gap-2">
          {CHART_TYPE_LIST.map((item) => {
            const Icon = chartIcons[item.type]
            return (
              <button
                key={item.type}
                type="button"
                className="flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-lg border border-[#d8ccb5]/70 bg-white/70 px-2 py-2 text-[10px] font-bold text-[#3e4a32] transition-colors hover:border-[#8fbc8f] hover:bg-white"
                onClick={() => void insertion.addChart(item.type)}
              >
                <Icon className="h-5 w-5 text-[#5d6b4d]" />
                <span>{t(item.labelKey as I18nKey)}</span>
              </button>
            )
          })}
        </div>
      </HoverInsertButton>
      <HtmlEditorMediaInsertDialog
        mediaType={mediaType}
        insertion={insertion}
        onClose={() => setMediaType(null)}
      />
    </aside>
  )
}
