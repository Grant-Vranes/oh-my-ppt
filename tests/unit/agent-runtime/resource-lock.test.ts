import { describe, expect, it, vi } from 'vitest'
import { ResourceLock } from '../../../src/main/agent-runtime/lock/resource-lock'

describe('ResourceLock', () => {
  it('shares reads and blocks writers until every reader releases', async () => {
    const lock = new ResourceLock()
    const readerOne = await lock.acquire({ read: ['session:1'] }, { ownerToken: Symbol('reader-1'), wait: 'block' })
    const readerTwo = await lock.acquire({ read: ['session:1'] }, { ownerToken: Symbol('reader-2'), wait: 'block' })
    if (!readerOne || !readerTwo) throw new Error('expected read leases')

    let writerGranted = false
    const writer = lock.acquire(
      { write: ['session:1'] },
      { ownerToken: Symbol('writer'), wait: 'block' }
    )
    writer.then(() => {
      writerGranted = true
    })

    await Promise.resolve()
    expect(writerGranted).toBe(false)

    readerOne()
    await Promise.resolve()
    expect(writerGranted).toBe(false)

    readerTwo()
    const writerRelease = await writer
    expect(writerRelease).toBeTypeOf('function')
    writerRelease?.()
  })

  it('normalizes duplicate keys and treats a read/write claim as a write', async () => {
    const lock = new ResourceLock()
    const lease = await lock.acquire(
      { read: ['session:1', 'session:1'], write: ['session:1', 'session:1'] },
      { ownerToken: Symbol('writer'), wait: 'block' }
    )
    if (!lease) throw new Error('expected write lease')

    await expect(
      lock.acquire({ read: ['session:1'] }, { ownerToken: Symbol('reader'), wait: 'fail' })
    ).resolves.toBeNull()

    lease()
  })

  it('uses a global queue: unrelated work bypasses a blocked multi-key claim', async () => {
    const lock = new ResourceLock()
    const held = await lock.acquire({ write: ['resource:b'] }, { ownerToken: Symbol('held'), wait: 'block' })
    if (!held) throw new Error('expected held lease')

    const multiKey = lock.acquire(
      { write: ['resource:a', 'resource:b'] },
      { ownerToken: Symbol('multi-key'), wait: 'block' }
    )
    const unrelated = await lock.acquire(
      { write: ['resource:c'] },
      { ownerToken: Symbol('unrelated'), wait: 'block' }
    )
    if (!unrelated) throw new Error('expected unrelated lease to bypass')

    unrelated()
    held()
    const multiKeyRelease = await multiKey
    expect(multiKeyRelease).toBeTypeOf('function')
    multiKeyRelease?.()
  })

  it('does not let a later waiter cross any key of an earlier blocked multi-key claim', async () => {
    const lock = new ResourceLock()
    const held = await lock.acquire(
      { write: ['resource:b'] },
      { ownerToken: Symbol('held-b'), wait: 'block' }
    )
    if (!held) throw new Error('expected held lease')

    const multiKey = lock.acquire(
      { write: ['resource:a', 'resource:b'] },
      { ownerToken: Symbol('multi-key'), wait: 'block' }
    )
    let laterGranted = false
    const laterA = lock.acquire(
      { write: ['resource:a'] },
      { ownerToken: Symbol('later-a'), wait: 'block' }
    )
    laterA.then(() => {
      laterGranted = true
    })

    await Promise.resolve()
    expect(laterGranted).toBe(false)

    held()
    const multiKeyRelease = await multiKey
    expect(laterGranted).toBe(false)
    multiKeyRelease?.()

    const laterARelease = await laterA
    laterARelease?.()
  })

  it('does not let a later reader bypass an earlier writer for the same key', async () => {
    const lock = new ResourceLock()
    const initialReader = await lock.acquire(
      { read: ['session:1'] },
      { ownerToken: Symbol('initial-reader'), wait: 'block' }
    )
    if (!initialReader) throw new Error('expected initial reader lease')

    const writer = lock.acquire(
      { write: ['session:1'] },
      { ownerToken: Symbol('writer'), wait: 'block' }
    )
    let laterReaderGranted = false
    const laterReader = lock.acquire(
      { read: ['session:1'] },
      { ownerToken: Symbol('later-reader'), wait: 'block' }
    )
    laterReader.then(() => {
      laterReaderGranted = true
    })

    initialReader()
    const writerRelease = await writer
    expect(laterReaderGranted).toBe(false)
    writerRelease?.()

    const laterReaderRelease = await laterReader
    expect(laterReaderRelease).toBeTypeOf('function')
    laterReaderRelease?.()
  })

  it('removes an aborted waiter and drains remaining work', async () => {
    const lock = new ResourceLock()
    const held = await lock.acquire({ write: ['session:1'] }, { ownerToken: Symbol('held'), wait: 'block' })
    if (!held) throw new Error('expected held lease')

    const controller = new AbortController()
    const aborted = lock.acquire(
      { write: ['session:1'] },
      { ownerToken: Symbol('aborted'), signal: controller.signal, wait: 'block' }
    )
    controller.abort()

    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    held()

    const next = await lock.acquire({ write: ['session:1'] }, { ownerToken: Symbol('next'), wait: 'block' })
    expect(next).toBeTypeOf('function')
    next?.()
  })

  it('rejects nested claims for the same owner and makes release idempotent', async () => {
    const lock = new ResourceLock()
    const ownerToken = Symbol('owner')
    const lease = await lock.acquire({ write: ['session:1'] }, { ownerToken, wait: 'block' })
    if (!lease) throw new Error('expected lease')

    await expect(lock.acquire({ write: ['session:2'] }, { ownerToken, wait: 'block' })).rejects.toThrow(
      'does not support nested claims'
    )

    lease()
    lease()

    const next = await lock.acquire({ write: ['session:1'] }, { ownerToken, wait: 'block' })
    next?.()
  })

  it('treats an earlier conflicting waiter as busy for fail-fast claims', async () => {
    const lock = new ResourceLock()
    const held = await lock.acquire({ write: ['session:1'] }, { ownerToken: Symbol('held'), wait: 'block' })
    if (!held) throw new Error('expected held lease')

    const waiting = lock.acquire(
      { write: ['session:1'] },
      { ownerToken: Symbol('waiting'), wait: 'block' }
    )
    await expect(
      lock.acquire({ read: ['session:1'] }, { ownerToken: Symbol('fail-fast'), wait: 'fail' })
    ).resolves.toBeNull()

    held()
    const waitingRelease = await waiting
    waitingRelease?.()
  })
})
