import type {
  RuntimeEventEnvelope,
  RuntimeEventFilter,
  RuntimeEventMap,
  RuntimeEventType
} from './envelope'

type Listener = (event: RuntimeEventEnvelope) => void

type Subscriber = {
  filter: RuntimeEventFilter
  listener: Listener
}

export type TypedEventBusOptions = {
  onListenerError?: (error: unknown, event: RuntimeEventEnvelope) => void
}

export class TypedEventBus {
  private readonly subscribers = new Map<number, Subscriber>()
  private nextSubscriberId = 1

  constructor(private readonly options: TypedEventBusOptions = {}) {}

  emit<K extends RuntimeEventType>(event: RuntimeEventEnvelope<K>): void {
    for (const subscriber of this.subscribers.values()) {
      if (!this.matches(subscriber.filter, event)) continue
      try {
        subscriber.listener(event)
      } catch (error) {
        try {
          this.options.onListenerError?.(error, event)
        } catch {
          // A diagnostic hook must never make one broken listener affect the job that emitted.
        }
      }
    }
  }

  subscribe(filter: RuntimeEventFilter, listener: Listener): () => void {
    const subscriberId = this.nextSubscriberId
    this.nextSubscriberId += 1
    this.subscribers.set(subscriberId, { filter, listener })
    return () => this.subscribers.delete(subscriberId)
  }

  private matches(filter: RuntimeEventFilter, event: RuntimeEventEnvelope): boolean {
    if (filter.domain && event.domain !== filter.domain) return false
    if (
      filter.owner &&
      Object.entries(filter.owner).some(([key, value]) => {
        const ownerKey = key as keyof typeof event.owner
        return event.owner[ownerKey] !== value
      })
    ) {
      return false
    }
    if (event.audience.kind === 'broadcast') return true
    if (event.audience.kind === 'requester') {
      return event.audience.subscriberId === filter.subscriberId
    }

    // Owner delivery is meaningful only for an explicit matching owner filter.
    // The owner comparison above already established that this subscriber matches.
    return Boolean(filter.owner && Object.keys(filter.owner).length > 0)
  }
}

export type { RuntimeEventEnvelope, RuntimeEventFilter, RuntimeEventMap, RuntimeEventType }
