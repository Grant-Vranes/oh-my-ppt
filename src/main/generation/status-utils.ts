import type { SessionStatus } from '../db/schema'

export const normalizeRestoredSessionStatus = (status: unknown): SessionStatus =>
  status === 'completed' || status === 'failed' || status === 'archived' ? status : 'active'

export const isCancellationMessage = (message: string): boolean =>
  /^(生成已取消|Generation cancelled|Generation canceled)$/i.test(message.trim())
