import { describe, expect, it } from 'vitest'
import { extractRemoteRuntimeResources } from '../../../src/main/presentation/html/resource-policy'

describe('slide runtime resource policy', () => {
  it('finds only remote script and stylesheet resources', () => {
    expect(
      extractRemoteRuntimeResources(
        '<script src="https://cdn.example/app.js"></script><link href="//cdn.example/app.css" rel="stylesheet" /><img src="https://cdn.example/image.png" />'
      )
    ).toEqual([
      '<script src="https://cdn.example/app.js">',
      '<link href="//cdn.example/app.css" rel="stylesheet" />'
    ])
  })

  it('caps diagnostic output without rejecting local presentation assets', () => {
    const remoteScripts = Array.from(
      { length: 10 },
      (_, index) => `<script src="https://cdn.example/${index}.js"></script>`
    ).join('')
    expect(extractRemoteRuntimeResources('<script src="./assets/ppt-runtime.js"></script>')).toEqual([])
    expect(extractRemoteRuntimeResources(remoteScripts)).toHaveLength(8)
  })
})
