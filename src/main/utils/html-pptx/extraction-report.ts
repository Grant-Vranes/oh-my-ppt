import type { HtmlToPptxExtractionReport } from '@arcsin1/html2pptx'

export const buildExtractionReportWarning = (
  pageId: string,
  report: HtmlToPptxExtractionReport | undefined
): string | undefined => {
  if (!report) return undefined
  const details: string[] = []
  if (report.textLimitReached) details.push('可编辑文本达到上限，剩余文本已保留在背景图')
  if (report.shapeLimitReached) details.push('可编辑形状达到上限，剩余形状已保留在背景图')
  if (report.imageLimitReached) details.push('可编辑图片达到上限，剩余图片已保留在背景图')
  if (report.unsupportedTransformCount > 0) {
    details.push(`${report.unsupportedTransformCount} 个复杂变换元素已保留在背景图`)
  }
  if (report.imageRasterFallbackCount > 0) {
    details.push(`${report.imageRasterFallbackCount} 个图片或图表无法安全转换，已保留在背景图`)
  }
  return details.length > 0 ? `页面 ${pageId}：${details.join('；')}` : undefined
}
