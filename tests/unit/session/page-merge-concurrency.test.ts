import { describe, expect, it } from 'vitest'
import {
  mapPageMergeConcurrent,
  PAGE_MERGE_PREPARE_CONCURRENCY
} from '../../../src/main/ipc/session/page-merge-concurrency'

describe('page merge concurrency', () => {
  it('keeps prepare concurrency within the configured limit and preserves result order', async () => {
    let active = 0
    let peak = 0
    const result = await mapPageMergeConcurrent(
      Array.from({ length: 12 }, (_, index) => index),
      async (item) => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return item * 2
      }
    )

    expect(peak).toBe(PAGE_MERGE_PREPARE_CONCURRENCY)
    expect(peak).toBeLessThanOrEqual(4)
    expect(result).toEqual(Array.from({ length: 12 }, (_, index) => index * 2))
  })
})
