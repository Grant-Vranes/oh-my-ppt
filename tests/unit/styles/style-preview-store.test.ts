import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipcState = vi.hoisted(() => ({
  generateStylePreview: vi.fn()
}))

vi.mock('@renderer/lib/ipc', () => ({
  ipc: ipcState
}))

describe('useStylePreviewStore', () => {
  beforeEach(async () => {
    vi.resetModules()
    ipcState.generateStylePreview.mockReset()
  })

  it('keeps the running style across consumers and prevents duplicate generation', async () => {
    let finishGeneration: (() => void) | undefined
    ipcState.generateStylePreview.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishGeneration = resolve
        })
    )
    const { useStylePreviewStore } = await import(
      '../../../src/renderer/src/store/stylePreviewStore'
    )

    const firstRun = useStylePreviewStore.getState().generatePreview('paper-story')
    expect(useStylePreviewStore.getState().generatingStyleId).toBe('paper-story')
    await expect(
      useStylePreviewStore.getState().generatePreview('another-style')
    ).resolves.toBe(false)
    expect(ipcState.generateStylePreview).toHaveBeenCalledOnce()

    finishGeneration?.()
    await expect(firstRun).resolves.toBe(true)
    expect(useStylePreviewStore.getState()).toMatchObject({
      generatingStyleId: '',
      completionVersion: 1
    })
  })

  it('refreshes style data after a failed generation attempt', async () => {
    ipcState.generateStylePreview.mockRejectedValue(new Error('thumbnail failed'))
    const { useStylePreviewStore } = await import(
      '../../../src/renderer/src/store/stylePreviewStore'
    )

    await expect(
      useStylePreviewStore.getState().generatePreview('paper-story')
    ).rejects.toThrow('thumbnail failed')

    expect(useStylePreviewStore.getState()).toMatchObject({
      generatingStyleId: '',
      completionVersion: 1
    })
  })
})
