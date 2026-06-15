import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'

describe('session detail editor guides store', () => {
  beforeEach(() => {
    useSessionDetailUiStore.getState().resetForSessionChange()
  })

  it('keeps guides isolated by page and allows repositioning them', () => {
    const store = useSessionDetailUiStore.getState()

    store.addEditorGuide('page-1', 'vertical', 320.04)
    store.addEditorGuide('page-1', 'horizontal', 180)
    store.addEditorGuide('page-2', 'vertical', 640)
    store.moveEditorGuide('page-1', 'vertical', 0, 400.06)
    store.removeEditorGuide('page-1', 'horizontal', 0)

    expect(useSessionDetailUiStore.getState().editorGuidesByPage).toEqual({
      'page-1': { vertical: [400.1], horizontal: [] },
      'page-2': { vertical: [640], horizontal: [] }
    })
  })

  it('resets transient ruler and grid state when leaving the session', () => {
    const store = useSessionDetailUiStore.getState()
    store.setEditorSnapEnabled(false)
    store.setEditorGridVisible(true)
    store.setEditorGridSize(32)
    store.addEditorGuide('page-1', 'vertical', 320)

    useSessionDetailUiStore.getState().resetForSessionChange()

    expect(useSessionDetailUiStore.getState()).toMatchObject({
      editorSnapEnabled: true,
      editorGridVisible: false,
      editorGridSize: 20,
      editorGuidesByPage: {}
    })
  })
})
