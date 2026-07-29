import type { PresentationElementSnapshot } from '@arcsin1/presentation-editor-runtime'
import {
  SELECTED_ELEMENT_CONTEXT_COMPUTED_STYLE_PROPERTIES,
  type SelectedElementRuntimeContext
} from '@shared/generation'

const MAX_ATTRIBUTES = 40
const MAX_INLINE_STYLES = 40
const MAX_CLASS_NAMES = 24
const MAX_VALUE_LENGTH = 480

const compact = (value: unknown, maxLength = MAX_VALUE_LENGTH): string =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)

const isSafeAttribute = (name: string): boolean => {
  const normalized = name.trim().toLowerCase()
  return (
    Boolean(normalized) &&
    !normalized.startsWith('on') &&
    normalized !== 'style' &&
    normalized !== 'srcdoc' &&
    !normalized.startsWith('data-arcsin1-presentation-editor-')
  )
}

const normalizeBound = (value: number, minimum: number): number =>
  Math.round(Math.max(minimum, Math.min(100_000, value)) * 100) / 100

/**
 * Converts the package's complete inspector result into a compact AI-editing reference.
 * Computed styles are intentionally curated: they explain rendered geometry and appearance
 * without turning a single selected element into an unbounded prompt payload.
 */
export function buildSelectedElementRuntimeContext(
  snapshot: PresentationElementSnapshot
): SelectedElementRuntimeContext {
  const attributes: Record<string, string> = {}
  for (const [name, value] of Object.entries(snapshot.attributes || {})) {
    if (Object.keys(attributes).length >= MAX_ATTRIBUTES || !isSafeAttribute(name)) continue
    const normalizedName = compact(name, 100)
    const normalizedValue = compact(value)
    if (normalizedName) attributes[normalizedName] = normalizedValue
  }

  const inlineStyle: NonNullable<SelectedElementRuntimeContext['inlineStyle']> = {}
  for (const [property, declaration] of Object.entries(snapshot.inlineStyle || {})) {
    if (Object.keys(inlineStyle).length >= MAX_INLINE_STYLES) continue
    const normalizedProperty = compact(property, 100).toLowerCase()
    if (!/^(?:--)?[a-z][a-z0-9-]*$/i.test(normalizedProperty)) continue
    inlineStyle[normalizedProperty] = {
      value: compact(declaration?.value),
      priority: declaration?.priority === 'important' ? 'important' : ''
    }
  }

  const computedStyle: Record<string, string> = {}
  for (const property of SELECTED_ELEMENT_CONTEXT_COMPUTED_STYLE_PROPERTIES) {
    const value = compact(snapshot.computedStyle?.[property])
    if (value) computedStyle[property] = value
  }

  const bounds = snapshot.bounds
  const validBounds =
    bounds &&
    [bounds.x, bounds.y, bounds.width, bounds.height].every(
      (value) => typeof value === 'number' && Number.isFinite(value)
    )
      ? {
          x: normalizeBound(bounds.x, -100_000),
          y: normalizeBound(bounds.y, -100_000),
          width: normalizeBound(bounds.width, 0),
          height: normalizeBound(bounds.height, 0)
        }
      : undefined

  const classList = (snapshot.classList || [])
    .map((name) => compact(name, 100))
    .filter(
      (name) =>
        Boolean(name) &&
        !name.startsWith('arcsin1-presentation-editor-') &&
        !name.startsWith('ppt-inspector-')
    )
    .slice(0, MAX_CLASS_NAMES)

  return {
    ...(classList.length > 0 ? { classList } : {}),
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(Object.keys(inlineStyle).length > 0 ? { inlineStyle } : {}),
    ...(Object.keys(computedStyle).length > 0 ? { computedStyle } : {}),
    ...(validBounds ? { bounds: validBounds } : {})
  }
}
