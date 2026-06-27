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

import { resetSessionDetailEditingStores } from '../../../src/renderer/src/store/sessionDetailEditingReset'
import { useEditHistoryStore } from '../../../src/renderer/src/store/editHistoryStore'
import { useEditSessionStore } from '../../../src/renderer/src/store/editSessionStore'
import { useSessionDetailUiStore } from '../../../src/renderer/src/store/sessionDetailStore'
import type { PreviewIframeHandle } from '../../../src/renderer/src/components/preview/PreviewIframe'

describe('session detail editing reset', () => {
  beforeEach(() => {
    useEditHistoryStore.getState().clear()
    useEditSessionStore.getState().reset()
    useSessionDetailUiStore.getState().resetForSessionChange()
  })

  it('clears editor stores after a history rollback replaces page files', () => {
    const clearEditModeSelection = vi.fn()
    useEditSessionStore.setState({
      iframeHandle: {
        clearEditModeSelection
      } as unknown as PreviewIframeHandle,
      selection: {
        selector: 'body[data-page-id="page-1"] [data-block-id="b1"]'
      } as never
    })
    useEditHistoryStore.getState().addElement({
      pageId: 'page-1',
      htmlPath: '/tmp/page.html',
      parentSelector: 'body[data-page-id="page-1"] [data-ppt-guard-root="1"]',
      htmlFragment: '<p data-block-id="added">Added</p>',
      assignedBlockId: 'added',
      insertIndex: -1
    })
    useSessionDetailUiStore.setState({
      interactionMode: 'edit',
      workspaceTab: 'edit',
      editorSnapEnabled: false,
      editorGridVisible: true,
      editorGridSize: 48,
      editorGuidesByPage: {
        'page-1': { vertical: [320], horizontal: [180] }
      },
      selectedSelector: '[data-block-id="b1"]',
      editSelectedSelector: '[data-block-id="b1"]',
      selectorLabel: 'b1',
      elementTag: 'p',
      elementText: 'text',
      pendingAssets: [{ id: 'asset-1' }] as never,
      assetDragActive: true,
      assetPickerOpen: true,
      speechScriptDialogOpen: true
    })

    resetSessionDetailEditingStores()

    expect(clearEditModeSelection).toHaveBeenCalledTimes(1)
    expect(useEditHistoryStore.getState().hasPendingEdits('page-1')).toBe(false)
    expect(useEditHistoryStore.getState().canUndo('page-1')).toBe(false)
    expect(useEditSessionStore.getState().selection).toBeNull()
    expect(useSessionDetailUiStore.getState()).toMatchObject({
      interactionMode: 'preview',
      workspaceTab: 'preview',
      editorSnapEnabled: true,
      editorGridVisible: false,
      editorGridSize: 20,
      editorGuidesByPage: {},
      selectedSelector: null,
      editSelectedSelector: null,
      selectorLabel: '',
      elementTag: '',
      elementText: '',
      pendingAssets: [],
      assetDragActive: false,
      assetPickerOpen: false,
      speechScriptDialogOpen: false
    })
  })

  it('keeps the active workspace tab when page-scoped selection state resets', () => {
    useSessionDetailUiStore.setState({
      interactionMode: 'edit',
      workspaceTab: 'browse',
      selectedSelector: '[data-block-id="b1"]',
      editSelectedSelector: '[data-block-id="b1"]',
      selectorLabel: 'b1',
      elementTag: 'p',
      elementText: 'text'
    })

    useSessionDetailUiStore.getState().resetForPageChange()

    expect(useSessionDetailUiStore.getState()).toMatchObject({
      interactionMode: 'preview',
      workspaceTab: 'browse',
      selectedSelector: null,
      editSelectedSelector: null,
      selectorLabel: '',
      elementTag: '',
      elementText: ''
    })
  })

  it('keeps the animation workspace while clearing its page-scoped target', () => {
    useSessionDetailUiStore.setState({
      interactionMode: 'animation-select',
      workspaceTab: 'animation',
      selectedSelector: '[data-block-id="metric"]',
      selectorLabel: 'metric'
    })

    useSessionDetailUiStore.getState().resetForPageChange()

    expect(useSessionDetailUiStore.getState()).toMatchObject({
      interactionMode: 'preview',
      workspaceTab: 'animation',
      selectedSelector: null,
      selectorLabel: ''
    })
  })
})
