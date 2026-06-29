import { describe, expect, it, vi } from 'vitest'
import {
  revealGenerationWindow,
  shouldRevealGenerationWindow
} from '../../../src/main/ipc/generation/generation-window-policy'
import type { GenerateChunkEvent } from '../../../src/shared/generation'

const terminalEvent = (
  type: 'run_completed' | 'run_error',
  options: {
    cancelled?: boolean
    activityKind?: 'edit' | 'style-switch' | 'single-page-retry' | 'addPage'
  } = {}
): GenerateChunkEvent =>
  ({
    type,
    payload: {
      runId: 'run-1',
      ...(type === 'run_completed'
        ? { totalPages: 3 }
        : { message: 'Generation failed', cancelled: options.cancelled }),
      activityKind: options.activityKind
    }
  }) as GenerateChunkEvent

describe('generation window policy', () => {
  it('reveals the app only for terminal deck generation states', () => {
    expect(
      shouldRevealGenerationWindow(terminalEvent('run_completed'), {
        runId: 'run-1',
        mode: 'generate'
      })
    ).toBe(true)
    expect(
      shouldRevealGenerationWindow(terminalEvent('run_error'), {
        runId: 'run-1',
        mode: 'retry'
      })
    ).toBe(true)
    expect(
      shouldRevealGenerationWindow(terminalEvent('run_completed'), {
        runId: 'run-1',
        mode: 'edit'
      })
    ).toBe(false)
    expect(
      shouldRevealGenerationWindow(terminalEvent('run_error', { cancelled: true }), {
        runId: 'run-1',
        mode: 'generate'
      })
    ).toBe(false)
    expect(
      shouldRevealGenerationWindow(terminalEvent('run_completed'), {
        runId: 'newer-run',
        mode: 'generate'
      })
    ).toBe(false)
  })

  it('does not reveal the app for page progress or unrelated activity', () => {
    expect(
      shouldRevealGenerationWindow({
        type: 'page_generated',
        payload: {
          runId: 'run-1',
          pageNumber: 1,
          pageId: 'page-1',
          title: 'Page 1',
          html: '',
          stage: 'rendering',
          label: 'Generated'
        }
      } as GenerateChunkEvent)
    ).toBe(false)
    expect(
      shouldRevealGenerationWindow(
        terminalEvent('run_completed', { activityKind: 'style-switch' })
      )
    ).toBe(false)
  })

  it('restores, shows, and focuses the main window when needed', () => {
    const window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      isVisible: vi.fn(() => false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn()
    }

    revealGenerationWindow(window as never)

    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })
})
