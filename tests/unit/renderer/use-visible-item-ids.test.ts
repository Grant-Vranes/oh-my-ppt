/**
 * @vitest-environment happy-dom
 */
import React, { act, useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useVisibleItemIds } from '../../../src/renderer/src/hooks/useVisibleItemIds'

type ObserverEntry = Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  readonly observed = new Set<Element>()

  constructor(private readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this)
  }

  observe = (element: Element): void => {
    this.observed.add(element)
  }

  unobserve = (element: Element): void => {
    this.observed.delete(element)
  }

  disconnect = (): void => {
    this.observed.clear()
  }

  emit(entries: ObserverEntry[]): void {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }
}

function Harness(): React.JSX.Element {
  const ids = useMemo(
    () => new Set(Array.from({ length: 10 }, (_, index) => `item-${index + 1}`)),
    []
  )
  const { visibleIds, setItemRef } = useVisibleItemIds(ids, 8)
  return React.createElement(
    'div',
    null,
    React.createElement('output', { 'data-testid': 'visible' }, Array.from(visibleIds).join(',')),
    ...Array.from(ids).map((id) =>
      React.createElement('div', { key: id, 'data-item-id': id, ref: setItemRef(id) })
    )
  )
}

describe('useVisibleItemIds', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('keeps only the eight most recently visible items and removes exited items', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => root.render(React.createElement(Harness)))
    const observer = MockIntersectionObserver.instances[0]
    const elements = Array.from(observer.observed)

    await act(async () => {
      observer.emit(elements.map((target) => ({ target, isIntersecting: true })))
    })
    expect(container.querySelector('[data-testid="visible"]')?.textContent).toBe(
      'item-3,item-4,item-5,item-6,item-7,item-8,item-9,item-10'
    )

    const item10 = elements.find(
      (element) => (element as HTMLElement).dataset.itemId === 'item-10'
    )
    await act(async () => observer.emit([{ target: item10!, isIntersecting: false }]))
    expect(container.querySelector('[data-testid="visible"]')?.textContent).not.toContain('item-10')
    await act(async () => root.unmount())
  })
})
