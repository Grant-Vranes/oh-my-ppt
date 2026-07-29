import { describe, expect, it } from 'vitest'
import {
  createDefaultDesignContract,
  normalizeDesignContract,
  resolveDesignContract
} from '../../../src/main/presentation/design-contract'

describe('presentation design contract', () => {
  it('uses presentation defaults for invalid persisted values', () => {
    expect(normalizeDesignContract('not-json')).toEqual(createDefaultDesignContract())
  })

  it('normalizes persisted text and uses defaults for an incomplete palette', () => {
    const fallback = createDefaultDesignContract()

    expect(
      normalizeDesignContract({
        theme: '  editorial\n deck  ',
        palette: [' #111 ', '', ' #222 '],
        titleFont: '  Source Han Sans  '
      })
    ).toEqual({
      ...fallback,
      theme: 'editorial deck',
      titleFont: 'Source Han Sans'
    })
  })

  it('marks missing or non-canonical persisted contracts for persistence', () => {
    const defaultContract = createDefaultDesignContract()

    expect(resolveDesignContract(null)).toEqual({
      contract: defaultContract,
      shouldPersist: true
    })
    expect(resolveDesignContract(JSON.stringify(defaultContract))).toEqual({
      contract: defaultContract,
      shouldPersist: false
    })
    expect(resolveDesignContract({ ...defaultContract, titleFont: '  Inter  ' })).toEqual({
      contract: defaultContract,
      shouldPersist: true
    })
  })
})
