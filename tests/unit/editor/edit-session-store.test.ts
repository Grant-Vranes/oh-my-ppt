import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => {
  const fn = (() => '') as unknown as {
    success: () => string
    error: () => string
    info: () => string
    warning: () => string
    loading: () => string
    promise: () => void
    dismiss: () => void
  }
  fn.success = fn
  fn.error = fn
  fn.info = fn
  fn.warning = fn
  fn.loading = fn
  fn.promise = () => {}
  fn.dismiss = () => {}
  return { toast: fn }
})

vi.mock('../../../src/renderer/src/lib/ipc', () => ({
  ipc: {
    saveEditBatch: vi.fn(async () => ({
      success: true,
      dragCount: 0,
      textCount: 0,
      propertyCount: 0,
      deleteCount: 0,
      addCount: 0
    }))
  }
}))

import { ipc } from '../../../src/renderer/src/lib/ipc'
import { useEditSessionStore } from '../../../src/renderer/src/store/editSessionStore'
import { useEditHistoryStore } from '../../../src/renderer/src/store/editHistoryStore'
import type { EditSelectionPayload } from '../../../src/renderer/src/components/preview/edit-mode-script'
import type { PreviewIframeHandle } from '../../../src/renderer/src/components/preview/PreviewIframe'

const PAGE_ID = 'page-1'
const HTML_PATH = '/tmp/page.html'
const SESSION_ID = 'session-1'
const SELECTOR = 'body[data-page-id="page-1"] [data-block-id="b1"]'

type Layout = Awaited<ReturnType<PreviewIframeHandle['readElementLayout']>>

function primeStore(
  readLayout: () => Promise<NonNullable<Layout>>,
  overrides: Partial<PreviewIframeHandle> = {}
): void {
  useEditSessionStore.getState().setIframeHandle({
    readElementLayout: readLayout,
    readElementHtml: async () => '',
    restoreEditModeSelection: async () => true,
    clearEditModeSelection: () => {},
    hideElement: () => {},
    injectElement: () => {},
    applyDragStyle: () => {},
    applyZIndex: () => {},
    applyChildUpdates: () => {},
    liveUpdateElement: () => {},
    applyElementProperties: () => {},
    ...overrides
  } as unknown as PreviewIframeHandle)
  useEditSessionStore.getState().attach({
    t: ((key: string) => key) as never,
    requestRefresh: () => {},
    bumpThumbnail: () => {},
    getPageContext: () => ({ pageId: PAGE_ID, htmlPath: HTML_PATH, sessionId: SESSION_ID })
  })
}

// Minimal selection whose only field flush reads is snapshot.metrics.page (the
// page-relative position recorded at selection time, used as the movement baseline).
const makeSelection = (baseline: { x: number; y: number }): EditSelectionPayload =>
  ({
    selector: SELECTOR,
    label: SELECTOR,
    elementTag: '',
    elementText: '',
    isText: false,
    style: {},
    translateX: 0,
    translateY: 0,
    snapshot: {
      selector: SELECTOR,
      metrics: {
        page: { x: baseline.x, y: baseline.y, width: 100, height: 100 },
        viewport: { x: baseline.x, y: baseline.y, width: 100, height: 100 },
        translateX: 0,
        translateY: 0
      }
    }
  } as unknown as EditSelectionPayload)

