import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// These source-level assertions are intentionally narrow guardrails for ruler/guide wiring.
// Full pointer interaction coverage would require a browser-backed render test for the webview stage.
describe('preview stage ruler directions', () => {
  it('creates a perpendicular guide where the ruler is clicked', () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'src/renderer/src/components/session-detail/preview/EditorGuidesOverlay.tsx'
      ),
      'utf8'
    )

    expect(source).toContain("onClick={(event) => addGuideFromRuler('vertical', event)}")
    expect(source).toContain("onClick={(event) => addGuideFromRuler('horizontal', event)}")
    expect(source).toContain("removeEditorGuide(selectedPageId, 'vertical', index)")
    expect(source).toContain("removeEditorGuide(selectedPageId, 'horizontal', index)")
  })

  it('keeps guide drag commits tied to the page where dragging started', () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'src/renderer/src/components/session-detail/preview/EditorGuidesOverlay.tsx'
      ),
      'utf8'
    )

    expect(source).toContain('pageId: selectedPageId')
    expect(source).toContain('removeEditorGuide(current.pageId, axis, current.index)')
    expect(source).toContain(
      'moveEditorGuide(current.pageId, axis, current.index, current.position)'
    )
  })

  it('does not create a guide from clicks outside the ruler canvas span', () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'src/renderer/src/components/session-detail/preview/EditorGuidesOverlay.tsx'
      ),
      'utf8'
    )

    expect(source).toContain(
      'const rawPosition = rawPositionFromPointer(axis, event.clientX, event.clientY)'
    )
    expect(source).toContain('if (isGuideOutsideCanvas(axis, rawPosition)) return')
    expect(source).toContain(
      'addEditorGuide(selectedPageId, axis, snapGuidePosition(axis, rawPosition))'
    )
  })
})
