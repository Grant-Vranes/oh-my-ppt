import { describe, expect, it } from 'vitest'
import {
  isDeckEditGenerationEvent,
  isPageBeautifyGenerationEvent,
  isPageEditGenerationEvent
} from '../../../src/renderer/src/components/session-detail/shared/pageEditGenerationEvent'

describe('isPageEditGenerationEvent', () => {
  it('does not claim an untagged event before the backend attaches an activity marker', () => {
    expect(
      isPageEditGenerationEvent(
        { runId: 'page-edit-run', activityKind: undefined },
        { runId: undefined }
      )
    ).toBe(false)
  })

  it('does not take over chunks for a different run after the page job is identified', () => {
    expect(
      isPageEditGenerationEvent(
        { runId: 'other-run', activityKind: undefined },
        { runId: 'page-edit-run' }
      )
    ).toBe(false)
  })

  it('recognizes the backend page-edit activity marker without an in-memory job', () => {
    expect(
      isPageEditGenerationEvent({ runId: 'page-edit-run', activityKind: 'page-edit' }, null)
    ).toBe(true)
  })

  it('recognizes deck-edit events without routing them to the shared generation dialog', () => {
    expect(
      isDeckEditGenerationEvent({ runId: 'deck-edit-run', activityKind: 'deck-edit' }, null)
    ).toBe(true)
  })

  it('recognizes page-beautify events only for its dedicated activity or run', () => {
    expect(
      isPageBeautifyGenerationEvent({ runId: 'beautify-run', activityKind: 'page-beautify' }, null)
    ).toBe(true)
    expect(
      isPageBeautifyGenerationEvent(
        { runId: 'other-run', activityKind: undefined },
        { runId: 'beautify-run' }
      )
    ).toBe(false)
  })
})
