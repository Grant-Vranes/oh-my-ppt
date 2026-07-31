import { ipcMain } from 'electron'
import {
  MASTER_BACKGROUND_MODES,
  MASTER_BACKGROUND_STYLES,
  MASTER_FONT_PRESETS,
  MASTER_GRADIENT_TYPES,
  MAX_MASTER_BODY_FONT_SIZE,
  MAX_MASTER_TITLE_FONT_SIZE,
  MAX_MASTER_GRADIENT_STOPS,
  MIN_MASTER_BODY_FONT_SIZE,
  MIN_MASTER_TITLE_FONT_SIZE,
  MIN_MASTER_GRADIENT_STOPS,
  normalizeMasterConfig,
  type SessionMasterConfig
} from '@shared/master'
import type { IpcContext } from '../ipc/context'
import { getSessionMasterStatus, saveSessionMaster } from './master-mutation-service'

const getPayload = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isValidGradientStop = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.color === 'string' &&
  /^#[0-9a-fA-F]{6}$/.test(value.color) &&
  typeof value.position === 'number' &&
  Number.isFinite(value.position) &&
  value.position >= 0 &&
  value.position <= 100

const isValidGradient = (value: unknown): boolean => {
  if (!isRecord(value)) return false
  if (!MASTER_GRADIENT_TYPES.includes(value.type as (typeof MASTER_GRADIENT_TYPES)[number]))
    return false
  if (
    typeof value.angle !== 'number' ||
    !Number.isFinite(value.angle) ||
    value.angle < 0 ||
    value.angle > 359
  ) {
    return false
  }
  if (!Array.isArray(value.stops)) return false
  return (
    value.stops.length >= MIN_MASTER_GRADIENT_STOPS &&
    value.stops.length <= MAX_MASTER_GRADIENT_STOPS &&
    value.stops.every(isValidGradientStop)
  )
}

const requireSessionId = (value: unknown): string => {
  const sessionId = typeof value === 'string' ? value.trim() : ''
  if (!sessionId) throw new Error('缺少 sessionId')
  return sessionId
}

const isValidBackgroundImage = (value: unknown): boolean => {
  if (value === undefined || value === null) return true
  if (typeof value !== 'string') return false
  const imagePath = value.trim()
  const fileName = imagePath.slice('./images/'.length)
  return (
    imagePath.startsWith('./images/') &&
    fileName.length > 0 &&
    fileName !== '.' &&
    fileName !== '..' &&
    !fileName.includes('/') &&
    !fileName.includes('\\') &&
    !fileName.includes('\0')
  )
}

const requireMasterConfig = (value: unknown): SessionMasterConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('母版配置无效')
  }
  const input = value as Record<string, unknown>
  const isValidFontFamily = (font: unknown): boolean =>
    font === undefined ||
    font === null ||
    (typeof font === 'string' && font.trim().length > 0 && font.trim().length <= 120)
  const isValidFontSize = (fontSize: unknown, min: number, max: number): boolean =>
    fontSize === undefined ||
    fontSize === null ||
    (typeof fontSize === 'number' &&
      Number.isInteger(fontSize) &&
      Number.isFinite(fontSize) &&
      fontSize >= min &&
      fontSize <= max)
  if (
    typeof input.backgroundColor !== 'string' ||
    !/^#[0-9a-fA-F]{6}$/.test(input.backgroundColor.trim()) ||
    typeof input.backgroundMode !== 'string' ||
    !MASTER_BACKGROUND_MODES.includes(
      input.backgroundMode as SessionMasterConfig['backgroundMode']
    ) ||
    typeof input.backgroundStyle !== 'string' ||
    !MASTER_BACKGROUND_STYLES.includes(
      input.backgroundStyle as SessionMasterConfig['backgroundStyle']
    ) ||
    !isValidGradient(input.backgroundGradient) ||
    !isValidBackgroundImage(input.backgroundImage) ||
    (input.backgroundStyle === 'image' && typeof input.backgroundImage !== 'string') ||
    typeof input.titleFontPreset !== 'string' ||
    !MASTER_FONT_PRESETS.includes(
      input.titleFontPreset as SessionMasterConfig['titleFontPreset']
    ) ||
    typeof input.bodyFontPreset !== 'string' ||
    !MASTER_FONT_PRESETS.includes(input.bodyFontPreset as SessionMasterConfig['bodyFontPreset']) ||
    !isValidFontFamily(input.titleFontFamily) ||
    !isValidFontFamily(input.bodyFontFamily) ||
    !isValidFontSize(input.titleFontSize, MIN_MASTER_TITLE_FONT_SIZE, MAX_MASTER_TITLE_FONT_SIZE) ||
    !isValidFontSize(input.bodyFontSize, MIN_MASTER_BODY_FONT_SIZE, MAX_MASTER_BODY_FONT_SIZE)
  ) {
    throw new Error('母版配置无效')
  }
  return normalizeMasterConfig(input)
}

export function registerMasterHandlers(ctx: IpcContext): void {
  ipcMain.handle('session:getMaster', async (_event, payload: unknown) => {
    const { sessionId } = getPayload(payload)
    return getSessionMasterStatus(ctx, requireSessionId(sessionId))
  })

  ipcMain.handle('session:saveMaster', async (_event, payload: unknown) => {
    const { sessionId, config } = getPayload(payload)
    return saveSessionMaster(ctx, requireSessionId(sessionId), requireMasterConfig(config))
  })
}