describe('editSessionStore flush barrier (drag-twice-then-save)', () => {
  beforeEach(() => {
    useEditHistoryStore.getState().clear()
    useEditSessionStore.getState().reset()
  })

  it('flushPendingDrags overwrites a stale dragEdit with the live second position', async () => {
    primeStore(async () => ({ isAbsoluteMode: false, x: 250, y: 320, width: 200, height: 80 }))
    const editHistory = useEditHistoryStore.getState()
    editHistory.upsertDragEdit({
      pageId: PAGE_ID,
      htmlPath: HTML_PATH,
      selector: SELECTOR,
      x: 100,
      y: 100,
      width: null,
      height: null,
      childUpdates: [],
      isAbsoluteMode: false
    })

    await useEditSessionStore.getState().flushPendingDrags()

    const snapshot = editHistory.getSnapshotForPage(PAGE_ID)
    expect(snapshot.dragEdits).toHaveLength(1)
    expect(snapshot.dragEdits[0].x).toBe(250)
    expect(snapshot.dragEdits[0].y).toBe(320)
  })

  it('flushPendingDrags preserves existing childUpdates', async () => {
    primeStore(async () => ({ isAbsoluteMode: false, x: 10, y: 10, width: 100, height: 100 }))
    const editHistory = useEditHistoryStore.getState()
    editHistory.upsertDragEdit({
      pageId: PAGE_ID,
      htmlPath: HTML_PATH,
      selector: SELECTOR,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      childUpdates: [{ path: [0, 1], width: 50, height: 30 }],
      isAbsoluteMode: false
    })

    await useEditSessionStore.getState().flushPendingDrags()

    const snapshot = editHistory.getSnapshotForPage(PAGE_ID)
    expect(snapshot.dragEdits[0].childUpdates).toEqual([{ path: [0, 1], width: 50, height: 30 }])
  })

  it('flushPendingDrags does not inject a size into a pure drag edit', async () => {
    primeStore(async () => ({ isAbsoluteMode: false, x: 5, y: 5, width: 999, height: 999 }))
    const editHistory = useEditHistoryStore.getState()
    editHistory.upsertDragEdit({
      pageId: PAGE_ID,
      htmlPath: HTML_PATH,
      selector: SELECTOR,
      x: 0,
      y: 0,
      width: null,
      height: null,
      childUpdates: [],
      isAbsoluteMode: false
    })

    await useEditSessionStore.getState().flushPendingDrags()

    const drag = editHistory.getSnapshotForPage(PAGE_ID).dragEdits[0]
    expect(drag.x).toBe(5)
    expect(drag.y).toBe(5)
    expect(drag.width).toBeNull()
    expect(drag.height).toBeNull()
  })

  it('flushPendingDrags refreshes size for a resize edit', async () => {
    primeStore(async () => ({ isAbsoluteMode: false, x: 5, y: 5, width: 333, height: 222 }))
    const editHistory = useEditHistoryStore.getState()
    editHistory.upsertDragEdit({
      pageId: PAGE_ID,
      htmlPath: HTML_PATH,
      selector: SELECTOR,
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      childUpdates: [],
      isAbsoluteMode: false
    })

    await useEditSessionStore.getState().flushPendingDrags()

    const drag = editHistory.getSnapshotForPage(PAGE_ID).dragEdits[0]
    expect(drag.width).toBe(333)
    expect(drag.height).toBe(222)
  })

  it('flushPendingDrags keeps existing size when read-back returns zero', async () => {
    primeStore(async () => ({ isAbsoluteMode: false, x: 5, y: 5, width: 0, height: 0 }))
    const editHistory = useEditHistoryStore.getState()
    editHistory.upsertDragEdit({
      pageId: PAGE_ID,
      htmlPath: HTML_PATH,
      selector: SELECTOR,
      x: 0,
      y: 0,
      width: 120,
      height: 90,
      childUpdates: [],
      isAbsoluteMode: false
    })

    await useEditSessionStore.getState().flushPendingDrags()

    const drag = editHistory.getSnapshotForPage(PAGE_ID).dragEdits[0]
    expect(drag.width).toBe(120)
    expect(drag.height).toBe(90)
  })
})

