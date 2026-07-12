import type { Chart } from '@arcsin1/pptx2json'
import { escapeHtml } from '../../ipc/utils'
import type { ImportedElementAnimation } from '../pptx-animation-import'
import { buildAnimationAttrs, buildBlockStyle, clampNumber } from './render-shared'
import type { ImportWarning } from './types'

type ChartSeries = {
  key?: string
  values?: Array<{ x?: string; y?: number }>
}

type MappedChartType = {
  type: string
  indexAxis?: 'x' | 'y'
  fill?: boolean
  showLine?: boolean
}

type ChartTypeMapping = {
  pattern: RegExp
  map: (chartType: string, barDir?: string) => MappedChartType
}

const PPTX_CHART_TYPE_MAPPINGS: ChartTypeMapping[] = [
  { pattern: /bubble/i, map: () => ({ type: 'bubble' }) },
  { pattern: /scatter/i, map: () => ({ type: 'scatter', showLine: true }) },
  { pattern: /doughnut/i, map: () => ({ type: 'doughnut' }) },
  { pattern: /pie/i, map: () => ({ type: 'pie' }) },
  { pattern: /area/i, map: () => ({ type: 'line', fill: true }) },
  { pattern: /line/i, map: () => ({ type: 'line' }) },
  { pattern: /radar/i, map: () => ({ type: 'radar' }) },
  {
    pattern: /bar/i,
    map: (_chartType, barDir) => ({
      type: 'bar',
      // pptx2json uses barDir="bar" for horizontal bars and "col" for vertical columns.
      indexAxis: barDir === 'bar' ? 'y' : 'x'
    })
  }
]

const mapChartType = (chartType: string, barDir?: string): MappedChartType | null => {
  const mapping = PPTX_CHART_TYPE_MAPPINGS.find((item) => item.pattern.test(chartType))
  return mapping ? mapping.map(chartType, barDir) : null
}

const isNumericArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => Number.isFinite(Number(item)))

export const chartCanvasId = (pageId: string, chartIndex: number): string => `chart-${pageId}-${chartIndex}`

export const unsupportedChartWarning = (blockId: string, chartType: string): string =>
  `图表 ${blockId}（${chartType || 'unknown'}）暂不支持结构化导入，已作为占位导入`

export const buildChartFrameStyle = (args: {
  element: Chart
  scaleX: number
  scaleY: number
  zIndex: number
  offsetX: number
  offsetY: number
}): string =>
  buildBlockStyle({
    element: args.element as unknown as Record<string, unknown>,
    scaleX: args.scaleX,
    scaleY: args.scaleY,
    zIndex: args.zIndex,
    offsetX: args.offsetX,
    offsetY: args.offsetY,
    overflow: 'hidden',
    extra: ['background:#fff']
  })

export const buildChartHtmlFromConfig = (args: {
  element: Chart
  blockId: string
  canvasId: string
  frameStyle: string
  animationAttrText: string
  config: Record<string, unknown>
}): string => `<section data-block-id="${escapeHtml(args.blockId)}" data-pptx-kind="chart" data-pptx-import-mode="editable" data-pptx-chart-type="${escapeHtml(args.element.chartType)}" class="ppt-chart-frame"${args.animationAttrText} style="${args.frameStyle}">
  <canvas id="${args.canvasId}" class="h-full w-full"></canvas>
</section>
<script>
window.addEventListener("DOMContentLoaded", function () {
  var el = document.getElementById("${args.canvasId}");
  if (!el || !window.PPT || !window.PPT.createChart) return;
  window.PPT.createChart(el, ${JSON.stringify(args.config).replace(/</g, '\\u003c')});
});
</script>`

const buildChartPlaceholderHtml = (args: {
  element: Chart
  blockId: string
  frameStyle: string
  animationAttrText: string
}): string =>
  `<section data-block-id="${escapeHtml(args.blockId)}" data-pptx-kind="chart" data-pptx-import-mode="placeholder" data-pptx-chart-type="${escapeHtml(args.element.chartType || 'unknown')}"${args.animationAttrText} style="${args.frameStyle};display:flex;align-items:center;justify-content:center;color:#6b7280;">图表已作为占位导入</section>`

