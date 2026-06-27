import { describe, expect, it } from 'vitest'
import {
  parseElementAnimationConfig,
  patchElementAnimationConfig
} from '../../../src/main/animation/element-animation'
import {
  validateDataAnimContract,
  validateDataAnimPatch
} from '../../../src/main/animation/data-anim-validator'

const selector = '[data-block-id="target"]'

function page(targetAttributes = '', sibling = ''): string {
  return `<!doctype html><html><body><main data-page-id="page-1"><div data-block-id="target" ${targetAttributes}>Target</div>${sibling}</main></body></html>`
}

describe('element animation patcher', () => {
  it('reads no animation as null', () => {
    expect(parseElementAnimationConfig(page(), selector)).toBeNull()
  })

  it('sets a declarative animation and preserves valid advanced timing', () => {
    const source = page(
      'data-anim="fade" data-anim-trigger="after" data-anim-sequence="with" data-anim-delay="80" data-anim-stagger="90" data-anim-duration="450"'
    )
    const result = patchElementAnimationConfig(source, selector, { type: 'fade-up' })

    expect(result.changed).toBe(true)
    expect(result.config).toMatchObject({
      type: 'fade-up',
      trigger: 'after',
      sequence: 'with',
      delay: '80',
      staggerMs: 90,
      durationMs: 450
    })
  })

  it('removes the full element animation contract when disabled', () => {
    const source = page(
      'data-anim="path" data-anim-trigger="click" data-anim-click-group="step-1" data-anim-duration="600" data-anim-path="M 0 0 L 120 30" data-anim-easing="linear"'
    )
    const result = patchElementAnimationConfig(source, selector, { type: null })

    expect(result.config).toBeNull()
    expect(result.html).not.toContain('data-anim')
  })

  it('removes path and direction attributes when switching to a non-directional type', () => {
    const source = page(
      'data-anim="path" data-anim-path="M 0 0 L 120 30" data-anim-from="left"'
    )
    const result = patchElementAnimationConfig(source, selector, { type: 'pulse' })

    expect(result.html).toContain('data-anim="pulse"')
    expect(result.html).not.toContain('data-anim-path')
    expect(result.html).not.toContain('data-anim-from')
  })

  it('normalizes automatic and click trigger transitions', () => {
    const automatic = page(
      'data-anim="fade-up" data-anim-trigger="after" data-anim-sequence="with"'
    )
    const click = patchElementAnimationConfig(automatic, selector, { trigger: 'click' })
    expect(click.config).toMatchObject({ trigger: 'click' })
    expect(click.html).not.toContain('data-anim-sequence')

    const groupedClick = page(
      'data-anim="fade-up" data-anim-trigger="click" data-anim-click-group="step-1"'
    )
    const load = patchElementAnimationConfig(groupedClick, selector, { trigger: 'load' })
    expect(load.config).toMatchObject({ trigger: 'load' })
    expect(load.html).not.toContain('data-anim-trigger')
    expect(load.html).not.toContain('data-anim-click-group')
  })

  it('keeps a no-op patch unchanged', () => {
    const source = page('data-anim="fade-up" data-anim-duration="600"')
    const result = patchElementAnimationConfig(source, selector, { durationMs: 600 })
    expect(result.changed).toBe(false)
    expect(result.html).toBe(source)
  })

  it('rejects invalid values and ambiguous selectors', () => {
    expect(() =>
      patchElementAnimationConfig(page('data-anim="fade"'), selector, {
        durationMs: 80
      })
    ).toThrow('100-5000ms')
    expect(() =>
      patchElementAnimationConfig(
        page('', '<div data-block-id="target">Duplicate</div>'),
        selector,
        { type: 'fade' }
      )
    ).toThrow('命中多个目标')
  })

  it('reads legacy PowerPoint trigger aliases without failing', () => {
    const onClick = page('data-anim="fade" data-anim-trigger="on-click"')
    expect(parseElementAnimationConfig(onClick, selector)?.trigger).toBe('click')
    const afterPrevious = page('data-anim="fade" data-anim-trigger="after-previous"')
    expect(parseElementAnimationConfig(afterPrevious, selector)?.trigger).toBe('after')
    const withPrevious = page('data-anim="fade" data-anim-trigger="with-previous"')
    expect(parseElementAnimationConfig(withPrevious, selector)?.trigger).toBe('with')
  })
})

describe('data animation contract validation', () => {
  it('allows automatic and click animations on the same page', () => {
    const result = validateDataAnimContract(`
      <div data-anim="fade-up">Automatic</div>
      <div data-anim="exit-fade" data-anim-trigger="click">Click</div>
    `)
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects sequence on click and non-contiguous click groups', () => {
    const sequence = validateDataAnimContract(
      '<div data-anim="fade" data-anim-trigger="click" data-anim-sequence="after">A</div>'
    )
    expect(sequence.errors.join('\n')).toContain('data-anim-sequence 仅用于自动动画顺序')

    const groups = validateDataAnimContract(`
      <div data-anim="fade" data-anim-trigger="click" data-anim-click-group="step">A</div>
      <div data-anim="fade" data-anim-trigger="click">B</div>
      <div data-anim="fade" data-anim-trigger="click" data-anim-click-group="step">C</div>
    `)
    expect(groups.errors.join('\n')).toContain('data-anim-click-group 必须在 click 动画的 DOM 顺序上连续出现')
  })
})

describe('element animation edit validation scoping', () => {
  it('does not block a targeted edit when a sibling already violates the contract', () => {
    // Sibling carries a pre-existing runtime-only easing, unrelated to this edit.
    const before = page(
      '',
      '<div data-anim="fade" data-anim-easing="easeOutCubic">Sibling</div>'
    )
    const result = patchElementAnimationConfig(before, selector, { type: 'pulse' })

    expect(result.changed).toBe(true)
    expect(result.html).toContain('data-anim="pulse"')
    // The sibling's pre-existing easing appears in both before and after, so it cancels.
    expect(validateDataAnimPatch(before, result.html).newErrors).toEqual([])
  })

  it('still flags contract violations newly introduced on the target', () => {
    const before = page('data-anim="fade"')
    // Simulate the patch introducing an illegal type on the target.
    const after = page('data-anim="not-a-real-type"')
    const { newErrors } = validateDataAnimPatch(before, after)
    expect(newErrors.some((error) => error.includes('not-a-real-type'))).toBe(true)
  })

  it('flags page-level click-group continuity violations introduced by a target edit', () => {
    const before = `
      <div data-block-id="target" data-anim="fade" data-anim-trigger="click" data-anim-click-group="step">A</div>
      <div data-block-id="middle" data-anim="fade" data-anim-trigger="click" data-anim-click-group="step">B</div>
      <div data-block-id="tail" data-anim="fade" data-anim-trigger="click" data-anim-click-group="step">C</div>
    `
    const after = `
      <div data-block-id="target" data-anim="fade" data-anim-trigger="click" data-anim-click-group="step">A</div>
      <div data-block-id="middle" data-anim="fade" data-anim-trigger="click">B</div>
      <div data-block-id="tail" data-anim="fade" data-anim-trigger="click" data-anim-click-group="step">C</div>
    `
    const { newErrors } = validateDataAnimPatch(before, after)
    expect(newErrors.join('\n')).toContain('data-anim-click-group 必须在 click 动画的 DOM 顺序上连续出现')
  })
})
