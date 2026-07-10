import { escapeHtmlText } from '@renderer/lib/utils'

export type InsertChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'radar'

export interface InsertChartSeries {
  name: string
  values: number[]
}

export interface InsertChartData {
  type: InsertChartType
  title: string
  labels: string[]
  values: number[]
  series?: InsertChartSeries[]
  primaryColor?: string
  accentColor?: string
  textColor?: string
  smooth?: boolean
  horizontal?: boolean
  stacked?: boolean
  areaFill?: boolean
  showPoints?: boolean
  showLegend?: boolean
  doughnutCutout?: number
  radarFill?: boolean
}

export interface NormalizedChartData extends InsertChartData {
  values: number[]
  series: InsertChartSeries[]
  primaryColor: string
  accentColor: string
  textColor: string
  smooth: boolean
  horizontal: boolean
  stacked: boolean
  areaFill: boolean
  showPoints: boolean
  showLegend: boolean
  doughnutCutout: number
  radarFill: boolean
}

export interface InsertChartLayout {
  blockId: string
  left: number
  top: number
  width: number
  height: number
  zIndex: number
}

export const CHART_TYPE_LIST: Array<{ type: InsertChartType; labelKey: string }> = [
  { type: 'bar', labelKey: 'editMode.chartBar' },
  { type: 'line', labelKey: 'editMode.chartLine' },
  { type: 'pie', labelKey: 'editMode.chartPie' },
  { type: 'doughnut', labelKey: 'editMode.chartDoughnut' },
  { type: 'radar', labelKey: 'editMode.chartRadar' }
]

export const DEFAULT_CHART_DATA: Record<InsertChartType, InsertChartData> = {
  bar: {
    type: 'bar',
    title: 'Quarterly Revenue',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    values: [24, 36, 31, 48]
  },
  line: {
    type: 'line',
    title: 'Growth Trend',
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
    values: [12, 19, 16, 28, 34]
  },
  pie: {
    type: 'pie',
    title: 'Market Share',
    labels: ['A', 'B', 'C', 'D'],
    values: [42, 28, 18, 12]
  },
  doughnut: {
    type: 'doughnut',
    title: 'Channel Mix',
    labels: ['Online', 'Retail', 'Partner', 'Other'],
    values: [45, 25, 20, 10]
  },
  radar: {
    type: 'radar',
    title: 'Capability Score',
    labels: ['Speed', 'Quality', 'Cost', 'Reach', 'Trust'],
    values: [82, 74, 68, 79, 88]
  }
}

const DEFAULT_CHART_PRIMARY_COLOR = '#5d6b4d'
const DEFAULT_CHART_ACCENT_COLOR = '#8fbc8f'
const DEFAULT_CHART_TEXT_COLOR = '#2f3b28'
const CHART_COLORS = [
  DEFAULT_CHART_PRIMARY_COLOR,
  DEFAULT_CHART_ACCENT_COLOR,
  '#d9a26f',
  '#5b8bb2',
  '#c86f6f',
  '#7b6bb7',
  '#6aa6a3',
  '#b98c58'
]
const MAX_CHART_LABELS = 200
const MAX_CHART_SERIES = 8

const BLOCK_ID_RE = /^select-arcsin1-[A-Za-z0-9_-]{4,32}$/

function assertBlockId(blockId: string): void {
  if (!BLOCK_ID_RE.test(blockId)) {
    throw new Error(`buildChartElementHtml: invalid blockId "${blockId}"`)
  }
}

