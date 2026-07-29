export type RuntimeDomain = 'generation' | 'image' | 'style' | 'edit'

export type RuntimeOwner = {
  sessionId?: string
  styleId?: string
  imageHistoryOwner?: string
}

export type RuntimeAudience =
  | { kind: 'owner' }
  | { kind: 'requester'; subscriberId: string }
  | { kind: 'broadcast' }
