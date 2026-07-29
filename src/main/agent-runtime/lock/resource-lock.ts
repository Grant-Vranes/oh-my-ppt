export type ResourceClaims = {
  read?: readonly string[]
  write?: readonly string[]
}

export type NormalizedResourceClaims = {
  read: readonly string[]
  write: readonly string[]
}

export type ResourceLockWaitPolicy = 'block' | 'fail'

export type ResourceLockAcquireOptions = {
  ownerToken: symbol
  signal?: AbortSignal
  wait: ResourceLockWaitPolicy
}

export type ReleaseFunc = () => void

type Waiter = {
  claims: NormalizedResourceClaims
  ownerToken: symbol
  resolve: (release: ReleaseFunc) => void
  reject: (error: Error) => void
  removeAbortListener: () => void
}

const normalizeKeys = (keys: readonly string[] | undefined): string[] => {
  const normalized = new Set<string>()
  for (const key of keys || []) {
    const value = key.trim()
    if (!value) throw new Error('Resource claim key must not be empty')
    normalized.add(value)
  }
  return [...normalized]
}

export const normalizeResourceClaims = (claims: ResourceClaims): NormalizedResourceClaims => {
  const write = normalizeKeys(claims.write)
  const writeKeys = new Set(write)
  const read = normalizeKeys(claims.read).filter((key) => !writeKeys.has(key))
  return { read, write }
}

const intersects = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length === 0 || right.length === 0) return false
  const rightKeys = new Set(right)
  return left.some((key) => rightKeys.has(key))
}

export const resourceClaimsConflict = (left: ResourceClaims, right: ResourceClaims): boolean => {
  const normalizedLeft = normalizeResourceClaims(left)
  const normalizedRight = normalizeResourceClaims(right)
  return (
    intersects(normalizedLeft.write, normalizedRight.write) ||
    intersects(normalizedLeft.write, normalizedRight.read) ||
    intersects(normalizedLeft.read, normalizedRight.write)
  )
}

export const createAbortError = (): Error => {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * Reader/writer lock for complete resource claim sets. A waiter either receives every requested
 * key or none of them; there is intentionally no public partial-acquire API.
 */
export class ResourceLock {
  private readonly readersByKey = new Map<string, Set<symbol>>()
  private readonly writerByKey = new Map<string, symbol>()
  private readonly ownerStates = new Map<symbol, 'waiting' | 'active'>()
  private readonly waiters: Waiter[] = []

  async acquire(
    claims: ResourceClaims,
    options: ResourceLockAcquireOptions
  ): Promise<ReleaseFunc | null> {
    const normalizedClaims = normalizeResourceClaims(claims)
    if (options.signal?.aborted) throw createAbortError()
    if (this.ownerStates.has(options.ownerToken)) {
      throw new Error('ResourceLock does not support nested claims for the same owner')
    }

    if (options.wait === 'fail') {
      if (this.hasActiveConflict(normalizedClaims) || this.hasWaitingConflict(normalizedClaims)) {
        return null
      }
      return this.grant(normalizedClaims, options.ownerToken)
    }

    return new Promise<ReleaseFunc>((resolve, reject) => {
      let waiter: Waiter
      const removeAbortListener = (): void => {
        options.signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = (): void => {
        const waiterIndex = this.waiters.indexOf(waiter)
        if (waiterIndex === -1) return
        this.waiters.splice(waiterIndex, 1)
        this.ownerStates.delete(options.ownerToken)
        removeAbortListener()
        reject(createAbortError())
        this.drain()
      }

      waiter = {
        claims: normalizedClaims,
        ownerToken: options.ownerToken,
        resolve,
        reject,
        removeAbortListener
      }
      this.ownerStates.set(options.ownerToken, 'waiting')
      this.waiters.push(waiter)
      options.signal?.addEventListener('abort', onAbort, { once: true })
      this.drain()
    })
  }

  /**
   * Immediate all-or-nothing acquisition used by the compatibility adapter
   * while legacy IPC handlers still expose synchronous busy responses.
   */
  tryAcquire(
    claims: ResourceClaims,
    options: Omit<ResourceLockAcquireOptions, 'wait'>
  ): ReleaseFunc | null {
    const normalizedClaims = normalizeResourceClaims(claims)
    if (options.signal?.aborted) throw createAbortError()
    if (this.ownerStates.has(options.ownerToken)) {
      throw new Error('ResourceLock does not support nested claims for the same owner')
    }
    if (this.hasActiveConflict(normalizedClaims) || this.hasWaitingConflict(normalizedClaims)) {
      return null
    }
    return this.grant(normalizedClaims, options.ownerToken)
  }

  private hasActiveConflict(claims: NormalizedResourceClaims): boolean {
    return (
      claims.write.some(
        (key) => this.writerByKey.has(key) || (this.readersByKey.get(key)?.size || 0) > 0
      ) || claims.read.some((key) => this.writerByKey.has(key))
    )
  }

  private hasWaitingConflict(claims: NormalizedResourceClaims): boolean {
    return this.waiters.some((waiter) => resourceClaimsConflict(claims, waiter.claims))
  }

  private drain(): void {
    const earlierBlockedClaims: NormalizedResourceClaims[] = []

    for (let index = 0; index < this.waiters.length; ) {
      const waiter = this.waiters[index]
      const blockedByActive = this.hasActiveConflict(waiter.claims)
      const blockedByEarlierWaiter = earlierBlockedClaims.some((claims) =>
        resourceClaimsConflict(waiter.claims, claims)
      )

      if (blockedByActive || blockedByEarlierWaiter) {
        earlierBlockedClaims.push(waiter.claims)
        index += 1
        continue
      }

      this.waiters.splice(index, 1)
      waiter.removeAbortListener()
      waiter.resolve(this.grant(waiter.claims, waiter.ownerToken))
    }
  }

  private grant(claims: NormalizedResourceClaims, ownerToken: symbol): ReleaseFunc {
    this.ownerStates.set(ownerToken, 'active')
    for (const key of claims.write) {
      this.writerByKey.set(key, ownerToken)
    }
    for (const key of claims.read) {
      const readers = this.readersByKey.get(key) || new Set<symbol>()
      readers.add(ownerToken)
      this.readersByKey.set(key, readers)
    }

    let released = false
    return () => {
      if (released) return
      released = true

      for (const key of claims.write) {
        if (this.writerByKey.get(key) === ownerToken) this.writerByKey.delete(key)
      }
      for (const key of claims.read) {
        const readers = this.readersByKey.get(key)
        if (!readers) continue
        readers.delete(ownerToken)
        if (readers.size === 0) this.readersByKey.delete(key)
      }
      this.ownerStates.delete(ownerToken)
      this.drain()
    }
  }
}
