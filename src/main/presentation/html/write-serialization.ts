const writeLocks = new Map<string, Promise<void>>()

/**
 * Serializes async writes per presentation resource. The operation itself stays
 * with its caller; this module only guarantees ordering and releases the lock
 * after either success or failure.
 */
export function serializedWrite<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  const chain = writeLocks.get(lockKey) || Promise.resolve()
  const run = chain.then(fn)
  const next = run.then(
    () => undefined,
    () => undefined
  )
  writeLocks.set(lockKey, next)
  return run.finally(() => {
    if (writeLocks.get(lockKey) === next) writeLocks.delete(lockKey)
  })
}
