export const THINKING_PARAMETER_MODES = ['auto', 'omit'] as const

export type ThinkingParameterMode = (typeof THINKING_PARAMETER_MODES)[number]

export const DEFAULT_THINKING_PARAMETER_MODE: ThinkingParameterMode = 'auto'

export const normalizeThinkingParameterMode = (value: unknown): ThinkingParameterMode => {
  return THINKING_PARAMETER_MODES.includes(value as ThinkingParameterMode)
    ? (value as ThinkingParameterMode)
    : DEFAULT_THINKING_PARAMETER_MODE
}