export function normalizeChartData(data: InsertChartData): NormalizedChartData {
  const type = CHART_TYPE_LIST.some((item) => item.type === data.type) ? data.type : 'bar'
  const labels = data.labels
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, MAX_CHART_LABELS)
  const safeLabels = labels.length > 0 ? labels : DEFAULT_CHART_DATA[type].labels
  const fallbackValues = DEFAULT_CHART_DATA[type].values
  const normalizeValues = (values: unknown[] | undefined): number[] =>
    safeLabels.map((_, index) => {
      const value = Number(values?.[index])
      if (Number.isFinite(value)) return value
      return 0
    })
  const values = normalizeValues(data.values)
  const safeValues = values.map((item, index) => {
    const value = Number(item)
    if (Number.isFinite(value)) return value
    return Number.isFinite(fallbackValues[index]) ? fallbackValues[index] : 0
  })
  const rawSeries = Array.isArray(data.series) ? data.series : []
  const series = rawSeries
    .map((item, index) => ({
      name: String(item?.name || `Series ${index + 1}`).trim().slice(0, 80),
      values: normalizeValues(Array.isArray(item?.values) ? item.values : [])
    }))
    .filter((item) => item.name)
    .slice(0, MAX_CHART_SERIES)
  const safeSeries =
    series.length > 0
      ? series
      : [
          {
            name: String(data.title || 'Value').trim().slice(0, 80) || 'Value',
            values: safeValues
          }
        ]
  return {
    type,
    title: String(data.title ?? DEFAULT_CHART_DATA[type].title).trim().slice(0, 120),
    labels: safeLabels,
    values: safeSeries[0]?.values ?? safeValues,
    series: safeSeries,
    primaryColor: normalizeHexColor(data.primaryColor, DEFAULT_CHART_PRIMARY_COLOR),
    accentColor: normalizeHexColor(data.accentColor, DEFAULT_CHART_ACCENT_COLOR),
    textColor: normalizeHexColor(data.textColor, DEFAULT_CHART_TEXT_COLOR),
    smooth: data.smooth !== false,
    horizontal: data.horizontal === true,
    stacked: data.stacked === true,
    areaFill: data.areaFill !== false,
    showPoints: data.showPoints !== false,
    showLegend:
      data.showLegend ??
      (type === 'pie' || type === 'doughnut' || type === 'radar' || safeSeries.length > 1),
    doughnutCutout: normalizePercent(data.doughnutCutout, 58),
    radarFill: data.radarFill !== false
  }
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  const text = String(value || '').trim()
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(text)) return text
  return fallback
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex, DEFAULT_CHART_PRIMARY_COLOR)
  const raw =
    normalized.length === 4
      ? normalized
          .slice(1)
          .split('')
          .map((item) => item + item)
          .join('')
      : normalized.slice(1)
  const value = Number.parseInt(raw, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function normalizePercent(value: number | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(85, Math.round(parsed)))
}

function buildCircularPalette(primaryColor: string, accentColor: string, count: number): string[] {
  const palette = [
    primaryColor,
    accentColor,
    ...CHART_COLORS.filter((item) => item !== primaryColor && item !== accentColor)
  ]
  return Array.from({ length: count }, (_, index) => palette[index % palette.length])
}

function getSeriesColor(index: number, primaryColor: string, accentColor: string): string {
  const palette = [
    primaryColor,
    accentColor,
    ...CHART_COLORS.filter((item) => item !== primaryColor && item !== accentColor)
  ]
  return palette[index % palette.length]
}

