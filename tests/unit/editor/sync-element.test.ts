import { describe, expect, it } from 'vitest'
import { applySyncElementToPageHtml, SYNC_ELEMENT_ATTR } from '../../../src/main/ipc/editor/sync-element'

const pageHtml = (body: string): string => `
<!doctype html>
<html>
  <body data-page-id="page-1">
    <main data-role="content">${body}</main>
  </body>
</html>
`

describe('applySyncElementToPageHtml', () => {
  it('adds a stable sync element id when applying an element for the first time', () => {
    const result = applySyncElementToPageHtml({
      html: pageHtml('<h1>Title</h1>'),
      sourceHtmlFragment:
        '<img src="./assets/logo.png" data-block-id="select-arcsin1-source" style="position:absolute; left:12px; top:20px; width:88px; height:32px;" />',
      preserveSourceBlockId: 'select-arcsin1-source'
    })

    expect(result.inserted).toBe(true)
    expect(result.syncElementId).toMatch(/^sync-/)
    expect(result.html).toContain(`${SYNC_ELEMENT_ATTR}="${result.syncElementId}"`)
    expect(result.html).toContain('data-block-id="select-arcsin1-source"')
    expect(result.html).toContain('left:12px')
  })

  it('updates an existing synced element while preserving that page block id', () => {
    const result = applySyncElementToPageHtml({
      html: pageHtml(
        '<img src="./assets/old.png" data-block-id="select-arcsin1-target" data-ppt-sync-element-id="sync-brand" style="position:absolute; left:1px; top:2px;" />'
      ),
      sourceHtmlFragment:
        '<img src="./assets/new.png" data-block-id="select-arcsin1-source" data-ppt-sync-element-id="sync-brand" style="position:absolute; left:40px; top:50px; width:120px;" />'
    })

    expect(result.updated).toBe(true)
    expect(result.inserted).toBe(false)
    expect(result.syncElementId).toBe('sync-brand')
    expect(result.html).toContain('src="./assets/new.png"')
    expect(result.html).toContain('data-block-id="select-arcsin1-target"')
    expect(result.html).toContain('left:40px')
    expect(result.html).not.toContain('./assets/old.png')
  })
})
