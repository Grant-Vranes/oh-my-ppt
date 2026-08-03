import { describe, expect, it } from 'vitest'
import {
  buildMasterStyleLink,
  ensureMasterStyleLink,
  hasUniqueMasterStyleLink,
  isMasterElementsDisabled,
  setMasterElementsDisabled,
  setMasterPageNumber
} from '../../../src/main/presentation/html/master-link'

describe('slide master page link', () => {
  it('builds the canonical marked stylesheet link', () => {
    expect(buildMasterStyleLink()).toBe(
      '<link rel="stylesheet" href="./master/master.css" data-ppt-master="1">'
    )
  })

  it('normalizes marked and canonical duplicate links at the end of head', () => {
    const normalized = ensureMasterStyleLink(`<!doctype html>
      <html><head>
        <link rel="stylesheet" href="master/master.css">
        <style data-ppt-fonts="1">:root { --ppt-body-font: Test; }</style>
        <link rel="stylesheet" href="./master/master.css" data-ppt-master="1">
        <style>.page { color: red; }</style>
      </head><body>slide</body></html>`)

    expect(hasUniqueMasterStyleLink(normalized)).toBe(true)
    expect(normalized.match(/master\.css/g)).toHaveLength(1)
    expect(normalized.lastIndexOf('data-ppt-master="1"')).toBeGreaterThan(
      normalized.lastIndexOf('.page { color: red; }')
    )
  })

  it('persists page numbers and a page-scoped global-elements override on both shell anchors', () => {
    const numbered = setMasterPageNumber(
      '<html><head></head><body><main class="ppt-page-root" data-ppt-guard-root="1"></main></body></html>',
      3
    )
    expect(numbered).toContain('data-ppt-page-number="3"')
    const disabled = setMasterElementsDisabled(numbered, true)
    expect(isMasterElementsDisabled(disabled)).toBe(true)
    expect(setMasterElementsDisabled(disabled, false)).not.toContain('data-ppt-master-off')
  })
})
