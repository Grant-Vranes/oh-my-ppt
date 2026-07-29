import { describe, expect, it } from 'vitest'
import type { PresentationElementSnapshot } from '@arcsin1/presentation-editor-runtime'
import { buildSelectedElementRuntimeContext } from '../../../src/renderer/src/lib/presentation-element-context'

describe('buildSelectedElementRuntimeContext', () => {
  it('keeps useful editable state while excluding editor and executable attributes', () => {
    const context = buildSelectedElementRuntimeContext({
      classList: ['metric-card', 'arcsin1-presentation-editor-selected', 'ppt-inspector-highlight'],
      attributes: {
        id: 'revenue',
        'data-block-id': 'revenue-card',
        'aria-label': 'Revenue',
        onclick: 'alert(1)',
        style: 'color:red',
        'data-arcsin1-presentation-editor-selected': 'true'
      },
      inlineStyle: {
        color: { value: 'rgb(10, 20, 30)', priority: '' },
        'border-radius': { value: '12px', priority: 'important' }
      },
      computedStyle: {
        display: 'flex',
        'font-size': '28px',
        cursor: 'pointer'
      },
      bounds: { x: 14.321, y: 28.765, width: 320.999, height: 96.555 }
    } as PresentationElementSnapshot)

    expect(context.classList).toEqual(['metric-card'])
    expect(context.attributes).toEqual({
      id: 'revenue',
      'data-block-id': 'revenue-card',
      'aria-label': 'Revenue'
    })
    expect(context.inlineStyle).toEqual({
      color: { value: 'rgb(10, 20, 30)', priority: '' },
      'border-radius': { value: '12px', priority: 'important' }
    })
    expect(context.computedStyle).toEqual({ display: 'flex', 'font-size': '28px' })
    expect(context.bounds).toEqual({ x: 14.32, y: 28.77, width: 321, height: 96.56 })
  })

  it('matches the main-process contract for empty fields and bounded geometry', () => {
    expect(
      buildSelectedElementRuntimeContext({
        classList: ['ppt-inspector-highlight'],
        attributes: { onclick: 'ignore' },
        inlineStyle: {},
        computedStyle: { cursor: 'pointer' },
        bounds: { x: -999_999, y: 999_999, width: -20, height: 999_999 }
      } as PresentationElementSnapshot)
    ).toEqual({
      bounds: { x: -100_000, y: 100_000, width: 0, height: 100_000 }
    })
  })
})
