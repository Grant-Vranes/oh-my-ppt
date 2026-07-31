import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  getStatus: vi.fn(),
  save: vi.fn(),
  setPageOverride: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      state.handlers.set(name, handler)
  }
}))

vi.mock('../../../src/main/session/master-mutation-service', () => ({
  getSessionMasterStatus: state.getStatus,
  saveSessionMaster: state.save,
  setSessionMasterPageOverride: state.setPageOverride
}))

describe('registerMasterHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    state.handlers.clear()
    state.getStatus.mockReset()
    state.save.mockReset()
    state.setPageOverride.mockReset()
  })

  it('registers typed handlers and rejects malformed structured config', async () => {
    const { registerMasterHandlers } = await import('../../../src/main/session/master-handlers')
    const ctx = {} as never
    registerMasterHandlers(ctx)

    const get = state.handlers.get('session:getMaster')
    const save = state.handlers.get('session:saveMaster')
    const setPageOverride = state.handlers.get('session:setMasterPageOverride')
    expect(get).toBeTypeOf('function')
    expect(save).toBeTypeOf('function')
    expect(setPageOverride).toBeTypeOf('function')
    expect(state.handlers.has('session:applyMasterToPages')).toBe(false)

    await get?.({}, { sessionId: ' session-1 ' })
    expect(state.getStatus).toHaveBeenCalledWith(ctx, 'session-1')

    await expect(
      save?.({}, { sessionId: 'session-1', config: { backgroundColor: 'red' } })
    ).rejects.toThrow('母版配置无效')
    await save?.(
      {},
      {
        sessionId: 'session-1',
        config: {
          backgroundColor: '#112233',
          backgroundMode: 'override',
          backgroundStyle: 'gradient',
          backgroundGradient: {
            type: 'linear',
            angle: 135,
            stops: [
              { color: '#112233', position: 0 },
              { color: '#ffffff', position: 100 }
            ]
          },
          backgroundImage: null,
          titleFontPreset: 'serif',
          bodyFontPreset: 'sans',
          titleFontFamily: 'Noto Sans SC',
          bodyFontFamily: null,
          titleFontSize: 56,
          bodyFontSize: null,
          elements: {
            logoImage: null,
            footerText: '',
            watermarkText: '',
            showPageNumber: true
          }
        }
      }
    )
    expect(state.save).toHaveBeenCalledWith(
      ctx,
      'session-1',
      expect.objectContaining({ backgroundMode: 'override' })
    )

    await save?.(
      {},
      {
        sessionId: 'session-1',
        config: {
          backgroundColor: '#ffffff',
          backgroundMode: 'override',
          backgroundStyle: 'image',
          backgroundGradient: {
            type: 'linear',
            angle: 135,
            stops: [
              { color: '#112233', position: 0 },
              { color: '#ffffff', position: 100 }
            ]
          },
          backgroundImage: './images/master-background.png',
          titleFontPreset: 'inherit',
          bodyFontPreset: 'inherit',
          titleFontFamily: null,
          bodyFontFamily: null,
          titleFontSize: null,
          bodyFontSize: null,
          elements: {
            logoImage: './images/logo.png',
            footerText: 'Acme',
            watermarkText: '',
            showPageNumber: true
          }
        }
      }
    )
    expect(state.save).toHaveBeenLastCalledWith(
      ctx,
      'session-1',
      expect.objectContaining({
        backgroundStyle: 'image',
        backgroundImage: './images/master-background.png'
      })
    )

    await expect(
      save?.(
        {},
        {
          sessionId: 'session-1',
          config: {
            backgroundColor: '#ffffff',
            backgroundMode: 'override',
            backgroundStyle: 'image',
            backgroundGradient: {
              type: 'linear',
              angle: 135,
              stops: [
                { color: '#112233', position: 0 },
                { color: '#ffffff', position: 100 }
              ]
            },
            backgroundImage: '../outside.png',
            titleFontPreset: 'inherit',
            bodyFontPreset: 'inherit',
            titleFontFamily: null,
            bodyFontFamily: null,
            titleFontSize: null,
            bodyFontSize: null,
            elements: {
              logoImage: null,
              footerText: '',
              watermarkText: '',
              showPageNumber: true
            }
          }
        }
      )
    ).rejects.toThrow('母版配置无效')

    await expect(
      save?.(
        {},
        {
          sessionId: 'session-1',
          config: {
            backgroundColor: '#ffffff',
            backgroundMode: 'inherit',
            backgroundStyle: 'solid',
            backgroundGradient: {
              type: 'linear',
              angle: 135,
              stops: [
                { color: '#112233', position: 0 },
                { color: '#ffffff', position: 100 }
              ]
            },
            backgroundImage: null,
            titleFontPreset: 'inherit',
            bodyFontPreset: 'inherit',
            titleFontFamily: null,
            bodyFontFamily: null,
            titleFontSize: null,
            bodyFontSize: null,
            elements: {
              logoImage: null,
              footerText: '',
              watermarkText: '',
              showPageNumber: true,
              logoPosition: { x: 101, y: 8 }
            }
          }
        }
      )
    ).rejects.toThrow('母版配置无效')

    await setPageOverride?.({}, { sessionId: 'session-1', pageId: 'page-row-1', disabled: true })
    expect(state.setPageOverride).toHaveBeenCalledWith(ctx, 'session-1', 'page-row-1', true)
    await expect(
      setPageOverride?.({}, { sessionId: 'session-1', pageId: '', disabled: true })
    ).rejects.toThrow('页面母版设置无效')
  })
})
