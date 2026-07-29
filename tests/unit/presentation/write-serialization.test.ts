import { describe, expect, it } from 'vitest'
import { serializedWrite } from '../../../src/main/presentation/html/write-serialization'

describe('serializedWrite', () => {
  it('orders writes for one resource and releases the next write after a failure', async () => {
    const events: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = serializedWrite('deck-a', async () => {
      events.push('first:start')
      await firstGate
      events.push('first:fail')
      throw new Error('expected')
    })
    const second = serializedWrite('deck-a', async () => {
      events.push('second:start')
      return 'second:done'
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    releaseFirst?.()
    await expect(first).rejects.toThrow('expected')
    await expect(second).resolves.toBe('second:done')
    expect(events).toEqual(['first:start', 'first:fail', 'second:start'])
  })

  it('does not serialize different presentation resources', async () => {
    const events: string[] = []
    await Promise.all([
      serializedWrite('deck-a', async () => events.push('a')),
      serializedWrite('deck-b', async () => events.push('b'))
    ])
    expect(events).toHaveLength(2)
  })
})
