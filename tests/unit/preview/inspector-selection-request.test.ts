import { describe, expect, it } from 'vitest'
import { isCurrentInspectorSelectionRequest } from '../../../src/renderer/src/components/preview/PreviewIframe'

describe('isCurrentInspectorSelectionRequest', () => {
  it('rejects a selection after inspector teardown or an interaction-mode change', () => {
    expect(
      isCurrentInspectorSelectionRequest({
        requestId: 4,
        latestRequestId: 4,
        isInspectorActive: true,
        selectionInteractionMode: 'ai-inspect',
        currentInteractionMode: 'ai-inspect'
      })
    ).toBe(true)

    expect(
      isCurrentInspectorSelectionRequest({
        requestId: 4,
        latestRequestId: 5,
        isInspectorActive: false,
        selectionInteractionMode: 'ai-inspect',
        currentInteractionMode: 'preview'
      })
    ).toBe(false)

    expect(
      isCurrentInspectorSelectionRequest({
        requestId: 4,
        latestRequestId: 4,
        isInspectorActive: true,
        selectionInteractionMode: 'ai-inspect',
        currentInteractionMode: 'animation-select'
      })
    ).toBe(false)
  })
})