describe('editSessionStore drag-then-resize-then-save (same element)', () => {
  beforeEach(() => {
    useEditHistoryStore.getState().clear()
    useEditSessionStore.getState().reset()
    vi.mocked(ipc.saveEditBatch).mockClear()
  })

  it('flushPendingDrags keeps the post-resize position for one element dragged then resized', async () => {
    // After drag+resize the live DOM reports the post-resize layout.
    primeStore(async () => ({ isAbsoluteMode: false, x: 120, y: 100, width: 200, height: 150 }))
    const editHistory = useEditHistoryStore.getState()
    // 1) handleMoved for the drag: x/y set, size null
    useEditSessionStore.getState().handleMoved({
      selector: SELECTOR,
      x: 100,
      y: 100,
      deltaX: 100,
      deltaY: 100,
      layoutMode: 'translate'
    } as unknown as Parameters<typeof useEditSessionStore.getState>['handleMoved'][0])
    // 2) handleMoved for the resize on the same selector: x shifts (W handle), width/height set
    useEditSessionStore.getState().handleMoved({
      selector: SELECTOR,
      x: 120,
      y: 100,
      deltaX: 20,
      deltaY: 0,
      layoutMode: 'translate',
      width: 200,
      height: 150,
      childUpdates: []
    } as unknown as Parameters<typeof useEditSessionStore.getState>['handleMoved'][0])

    await useEditSessionStore.getState().flushPendingDrags()

    const dragEdits = editHistory.getSnapshotForPage(PAGE_ID).dragEdits
    expect(dragEdits).toHaveLength(1)
    expect(dragEdits[0]).toMatchObject({
      selector: SELECTOR,
      x: 120,
      y: 100,
      width: 200,
      height: 150
    })
  })

  it('save persists the post-resize position to disk for one element dragged then resized', async () => {
    primeStore(async () => ({ isAbsoluteMode: false, x: 120, y: 100, width: 200, height: 150 }))
    useEditSessionStore.getState().handleMoved({
      selector: SELECTOR,
      x: 100,
      y: 100,
      deltaX: 100,
      deltaY: 100,
      layoutMode: 'translate'
    } as unknown as Parameters<typeof useEditSessionStore.getState>['handleMoved'][0])
    useEditSessionStore.getState().handleMoved({
      selector: SELECTOR,
      x: 120,
      y: 100,
      deltaX: 20,
      deltaY: 0,
      layoutMode: 'translate',
      width: 200,
      height: 150,
      childUpdates: []
    } as unknown as Parameters<typeof useEditSessionStore.getState>['handleMoved'][0])

    const result = await useEditSessionStore.getState().save()

    expect(result.saved).toBe(true)
    expect(vi.mocked(ipc.saveEditBatch)).toHaveBeenCalledWith(
      expect.objectContaining({
        dragEdits: expect.arrayContaining([
          expect.objectContaining({ selector: SELECTOR, x: 120, y: 100, width: 200, height: 150 })
        ])
      })
    )
  })
})

describe('editSessionStore save re-entry guard', () => {
  beforeEach(() => {
    useEditHistoryStore.getState().clear()
    useEditSessionStore.getState().reset()
  })

  it('locks isSavingEdits before the flush await and blocks a concurrent save', async () => {
    primeStore(async () => ({ isAbsoluteMode: false, x: 1, y: 1, width: 1, height: 1 }))

    const first = useEditSessionStore.getState().save()
    expect(useEditSessionStore.getState().isSavingEdits).toBe(true)

    const second = await useEditSessionStore.getState().save()
    expect(second.saved).toBe(false)

    await first
    expect(useEditSessionStore.getState().isSavingEdits).toBe(false)
  })
})

