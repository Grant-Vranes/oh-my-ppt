export interface EditModeLayoutIslandChild {
  index: number
  x: number
  y: number
  width: number
  height: number
}

export interface EditModeLayoutIsland {
  selector: string
  width: number
  height: number
  children: EditModeLayoutIslandChild[]
}

const MAX_LAYOUT_CHILDREN = 80

function normalizeFinite(value: unknown, min: number, max: number): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null
  return Math.round(numeric * 10) / 10
}

export function normalizeEditModeLayoutIsland(value: unknown): EditModeLayoutIsland | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as {
    selector?: unknown
    width?: unknown
    height?: unknown
    children?: unknown
  }
  const selector = typeof record.selector === 'string' ? record.selector.trim() : ''
  const width = normalizeFinite(record.width, 1, 3200)
  const height = normalizeFinite(record.height, 1, 3200)
  if (!selector || selector.length > 1000 || width === null || height === null) return undefined
  if (!Array.isArray(record.children)) return undefined
  const children = record.children
    .map((value): EditModeLayoutIsland['children'][number] | null => {
      if (!value || typeof value !== 'object') return null
      const child = value as {
        index?: unknown
        x?: unknown
        y?: unknown
        width?: unknown
        height?: unknown
      }
      const index = Number(child.index)
      const x = normalizeFinite(child.x, -3200, 3200)
      const y = normalizeFinite(child.y, -3200, 3200)
      const childWidth = normalizeFinite(child.width, 1, 3200)
      const childHeight = normalizeFinite(child.height, 1, 3200)
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > 200 ||
        x === null ||
        y === null ||
        childWidth === null ||
        childHeight === null
      ) {
        return null
      }
      return { index, x, y, width: childWidth, height: childHeight }
    })
    .filter((child): child is EditModeLayoutIsland['children'][number] => child !== null)
    .slice(0, MAX_LAYOUT_CHILDREN)
  return children.length > 0 ? { selector, width, height, children } : undefined
}
