export const sessionLockKey = (sessionId: string): string => `session:${sessionId}`

export const imageHistoryLockKey = (owner: string): string => `image-history:${owner}`

export const styleLockKey = (styleId: string): string => `style:${styleId}`