export function buildChartJsConfig(data: InsertChartData): Record<string, unknown> {
  const chart = normalizeChartData(data)
  const isPieLike = chart.type === 'pie' || chart.type === 'doughnut'
  const isRadar = chart.type === 'radar'
  const showsLegend = isPieLike || isRadar
  const primaryColor = chart.primaryColor || DEFAULT_CHART_PRIMARY_COLOR
  const accentColor = chart.accentColor || DEFAULT_CHART_ACCENT_COLOR
  const textColor = chart.textColor || DEFAULT_CHART_TEXT_COLOR
  const smooth = chart.smooth !== false
  const horizontal = chart.type === 'bar' && chart.horizontal === true
  const stacked = chart.type === 'bar' && chart.stacked === true
  const areaFill = chart.type === 'line' && chart.areaFill !== false
  const showPoints =
    (chart.type === 'line' || chart.type === 'radar') && chart.showPoints !== false
  const radarFill = chart.type === 'radar' && chart.radarFill !== false
  const doughnutCutout = normalizePercent(chart.doughnutCutout, 58)
  const showLegend = chart.showLegend ?? showsLegend
  const buildDataset = (series: InsertChartSeries, index: number) => {
    const color = getSeriesColor(index, primaryColor, accentColor)
    return {
      label: series.name || chart.title || `Series ${index + 1}`,
      data: series.values,
      borderColor: color,
      backgroundColor: isPieLike
        ? buildCircularPalette(primaryColor, accentColor, chart.labels.length)
        : chart.type === 'line'
          ? areaFill
            ? hexToRgba(color, 0.2)
            : hexToRgba(color, 0.08)
          : isRadar
            ? radarFill
              ? hexToRgba(color, 0.22)
              : hexToRgba(color, 0.06)
            : color,
      borderWidth: 2,
      fill: chart.type === 'line' ? areaFill : isRadar ? radarFill : undefined,
      tension: chart.type === 'line' && smooth ? 0.34 : undefined,
      pointRadius:
        chart.type === 'line' || chart.type === 'radar' ? (showPoints ? 4 : 0) : undefined,
      pointHoverRadius: chart.type === 'line' || chart.type === 'radar' ? 5 : undefined
    }
  }
  const datasets = isPieLike
    ? [buildDataset(chart.series[0], 0)]
    : chart.series.map((series, index) => buildDataset(series, index))
  return {
    type: chart.type,
    data: {
      labels: chart.labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      indexAxis: horizontal ? 'y' : undefined,
      cutout: chart.type === 'doughnut' ? `${doughnutCutout}%` : undefined,
      plugins: {
        legend: {
          display: showLegend,
          labels: { color: textColor }
        },
        pptEditorColors: {
          primaryColor,
          accentColor,
          textColor,
          smooth,
          horizontal,
          stacked,
          areaFill,
          showPoints,
          showLegend,
          doughnutCutout,
          radarFill
        },
        title: {
          display: Boolean(chart.title),
          text: chart.title,
          color: textColor,
          font: { size: 18, weight: '700' }
        }
      },
      scales: isPieLike
        ? undefined
        : isRadar
          ? {
              r: {
                beginAtZero: true,
                grid: { color: hexToRgba(primaryColor, 0.14) },
                angleLines: { color: hexToRgba(primaryColor, 0.16) },
                ticks: { color: textColor, backdropColor: 'transparent' },
                pointLabels: { color: textColor }
              }
            }
          : {
              x: {
                stacked,
                grid: { color: hexToRgba(primaryColor, 0.12) },
                ticks: { color: textColor }
              },
              y: {
                beginAtZero: true,
                stacked,
                grid: { color: hexToRgba(primaryColor, 0.12) },
                ticks: { color: textColor }
              }
            }
    }
  }
}

function buildChartRenderScript(blockId: string): string {
  return `(function(){function render(){var root=document.querySelector('[data-block-id="${blockId}"]');var canvas=root&&root.querySelector('canvas');var holder=root&&root.querySelector('script[data-ppt-chart-config="1"]');if(!root||!canvas||!holder||!window.PPT||typeof window.PPT.createChart!=="function")return;try{window.PPT.createChart(canvas,JSON.parse(holder.textContent||"{}"));}catch(error){console.error("[ppt-chart]",error);}}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",render,{once:true});}else{render();}})();`
}

function escapeScriptText(value: string): string {
  return value.replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--')
}

export function buildChartElementHtml(layout: InsertChartLayout, data: InsertChartData): string {
  assertBlockId(layout.blockId)
  const chart = normalizeChartData(data)
  const config = buildChartJsConfig(chart)
  const style = [
    'position:absolute',
    `left:${layout.left}px`,
    `top:${layout.top}px`,
    `width:${layout.width}px`,
    `height:${layout.height}px`,
    `z-index:${layout.zIndex}`,
    'box-sizing:border-box',
    'padding:12px',
    'border-radius:8px',
    'background:#fffdf8',
    'border:1px solid rgba(216,204,181,0.72)',
    'box-shadow:0 8px 22px rgba(74,59,42,0.08)'
  ].join('; ')
  return [
    `<div data-block-id="${layout.blockId}" data-ppt-edit-kind="chart" data-ppt-chart-editable="simple" style="${escapeHtmlText(style)}">`,
    '<canvas style="display:block;width:100%;height:100%;"></canvas>',
    `<script type="application/json" data-ppt-chart-config="1">${escapeScriptText(JSON.stringify(config))}</script>`,
    `<script data-ppt-generated-chart-script="1">${buildChartRenderScript(layout.blockId)}</script>`,
    '</div>'
  ].join('')
}