export const buildChartBlock = (args: {
  element: Chart
  blockId: string
  animation?: ImportedElementAnimation
  pageId: string
  chartIndex: number
  scaleX: number
  scaleY: number
  zIndex: number
  offsetX: number
  offsetY: number
  pageNumber?: number
  warnings?: ImportWarning[]
  suppressUnsupportedWarning?: boolean
}): string => {
  const chartType = mapChartType(args.element.chartType, 'barDir' in args.element ? args.element.barDir : undefined)
  const canvasId = chartCanvasId(args.pageId, args.chartIndex)
  const animationAttrs = buildAnimationAttrs(args.animation)
  const animationAttrText = animationAttrs ? ` ${animationAttrs}` : ''
  const frameStyle = buildChartFrameStyle({
    element: args.element,
    scaleX: args.scaleX,
    scaleY: args.scaleY,
    zIndex: args.zIndex,
    offsetX: args.offsetX,
    offsetY: args.offsetY
  })
  const data = 'data' in args.element ? args.element.data : null
  const isCommonSeries = Array.isArray(data) && data.length > 0 && data.every((item) => {
    const record = item as Partial<ChartSeries> | undefined
    return Boolean(record && !Array.isArray(record) && Array.isArray(record.values))
  })
  const isPairedNumericSeries =
    Array.isArray(data) && data.length >= 2 && isNumericArray(data[0]) && isNumericArray(data[1])
  if (!chartType || (!isCommonSeries && !isPairedNumericSeries)) {
    if (!args.suppressUnsupportedWarning) {
      args.warnings?.push({
        pageNumber: args.pageNumber,
        message: unsupportedChartWarning(args.blockId, args.element.chartType)
      })
    }
    return buildChartPlaceholderHtml({
      element: args.element,
      blockId: args.blockId,
      frameStyle,
      animationAttrText
    })
  }
  if (/3DChart/i.test(args.element.chartType)) {
    args.warnings?.push({
      pageNumber: args.pageNumber,
      message: `图表 ${args.blockId} 的 3D 效果已简化为二维图表`
    })
  }
  let labels: string[] = []
  let datasets: Array<Record<string, unknown>> = []
  let legendDisplay = false
  if (isPairedNumericSeries) {
    const xValues = (data[0] as number[]).map((value) => clampNumber(value))
    const yValues = (data[1] as number[]).map((value) => clampNumber(value))
    const radiusValues = isNumericArray(data[2]) ? data[2].map((value) => clampNumber(value, 6)) : []
    labels = xValues.map((value) => String(value))
    datasets = [
      {
        label: 'Series 1',
        data: xValues.map((x, index) => {
          const y = yValues[index] ?? 0
          if (chartType.type !== 'bubble') return { x, y }
          return { x, y, r: Math.max(3, Math.min(40, Math.abs(radiusValues[index] ?? 6))) }
        }),
        borderColor: args.element.colors?.[0] || undefined,
        backgroundColor: args.element.colors?.[0] || undefined,
        showLine: chartType.showLine || undefined,
        tension: chartType.showLine ? 0.25 : undefined
      }
    ]
  } else {
    const series = data as ChartSeries[]
    labels = series[0]?.values?.map((item) => item.x ?? '') || []
    const isSingleDatasetChart = chartType.type === 'pie' || chartType.type === 'doughnut'
    legendDisplay = series.length > 1 || isSingleDatasetChart
    datasets = isSingleDatasetChart
      ? [
          {
            label: series[0]?.key || 'Series 1',
            data: (series[0]?.values || []).map((value) => value.y ?? 0),
            backgroundColor: args.element.colors?.length ? args.element.colors : undefined,
            borderColor: '#ffffff',
            borderWidth: 1
          }
        ]
      : series.map((item, index) => ({
          label: item.key || `Series ${index + 1}`,
          data: (item.values || []).map((value) => value.y ?? 0),
          borderColor: args.element.colors?.[index] || undefined,
          backgroundColor: args.element.colors?.[index] || undefined,
          fill: chartType.fill || false,
          tension: chartType.type === 'line' ? 0.25 : undefined
        }))
  }
  const config = {
    type: chartType.type,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: chartType.indexAxis || 'x',
      scales: isPairedNumericSeries ? { x: { type: 'linear' } } : undefined,
      plugins: { legend: { display: legendDisplay } }
    }
  }
  return buildChartHtmlFromConfig({
    element: args.element,
    blockId: args.blockId,
    canvasId,
    frameStyle,
    animationAttrText,
    config
  })
}
