import { escapeHtml } from '../../ipc/utils'
import type { ImportedElementAnimation } from '../pptx-animation-import'

export const clampNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}


export const buildBlockStyle = (args: {
  element: Record<string, unknown>
  scaleX: number
  scaleY: number
  zIndex: number
  offsetX?: number
  offsetY?: number
  overflow?: 'hidden' | 'visible'
  extra?: string[]
}): string => {
  const x = (clampNumber(args.element.left) + clampNumber(args.offsetX)) * args.scaleX
  const y = (clampNumber(args.element.top) + clampNumber(args.offsetY)) * args.scaleY
  const width = Math.max(1, clampNumber(args.element.width) * args.scaleX)
  const height = Math.max(1, clampNumber(args.element.height) * args.scaleY)
  const rotate = clampNumber(args.element.rotate)
  const styles = [
    'position:absolute',
    `left:${x.toFixed(1)}px`,
    `top:${y.toFixed(1)}px`,
    `width:${width.toFixed(1)}px`,
    `height:${height.toFixed(1)}px`,
    `z-index:${args.zIndex}`,
    `overflow:${args.overflow || 'visible'}`,
    rotate ? `transform:rotate(${rotate.toFixed(2)}deg)` : ''
  ]
  return [...styles, ...(args.extra || [])].filter(Boolean).join(';')
}


export const buildAnimationAttrs = (animation: ImportedElementAnimation | undefined): string => {
  if (!animation) return ''
  return [
    `data-anim="${animation.type}"`,
    animation.from ? `data-anim-from="${animation.from}"` : '',
    animation.path ? `data-anim-path="${escapeHtml(animation.path)}"` : '',
    `data-anim-duration="${animation.duration}"`,
    `data-anim-delay="${animation.delay}"`,
    animation.trigger === 'click' ? 'data-anim-trigger="click"' : '',
    animation.clickGroup ? `data-anim-click-group="${escapeHtml(animation.clickGroup)}"` : '',
    `data-pptx-source-spid="${escapeHtml(animation.sourceId)}"`
  ]
    .filter(Boolean)
    .join(' ')
}
