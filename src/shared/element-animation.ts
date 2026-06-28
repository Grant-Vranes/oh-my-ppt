export const DATA_ANIM_SUPPORTED_TYPES = [
  'fade',
  'fade-up',
  'fade-down',
  'fade-left',
  'fade-right',
  'scale-in',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'fly-in',
  'wipe',
  'zoom-in',
  'spin-in',
  'grow-shrink-soft',
  'grow-shrink',
  'grow-shrink-strong',
  'pulse-soft',
  'pulse',
  'pulse-strong',
  'exit-fade',
  'exit-scale',
  'exit-zoom',
  'exit-wipe',
  'exit-fly',
  'path'
] as const

export type DataAnimType = (typeof DATA_ANIM_SUPPORTED_TYPES)[number]

export const DATA_ANIM_EDITABLE_TYPES = DATA_ANIM_SUPPORTED_TYPES.filter(
  (type): type is Exclude<DataAnimType, 'path'> => type !== 'path'
)

export type ElementAnimationEditableType = (typeof DATA_ANIM_EDITABLE_TYPES)[number]

export const DATA_ANIM_FROM_VALUES = ['left', 'right', 'top', 'bottom', 'center'] as const
export type DataAnimFrom = (typeof DATA_ANIM_FROM_VALUES)[number]
export type ElementAnimationEditableFrom = Exclude<DataAnimFrom, 'center'>

export const DATA_ANIM_TRIGGERS = ['load', 'with', 'after', 'click'] as const
export type DataAnimTrigger = (typeof DATA_ANIM_TRIGGERS)[number]
export type DataAnimPptxTrigger = Extract<DataAnimTrigger, 'load' | 'click'>

export const DATA_ANIM_SEQUENCES = ['with', 'after'] as const
export type DataAnimSequence = (typeof DATA_ANIM_SEQUENCES)[number]

export interface ElementAnimationConfig {
  type: DataAnimType
  trigger: DataAnimTrigger
  durationMs: number
  from?: DataAnimFrom
  delay?: string
  staggerMs?: number
  sequence?: DataAnimSequence
  clickGroup?: string
  path?: string
}

export interface ElementAnimationPatch {
  type?: ElementAnimationEditableType | null
  trigger?: 'load' | 'click'
  durationMs?: number
  from?: ElementAnimationEditableFrom | null
}

export function isDataAnimType(value: unknown): value is DataAnimType {
  return DATA_ANIM_SUPPORTED_TYPES.includes(value as DataAnimType)
}

export function isDataAnimTrigger(value: unknown): value is DataAnimTrigger {
  return DATA_ANIM_TRIGGERS.includes(value as DataAnimTrigger)
}

export function isDataAnimFrom(value: unknown): value is DataAnimFrom {
  return DATA_ANIM_FROM_VALUES.includes(value as DataAnimFrom)
}

export function isDataAnimSequence(value: unknown): value is DataAnimSequence {
  return DATA_ANIM_SEQUENCES.includes(value as DataAnimSequence)
}

/**
 * Normalize data-anim-trigger to a canonical value.
 * Tolerates PowerPoint-style legacy aliases (on-click / after-previous / with-previous)
 * so old/hand-edited pages stay editable. Returns null for truly invalid values.
 */
export function normalizeDataAnimTrigger(
  value: string | undefined | null
): DataAnimTrigger | null {
  const normalized = (value || '').trim().toLowerCase()
  if (normalized === 'on-click' || normalized === 'click') return 'click'
  if (normalized === 'after-previous' || normalized === 'after') return 'after'
  if (normalized === 'with-previous' || normalized === 'with') return 'with'
  if (normalized === 'load') return 'load'
  return null
}

export function isElementAnimationEditableType(
  value: unknown
): value is ElementAnimationEditableType {
  return DATA_ANIM_EDITABLE_TYPES.includes(value as ElementAnimationEditableType)
}

export function isElementAnimationEditableFrom(
  value: unknown
): value is ElementAnimationEditableFrom {
  return ['left', 'right', 'top', 'bottom'].includes(value as string)
}
