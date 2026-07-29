import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { translateLegacyRuntimeEvent } from '../../../src/main/ipc/runtime/event-contract'

describe('Runtime Event legacy IPC contract', () => {
  it('forwards only generation chunks with their pre-existing channel and payload', () => {
    const chunk = {
      type: 'page_generated' as const,
      payload: {
        runId: 'run-1',
        pageId: 'page-1',
        pageNumber: 1,
        title: 'Overview',
        html: '<div>Overview</div>'
      }
    }

    expect(
      translateLegacyRuntimeEvent({
        type: 'generation.chunk',
        payload: chunk,
        jobId: 'run-1',
        domain: 'generation',
        owner: { sessionId: 'session-1' },
        audience: { kind: 'broadcast' },
        occurredAt: 1
      })
    ).toMatchInlineSnapshot(`
      {
        "channel": "generate:chunk",
        "payload": {
          "payload": {
            "html": "<div>Overview</div>",
            "pageId": "page-1",
            "pageNumber": 1,
            "runId": "run-1",
            "title": "Overview",
          },
          "type": "page_generated",
        },
      }
    `)
  })

  it('does not invent legacy push channels for lifecycle or image events', () => {
    expect(
      translateLegacyRuntimeEvent({
        type: 'job.completed',
        payload: {},
        jobId: 'run-1',
        domain: 'generation',
        owner: { sessionId: 'session-1' },
        audience: { kind: 'broadcast' },
        occurredAt: 1
      })
    ).toBeNull()
    expect(
      translateLegacyRuntimeEvent({
        type: 'image.progress',
        payload: {
          runId: 'image-run-1',
          sessionId: 'session-1',
          pageId: 'page-1',
          progress: 80,
          label: 'Saving images',
          status: 'running'
        },
        jobId: 'image-run-1',
        domain: 'image',
        owner: { sessionId: 'session-1', imageHistoryOwner: 'session-1' },
        audience: { kind: 'broadcast' },
        occurredAt: 1
      })
    ).toBeNull()
  })

  it('makes IPC setup use the explicit compatibility table', () => {
    const ipcIndex = fs.readFileSync(path.resolve('src/main/ipc/index.ts'), 'utf8')

    expect(ipcIndex).toContain("import { translateLegacyRuntimeEvent } from './runtime/event-contract'")
    expect(ipcIndex).toContain('translate: translateLegacyRuntimeEvent')
  })
})
