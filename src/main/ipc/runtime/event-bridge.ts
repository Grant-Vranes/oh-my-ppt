import type { RuntimeEventEnvelope, RuntimeEventFilter, TypedEventBus } from '../../agent-runtime'

type RuntimeEventWindow = {
  id: number
  isDestroyed(): boolean
  webContents: {
    isDestroyed(): boolean
    send(channel: string, payload: unknown): void
  }
}

export type RuntimeEventWebContents = {
  id: number
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
  once(event: 'destroyed', listener: () => void): unknown
  removeListener(event: 'destroyed', listener: () => void): unknown
}

export type RuntimeEventSubscriber = {
  subscriberId: string
  filter?: Omit<RuntimeEventFilter, 'subscriberId'>
  send: (event: RuntimeEventEnvelope) => void
}

export type RuntimeEventChannelMessage = {
  channel: string
  payload: unknown
}

/**
 * Electron-facing lifecycle adapter. Domain-specific channel translation is deliberately added
 * only when that domain migrates to TypedEventBus.
 */
export class RuntimeEventBridge {
  private readonly unsubscribeBySubscriberId = new Map<string, () => void>()

  constructor(private readonly eventBus: TypedEventBus) {}

  register(subscriber: RuntimeEventSubscriber): () => void {
    this.unregister(subscriber.subscriberId)
    const unsubscribe = this.eventBus.subscribe(
      { ...subscriber.filter, subscriberId: subscriber.subscriberId },
      subscriber.send
    )
    this.unsubscribeBySubscriberId.set(subscriber.subscriberId, unsubscribe)
    return (): void => {
      if (this.unsubscribeBySubscriberId.get(subscriber.subscriberId) !== unsubscribe) return
      this.unsubscribeBySubscriberId.delete(subscriber.subscriberId)
      unsubscribe()
    }
  }

  unregister(subscriberId: string): void {
    const unsubscribe = this.unsubscribeBySubscriberId.get(subscriberId)
    if (!unsubscribe) return
    this.unsubscribeBySubscriberId.delete(subscriberId)
    unsubscribe()
  }

  /**
   * Registers a targeted Electron subscriber and couples its lifetime to the
   * underlying webContents. Broadcast adapters intentionally discover live
   * windows for each send instead of creating one subscriber per window.
   */
  registerWebContents(args: {
    subscriberId: string
    webContents: RuntimeEventWebContents
    filter?: Omit<RuntimeEventFilter, 'subscriberId'>
    translate: (event: RuntimeEventEnvelope) => RuntimeEventChannelMessage | null
    onSendError?: (args: { event: RuntimeEventEnvelope; error: unknown }) => void
  }): () => void {
    if (args.webContents.isDestroyed()) return () => undefined

    let disposed = false
    let unregister: (() => void) | undefined
    const dispose = (): void => {
      if (disposed) return
      disposed = true
      args.webContents.removeListener('destroyed', dispose)
      // Use the disposer returned by register() rather than unregister(id): a
      // subsequent registration may have reused this subscriberId for a newer
      // webContents. The registered disposer deliberately becomes a no-op in
      // that case, so an old window's destroyed callback cannot remove it.
      unregister?.()
    }
    unregister = this.register({
      subscriberId: args.subscriberId,
      filter: args.filter,
      send: (event) => {
        if (args.webContents.isDestroyed()) return
        const message = args.translate(event)
        if (!message) return
        try {
          args.webContents.send(message.channel, message.payload)
        } catch (error) {
          try {
            args.onSendError?.({ event, error })
          } catch {
            // Event delivery diagnostics must not affect other subscribers or jobs.
          }
        }
      }
    })
    args.webContents.once('destroyed', dispose)

    return dispose
  }

  /**
   * Compatibility adapter for legacy broadcast IPC channels. The runtime only
   * publishes typed events; Electron window discovery and send failures stay
   * on this IPC-side boundary.
   */
  registerWindowBroadcast(args: {
    subscriberId: string
    filter?: Omit<RuntimeEventFilter, 'subscriberId'>
    windows: () => RuntimeEventWindow[]
    translate: (event: RuntimeEventEnvelope) => RuntimeEventChannelMessage | null
    onSendError?: (args: { event: RuntimeEventEnvelope; windowId: number; error: unknown }) => void
  }): () => void {
    return this.register({
      subscriberId: args.subscriberId,
      filter: args.filter,
      send: (event) => {
        const message = args.translate(event)
        if (!message) return
        for (const win of args.windows()) {
          if (win.isDestroyed() || win.webContents.isDestroyed()) continue
          try {
            win.webContents.send(message.channel, message.payload)
          } catch (error) {
            try {
              args.onSendError?.({ event, windowId: win.id, error })
            } catch {
              // Event delivery diagnostics must not affect other windows or jobs.
            }
          }
        }
      }
    })
  }
}
