import { describe, expect, it } from 'vitest'
import {
  getSvgPathBounds,
  renderOoxmlPresetShapePath
} from '@arcsin1/pptx-ooxml-geometry'

describe('PPTX geometry package integration', () => {
  it('resolves the shared OOXML geometry dependency used by the importer', () => {
    expect(getSvgPathBounds('M 10 20 h 30 v 40 z')).toEqual({
      minX: 10,
      minY: 20,
      width: 30,
      height: 40
    })
    expect(renderOoxmlPresetShapePath('hexagon', 120, 80)).toContain('L 120 40')
  })
})
