import { AsyncLocalStorage } from 'node:async_hooks'
import {
  DEFAULT_THINKING_PARAMETER_MODE,
  normalizeThinkingParameterMode,
  type ThinkingParameterMode
} from '@shared/model-config'

export const DEFAULT_MODEL_TEMPERATURE = 0.7

type ModelRuntimeControl = {
  modelConfigId?: string
  disableTemperature: boolean
  thinkingParameterMode: ThinkingParameterMode
}

const modelRuntimeControl = new AsyncLocalStorage<ModelRuntimeControl>()

export const getCurrentModelTemperatureControl = (): ModelRuntimeControl | undefined =>
  modelRuntimeControl.getStore()

export const bindCurrentModelTemperatureControl = (config: {
  id?: string
  disableTemperature?: boolean
  thinkingParameterMode?: ThinkingParameterMode
}): void => {
  modelRuntimeControl.enterWith({
    modelConfigId: config.id,
    disableTemperature: config.disableTemperature === true,
    thinkingParameterMode: normalizeThinkingParameterMode(config.thinkingParameterMode)
  })
}

export const runWithModelTemperatureControl = <T>(
  config: {
    id?: string
    disableTemperature?: boolean
    thinkingParameterMode?: ThinkingParameterMode
  },
  task: () => T
): T =>
  modelRuntimeControl.run(
    {
      modelConfigId: config.id,
      disableTemperature: config.disableTemperature === true,
      thinkingParameterMode: normalizeThinkingParameterMode(config.thinkingParameterMode)
    },
    task
  )

export const isCurrentModelTemperatureEnabled = (): boolean =>
  getCurrentModelTemperatureControl()?.disableTemperature !== true

export const resolveCurrentModelTemperature = (
  temperature: number | undefined
): number | undefined => {
  if (!isCurrentModelTemperatureEnabled()) return undefined
  if (Number.isFinite(temperature) && typeof temperature === 'number') {
    return Math.max(0, Math.min(2, temperature))
  }
  return DEFAULT_MODEL_TEMPERATURE
}

export const resolveCurrentModelTemperatureOptions = (
  temperature: number | undefined
): { temperature?: number } => {
  const resolvedTemperature = resolveCurrentModelTemperature(temperature)
  return resolvedTemperature === undefined ? {} : { temperature: resolvedTemperature }
}

export const resolveCurrentModelThinkingParameterMode = (): ThinkingParameterMode => {
  return (
    getCurrentModelTemperatureControl()?.thinkingParameterMode || DEFAULT_THINKING_PARAMETER_MODE
  )
}