describe('editSessionStore flush captures an in-flight first drag (P1: drag-once-then-save)', () => {
  beforeEach(() => {
    useEditHistoryStore.getState().clear()
    useEditSessionStore.getState().reset()
    vi.mocked(ipc.saveEditBatch).mockClear()
  })

  it('captures the selected element when it has moved from its selection baseline', async () => {
    // DOM reports the element moved to visualX=250; selection baseline was x=0.
    primeStore(async () => ({
      isAbsoluteMode: false,
      x: 250,
      y: 0,
      width: 100,
      height: 100,
      visualX: 250,
      visualY: 0
    }))
    useEditSessionStore.setState({ selection: makeSelection({ x: 0, y: 0 }) })
    const editHistory = useEditHistoryStore.getState()

    await useEditSessionStore.getState().flushPendingDrags()

    const drags = editHistory.getSnapshotForPage(PAGE_ID).dragEdits
    expect(drags).toHaveLength(1)
    expect(drags[0].selector).toBe(SELECTOR)
    expect(drags[0].x).toBe(250)
    // A pure drag must not inject a size.
    expect(drags[0].width).toBeNull()
    expect(drags[0].height).toBeNull()
  })

  it('captures the selected element when its first in-flight edit is a resize', async () => {
    // DOM reports the element stayed at the same visual position but resized.
    primeStore(async () => ({
      isAbsoluteMode: false,
      x: 0,
      y: 0,
      width: 150,
      height: 120,
      visualX: 0,
      visualY: 0
    }))
    useEditSessionStore.setState({ selection: makeSelection({ x: 0, y: 0 }) })
    const editHistory = useEditHistoryStore.getState()

    await useEditSessionStore.getState().flushPendingDrags()

    const drags = editHistory.getSnapshotForPage(PAGE_ID).dragEdits
    expect(drags).toHaveLength(1)
    expect(drags[0]).toMatchObject({
      selector: SELECTOR,
      x: 0,
      y: 0,
      width: 150,
      height: 120
    })
  })

  it('does not capture when the selection has not moved', async () => {
    primeStore(async () => ({
      isAbsoluteMode: false,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      visualX: 0,
      visualY: 0
    }))
    useEditSessionStore.setState({ selection: makeSelection({ x: 0, y: 0 }) })

    await useEditSessionStore.getState().flushPendingDrags()

    expect(useEditHistoryStore.getState().getSnapshotForPage(PAGE_ID).dragEdits).toHaveLength(0)
  })

  it('does not double-capture a selector already covered by a pending dragEdit', async () => {
    primeStore(async () => ({
      isAbsoluteMode: false,
      x: 250,
      y: 0,
      width: 100,
      height: 100,
      visualX: 250,
      visualY: 0
    }))
    useEditSessionStore.setState({ selection: makeSelection({ x: 0, y: 0 }) })
    const editHistory = useEditHistoryStore.getState()
    editHistory.upsertDragEdit({
      pageId: PAGE_ID,
      htmlPath: HTML_PATH,
      selector: SELECTOR,
      x: 100,
      y: 0,
      width: null,
      height: null,
      childUpdates: [],
      isAbsoluteMode: false
    })

    await useEditSessionStore.getState().flushPendingDrags()

    const drags = editHistory.getSnapshotForPage(PAGE_ID).dragEdits
    expect(drags).toHaveLength(1)
    // The existing dragEdit was flushed (overwritten with live DOM x=250), not duplicated.
    expect(drags[0].x).toBe(250)
  })

  it('skips a selection whose selector is pending deletion', async () => {
    primeStore(async () => ({
      isAbsoluteMode: false,
      x: 250,
      y: 0,
      width: 100,
      height: 100,
      visualX: 250,
      visualY: 0
    }))
    useEditSessionStore.setState({ selection: makeSelection({ x: 0, y: 0 }) })
    const editHistory = useEditHistoryStore.getState()
    editHistory.addDelete({ pageId: PAGE_ID, htmlPath: HTML_PATH, selector: SELECTOR })

    await useEditSessionStore.getState().flushPendingDrags()

    expect(editHistory.getSnapshotForPage(PAGE_ID).dragEdits).toHaveLength(0)
  })

  it('restores the selected element after replaying pending edits', () => {
    const restoreEditModeSelection = vi.fn(async () => true)
    primeStore(
      async () => ({ isAbsoluteMode: false, x: 0, y: 0, width: 100, height: 100 }),
      { restoreEditModeSelection }
    )
    useEditSessionStore.setState({ selection: makeSelection({ x: 0, y: 0 }) })

    useEditSessionStore.getState().replayPending()

    expect(restoreEditModeSelection).toHaveBeenCalledWith(SELECTOR)
  })

  it('save persists the in-flight first drag to disk instead of dropping it', async () => {
    primeStore(async () => ({
      isAbsoluteMode: false,
      x: 250,
      y: 0,
      width: 100,
      height: 100,
      visualX: 250,
      visualY: 0
    }))
    useEditSessionStore.setState({ selection: makeSelection({ x: 0, y: 0 }) })
    // No pending dragEdit: the first `moved` is still in flight across the save.

    const result = await useEditSessionStore.getState().save()

    expect(result.saved).toBe(true)
    // The in-flight drag was captured and written...
    expect(vi.mocked(ipc.saveEditBatch)).toHaveBeenCalledWith(
      expect.objectContaining({
        dragEdits: expect.arrayContaining([
          expect.objectContaining({ selector: SELECTOR, x: 250 })
        ])
      })
    )
    // ...then markPageSaved cleared the page.
    expect(useEditHistoryStore.getState().getSnapshotForPage(PAGE_ID).dragEdits).toHaveLength(0)
  })

  it('save persists an in-flight first resize to disk instead of dropping it', async () => {
    primeStore(async () => ({
      isAbsoluteMode: false,
      x: 0,
      y: 0,
      width: 150,
      height: 120,
      visualX: 0,
      visualY: 0
    }))
    useEditSessionStore.setState({ selection: makeSelection({ x: 0, y: 0 }) })
    // No pending dragEdit: the first resize `moved` is still in flight across the save.

    const result = await useEditSessionStore.getState().save()

    expect(result.saved).toBe(true)
    expect(vi.mocked(ipc.saveEditBatch)).toHaveBeenCalledWith(
      expect.objectContaining({
        dragEdits: expect.arrayContaining([
          expect.objectContaining({ selector: SELECTOR, width: 150, height: 120 })
        ])
      })
    )
    expect(useEditHistoryStore.getState().getSnapshotForPage(PAGE_ID).dragEdits).toHaveLength(0)
  })
})

