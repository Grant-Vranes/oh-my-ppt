import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  cleanupHtmlEditor: vi.fn()
}))

vi.mock('../../../src/renderer/src/lib/ipc', () => ({
  ipc: {
    cleanupHtmlEditor: state.cleanupHtmlEditor
  }
}))

import { useHtmlEditorStore } from '../../../src/renderer/src/store/htmlEditorStore'

const documentOne = {
  id: 'hedit-1',
  title: 'Landing page',
  sourcePath: '/tmp/landing.html',
  htmlPath: '/tmp/landing/current.html',
  designWidth: 1280,
  updatedAt: 1,
  thumbnailPath: null
}

const documentTwo = {
  ...documentOne,
  id: 'hedit-2',
  title: 'Pricing page'
}

describe('html editor document library', () => {
  beforeEach(() => {
    state.cleanupHtmlEditor.mockReset()
    useHtmlEditorStore.setState({
      docId: 'hedit-1',
      title: documentOne.title,
      htmlPath: documentOne.htmlPath,
      sourcePath: documentOne.sourcePath,
      designWidth: documentOne.designWidth,
      html: '<html></html>',
      importing: false,
      exporting: false,
      error: null,
      documents: [documentOne, documentTwo]
    })
  })

  afterEach(() => {
    useHtmlEditorStore.getState().reset()
  })

  it('removes only the requested document from the library after database cleanup succeeds', async () => {
    state.cleanupHtmlEditor.mockResolvedValue({ ok: true })

    await expect(useHtmlEditorStore.getState().removeDocument('hedit-1')).resolves.toBe(true)

    expect(state.cleanupHtmlEditor).toHaveBeenCalledWith({ docId: 'hedit-1' })
    expect(useHtmlEditorStore.getState()).toMatchObject({
      docId: null,
      htmlPath: null,
      sourcePath: null,
      html: '',
      documents: [documentTwo]
    })
  })

  it('keeps the document in the library when database cleanup fails', async () => {
    state.cleanupHtmlEditor.mockResolvedValue({ ok: false })

    await expect(useHtmlEditorStore.getState().removeDocument('hedit-1')).resolves.toBe(false)

    expect(useHtmlEditorStore.getState().documents).toEqual([documentOne, documentTwo])
  })
})
