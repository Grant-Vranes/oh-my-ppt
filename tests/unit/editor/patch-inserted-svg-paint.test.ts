import { describe, expect, it } from 'vitest'
import { patchGenericElementProperties } from '../../../src/main/ipc/editor/shared'
import {
  buildIconElementHtml,
  buildShapeElementHtml
} from '../../../src/renderer/src/components/session-detail/workspace/insert-shapes'

describe('patchGenericElementProperties inserted svg paint', () => {
  it('writes background color edits to inserted shape fill and stroke', () => {
    const html = `
      <body data-page-id="page">
        <main class="ppt-page-root" data-ppt-guard-root="1">
          ${buildShapeElementHtml({
            blockId: 'select-arcsin1-shape0001',
            left: 10,
            top: 20,
            width: 100,
            height: 80,
            zIndex: 3,
            type: 'rounded-rect'
          })}
        </main>
      </body>
    `

    const next = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="select-arcsin1-shape0001"]',
      { style: { backgroundColor: '#ff3366' } }
    )

    expect(next).toContain('fill="#ff3366"')
    expect(next).toContain('stroke="#ff3366"')
    expect(next).not.toContain('background-color: #ff3366')
  })

  it('writes background color edits to inserted icon currentColor host', () => {
    const html = `
      <body data-page-id="page">
        <main class="ppt-page-root" data-ppt-guard-root="1">
          ${buildIconElementHtml({
            blockId: 'select-arcsin1-icon00001',
            iconId: 'lightbulb',
            left: 10,
            top: 20,
            width: 80,
            height: 80,
            zIndex: 3
          })}
        </main>
      </body>
    `

    const next = patchGenericElementProperties(
      html,
      'body[data-page-id="page"] [data-block-id="select-arcsin1-icon00001"]',
      { style: { backgroundColor: '#3366ff' } }
    )

    expect(next).toContain('color: #3366ff')
    expect(next).not.toContain('background-color: #3366ff')
  })
})
