import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('agent-runtime public entry', () => {
  it('exposes only lightweight coordination primitives from the root entry', () => {
    const source = fs.readFileSync(path.resolve('src/main/agent-runtime/index.ts'), 'utf8')
    const exports = Array.from(source.matchAll(/export \* from '([^']+)'/g)).map((match) => match[1])

    expect(exports).toEqual([
      './types',
      './lock/keys',
      './job/coordinator',
      './job/types',
      './events/bus',
      './events/envelope'
    ])
  })
})
