import { describe, expect, it } from 'vitest'
import { localAssetUrl } from '../../../src/shared/local-asset'

describe('localAssetUrl', () => {
  it('encodes Windows absolute paths without turning the drive into the URL host', () => {
    expect(localAssetUrl('C:\\Users\\Chan\\thumbnail.png')).toBe(
      'local-asset://C%3A%5CUsers%5CChan%5Cthumbnail.png'
    )
  })

  it('encodes URI delimiters in asset paths', () => {
    expect(localAssetUrl('/tmp/a?#.png')).toBe('local-asset://%2Ftmp%2Fa%3F%23.png')
  })
})
