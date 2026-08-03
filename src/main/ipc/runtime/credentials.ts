import { safeStorage } from 'electron'
import log from 'electron-log/main.js'

const ENCRYPTED_API_KEY_PREFIX = 'enc:v1:'

export type RuntimeCredentials = {
  encryptApiKey(apiKey: string): string
  decryptApiKey(rawValue: unknown): string
}

export function createRuntimeCredentials(): RuntimeCredentials {
  const encryptApiKey = (apiKey: string): string => {
    const trimmed = apiKey.trim()
    if (trimmed.length === 0) return ''
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[settings] safeStorage unavailable, fallback to plaintext api key storage')
      return trimmed
    }
    try {
      const encrypted = safeStorage.encryptString(trimmed).toString('base64')
      return `${ENCRYPTED_API_KEY_PREFIX}${encrypted}`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('[settings] api key encrypt failed', { message })
      throw new Error('API Key 加密失败，请检查系统钥匙串状态后重试。')
    }
  }

  const decryptApiKey = (rawValue: unknown): string => {
    if (typeof rawValue !== 'string') return ''
    const raw = rawValue.trim()
    if (!raw) return ''
    if (!raw.startsWith(ENCRYPTED_API_KEY_PREFIX)) return raw
    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[settings] safeStorage unavailable, cannot decrypt encrypted api key')
      return ''
    }
    try {
      const encrypted = raw.slice(ENCRYPTED_API_KEY_PREFIX.length)
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.error('[settings] api key decrypt failed', { message })
      return ''
    }
  }

  return { encryptApiKey, decryptApiKey }
}