describe('editSessionStore formula edits', () => {
  beforeEach(() => {
    useEditHistoryStore.getState().clear()
    useEditSessionStore.getState().reset()
  })

  it('commits formula changes as property edits', () => {
    const liveUpdateElement = vi.fn()
    primeStore(
      async () => ({ isAbsoluteMode: false, x: 0, y: 0, width: 100, height: 100 }),
      { liveUpdateElement }
    )
    useEditSessionStore.getState().selectElement({
      selector: SELECTOR,
      label: 'Formula',
      elementTag: 'div',
      elementText: '',
      kind: 'formula',
      capabilities: ['layout', 'layer', 'appearance', 'formula'],
      isText: false,
      text: '',
      style: {},
      translateX: 0,
      translateY: 0,
      snapshot: {
        selector: SELECTOR,
        label: 'Formula',
        elementTag: 'div',
        elementText: '',
        kind: 'formula',
        capabilities: ['layout', 'layer', 'appearance', 'formula'],
        metrics: {
          page: { x: 0, y: 0, width: 100, height: 100 },
          viewport: { x: 0, y: 0, width: 100, height: 100 },
          translateX: 0,
          translateY: 0
        },
        computed: {},
        inline: {},
        attrs: {},
        formula: {
          latex: 'x^2',
          html: '<span class="katex">old</span>',
          displayMode: false
        }
      }
    } as unknown as EditSelectionPayload)

    useEditSessionStore.getState().updateDraft(
      {
        ...useEditSessionStore.getState().draft,
        formulaLatex: 'x^3',
        formulaHtml: '<span class="katex">new</span>',
        formulaDisplayMode: false
      },
      { commit: true, fields: ['formulaLatex', 'formulaHtml', 'formulaDisplayMode'] }
    )

    const snapshot = useEditHistoryStore.getState().getSnapshotForPage(PAGE_ID)
    expect(liveUpdateElement).toHaveBeenCalledWith(
      SELECTOR,
      expect.objectContaining({
        formula: expect.objectContaining({ latex: 'x^3', html: '<span class="katex">new</span>' })
      })
    )
    expect(snapshot.propertyEdits).toHaveLength(1)
    expect(snapshot.propertyEdits[0].patch.formula).toMatchObject({
      latex: 'x^3',
      html: '<span class="katex">new</span>',
      displayMode: false,
      originalLatex: 'x^2'
    })
  })
})
