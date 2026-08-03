import { describe, expect, it, vi } from 'vitest'
import { TypedEventBus } from '../../../src/main/agent-runtime/events/bus'
import { RuntimeEventBridge } from '../../../src/main/ipc/runtime/event-bridge'

const jobStarted = (overrides: Record<string, unknown> = {}) => ({
  type: 'job.started' as const,
  payload: {},
  jobId: 'job-1',
  domain: 'generation' as const,
  owner: { sessionId: 'session-1' },
  audience: { kind: 'broadcast' as const },
  occurredAt: 1,
  ...overrides
})

describe('TypedEventBus', () => {
  it('filters by domain, owner and subscriber audience', () => {
    const bus = new TypedEventBus()
    const listener = vi.fn()
    bus.subscribe({ domain: 'generation', owner: { sessionId: 'session-1' }, subscriberId: 'window-1' }, listener)

    bus.emit(jobStarted())
    bus.emit(
      jobStarted({ audience: { kind: 'requester', subscriberId: 'window-2' } })
    )
    bus.emit(
      jobStarted({ audience: { kind: 'requester', subscriberId: 'window-1' } })
    )
    bus.emit(jobStarted({ domain: 'image' }))

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('delivers owner-audience events only to matching owner subscribers', () => {
    const bus = new TypedEventBus()
    const matchingOwner = vi.fn()
    const otherOwner = vi.fn()
    const unscopedSubscriber = vi.fn()
    bus.subscribe({ owner: { sessionId: 'session-1' }, subscriberId: 'window-1' }, matchingOwner)
    bus.subscribe({ owner: { sessionId: 'session-2' }, subscriberId: 'window-2' }, otherOwner)
    bus.subscribe({ subscriberId: 'legacy-broadcast' }, unscopedSubscriber)

    bus.emit(jobStarted({ audience: { kind: 'owner' } }))

    expect(matchingOwner).toHaveBeenCalledOnce()
    expect(otherOwner).not.toHaveBeenCalled()
    expect(unscopedSubscriber).not.toHaveBeenCalled()
  })

  it('isolates listener failures and supports unsubscribe', () => {
    const listenerError = vi.fn()
    const bus = new TypedEventBus({ onListenerError: listenerError })
    const healthyListener = vi.fn()
    bus.subscribe({}, () => {
      throw new Error('listener failed')
    })
    const unsubscribe = bus.subscribe({}, healthyListener)

    expect(() => bus.emit(jobStarted())).not.toThrow()
    expect(listenerError).toHaveBeenCalledTimes(1)
    expect(healthyListener).toHaveBeenCalledTimes(1)

    unsubscribe()
    bus.emit(jobStarted())
    expect(healthyListener).toHaveBeenCalledTimes(1)
  })

  it('removes a bridge subscriber cleanly', () => {
    const bus = new TypedEventBus()
    const bridge = new RuntimeEventBridge(bus)
    const send = vi.fn()
    const unregister = bridge.register({ subscriberId: 'window-1', send })

    bus.emit(jobStarted())
    expect(send).toHaveBeenCalledTimes(1)

    unregister()
    bus.emit(jobStarted())
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('does not let a stale disposer unregister a replacement subscriber', () => {
    const bus = new TypedEventBus()
    const bridge = new RuntimeEventBridge(bus)
    const firstSend = vi.fn()
    const secondSend = vi.fn()
    const firstUnregister = bridge.register({ subscriberId: 'window-1', send: firstSend })
    const secondUnregister = bridge.register({ subscriberId: 'window-1', send: secondSend })

    firstUnregister()
    bus.emit(jobStarted())

    expect(firstSend).not.toHaveBeenCalled()
    expect(secondSend).toHaveBeenCalledOnce()
    secondUnregister()
  })

  it('removes a targeted webContents subscriber when it is destroyed', () => {
    const bus = new TypedEventBus()
    const bridge = new RuntimeEventBridge(bus)
    const send = vi.fn()
    let onDestroyed: (() => void) | undefined
    const removeListener = vi.fn()
    const unregister = bridge.registerWebContents({
      subscriberId: 'window-1',
      webContents: {
        id: 1,
        isDestroyed: () => false,
        send,
        once: (_event, listener) => {
          onDestroyed = listener
        },
        removeListener
      },
      translate: (event) => ({ channel: 'runtime:event', payload: event })
    })

    bus.emit(jobStarted())
    expect(send).toHaveBeenCalledOnce()

    onDestroyed?.()
    bus.emit(jobStarted())
    expect(send).toHaveBeenCalledOnce()
    expect(removeListener).toHaveBeenCalledWith('destroyed', expect.any(Function))

    unregister()
  })

  it('does not let a replaced webContents destroy callback remove the new subscriber', () => {
    const bus = new TypedEventBus()
    const bridge = new RuntimeEventBridge(bus)
    const firstSend = vi.fn()
    const secondSend = vi.fn()
    let firstDestroyed: (() => void) | undefined
    let secondDestroyed: (() => void) | undefined

    bridge.registerWebContents({
      subscriberId: 'window-1',
      webContents: {
        id: 1,
        isDestroyed: () => false,
        send: firstSend,
        once: (_event, listener) => {
          firstDestroyed = listener
        },
        removeListener: vi.fn()
      },
      translate: (event) => ({ channel: 'runtime:event', payload: event })
    })
    bridge.registerWebContents({
      subscriberId: 'window-1',
      webContents: {
        id: 2,
        isDestroyed: () => false,
        send: secondSend,
        once: (_event, listener) => {
          secondDestroyed = listener
        },
        removeListener: vi.fn()
      },
      translate: (event) => ({ channel: 'runtime:event', payload: event })
    })

    firstDestroyed?.()
    bus.emit(jobStarted())

    expect(firstSend).not.toHaveBeenCalled()
    expect(secondSend).toHaveBeenCalledOnce()

    secondDestroyed?.()
    bus.emit(jobStarted())
    expect(secondSend).toHaveBeenCalledOnce()
  })

  it('translates typed generation chunks to the legacy channel for every live window', () => {
    const bus = new TypedEventBus()
    const bridge = new RuntimeEventBridge(bus)
    const sent = vi.fn()
    const sendFailure = vi.fn()
    const onSendError = vi.fn()

    bridge.registerWindowBroadcast({
      subscriberId: 'legacy-generate-chunk',
      windows: () => [
        {
          id: 1,
          isDestroyed: () => false,
          webContents: { isDestroyed: () => false, send: sent }
        },
        {
          id: 2,
          isDestroyed: () => false,
          webContents: {
            isDestroyed: () => false,
            send: () => {
              sendFailure()
              throw new Error('renderer closed while sending')
            }
          }
        },
        {
          id: 3,
          isDestroyed: () => true,
          webContents: { isDestroyed: () => false, send: vi.fn() }
        }
      ],
      translate: (event) =>
        event.type === 'generation.chunk'
          ? { channel: 'generate:chunk', payload: event.payload }
          : null,
      onSendError
    })

    const chunk = {
      type: 'run_completed' as const,
      payload: { runId: 'run-1', totalPages: 1 }
    }
    bus.emit({
      type: 'generation.chunk',
      payload: chunk,
      jobId: 'run-1',
      domain: 'generation',
      owner: { sessionId: 'session-1' },
      audience: { kind: 'broadcast' },
      occurredAt: 1
    })

    expect(sent).toHaveBeenCalledWith('generate:chunk', chunk)
    expect(sendFailure).toHaveBeenCalledOnce()
    expect(onSendError).toHaveBeenCalledWith(
      expect.objectContaining({ windowId: 2, event: expect.objectContaining({ jobId: 'run-1' }) })
    )
  })
})
