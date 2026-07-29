import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { TypedEventBus } from '../../../src/main/agent-runtime'
import { createRuntimeEmitters } from '../../../src/main/ipc/runtime/runtime-emitters'
import { createSessionProjectResolver } from '../../../src/main/ipc/runtime/session-project'
import { createSessionRunStateStore } from '../../../src/main/ipc/runtime/session-run-state'

describe('IPC runtime capabilities', () => {
  it('keeps generation on its own narrow context instead of the IPC facade', () => {
    const generationDirectory = path.resolve('src/main/generation')
    const sources = fs
      .readdirSync(generationDirectory)
      .filter((entry) => entry.endsWith('.ts'))
      .map((entry) => ({
        path: path.join(generationDirectory, entry),
        source: fs.readFileSync(path.join(generationDirectory, entry), 'utf8')
      }))

    for (const source of sources) {
      expect(source.source, source.path).not.toContain('IpcContext')
    }
    const generationContext = sources.find(({ path: filePath }) => filePath.endsWith('/context.ts'))
    expect(generationContext?.source).toContain('export type GenerationDbPort')
    expect(generationContext?.source).toContain('export type GenerationContext')
  })

  it('keeps session run state separate from lifecycle event emission', () => {
    const sessionRuns = createSessionRunStateStore()
    const runtimeEvents = new TypedEventBus()
    const received: string[] = []
    runtimeEvents.subscribe({ subscriberId: 'test' }, (event) => received.push(event.type))
    const emitters = createRuntimeEmitters({
      mainWindow: {
        isDestroyed: () => false,
        isVisible: () => true,
        show: () => undefined,
        focus: () => undefined
      } as never,
      runtimeEvents,
      sessionRuns
    })

    const state = sessionRuns.beginSessionRunState({
      sessionId: 'session-1',
      runId: 'run-1',
      mode: 'generate',
      totalPages: 2
    })
    expect(received).toEqual([])

    emitters.emitSessionRunLifecycle(state)
    emitters.emitGenerateChunk('session-1', {
      type: 'page_generated',
      payload: {
        runId: 'run-1',
        stage: 'rendering',
        pageId: 'page-1',
        pageNumber: 1,
        title: 'Overview',
        html: '<section>Overview</section>'
      }
    })

    expect(received).toEqual(['job.started', 'generation.chunk'])
    expect(state.completedPageKeys).toEqual(['page-1'])
    expect(state.events[0]).toMatchObject({
      type: 'page_generated',
      payload: { html: '' }
    })
  })

  it('builds a session snapshot through the project capability', async () => {
    const db = {
      getSession: async () => ({ id: 'session-1' }),
      getProject: async () => ({ id: 'project-1', root_path: '/tmp/session-1' }),
      listSessionPages: async () => [
        {
          file_slug: 'page-1',
          page_number: 1,
          title: 'Overview',
          html_path: 'page-1.html',
          status: 'completed',
          error: null
        },
        {
          file_slug: 'page-2',
          page_number: 2,
          title: 'Risks',
          html_path: 'page-2.html',
          status: 'failed',
          error: 'model failed'
        }
      ]
    }
    const project = createSessionProjectResolver({ db: db as never })

    const snapshot = await project.buildSessionGenerationSnapshot(
      { id: 'session-1', metadata: '{"existing":true}' },
      { includeHtml: false }
    )

    expect(snapshot.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pageId: 'page-1', html: '', status: 'completed' }),
        expect.objectContaining({ pageId: 'page-2', html: '', error: 'model failed' })
      ])
    )
    expect(snapshot.session).toMatchObject({
      page_count: 2,
      generated_count: 1,
      failed_count: 1
    })
    expect(JSON.parse(String(snapshot.session?.metadata))).toMatchObject({
      existing: true,
      entryMode: 'multi_page',
      projectId: 'project-1'
    })
  })
})
