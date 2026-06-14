import { describe, expect, it, vi } from 'vitest'

const logMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}))

vi.mock('electron-log/main.js', () => ({ default: logMocks }))

import { GitHistoryService } from '../../../src/main/history/git-history-service'
import type { SessionStyleSnapshotRow } from '../../../src/main/db/database'

const styleSnapshot = (
  sessionId: string,
  styleId: string,
  styleName: string
): SessionStyleSnapshotRow => ({
  id: `snapshot-${styleId}`,
  sessionId,
  styleId,
  styleKey: styleId,
  styleName,
  styleNameZh: styleName,
  styleNameEn: styleName,
  description: `${styleName} description`,
  category: 'test',
  aliases: '[]',
  source: 'custom',
  version: '1.0.0',
  styleCase: '',
  packageDir: `user/${styleId}`,
  styleSkill: `${styleName} skill`,
  createdAt: 1
})

describe('git history style snapshot', () => {
  it('captures the exact session style state in operation metadata', async () => {
    const snapshot = styleSnapshot('session-1', 'style-old', '旧风格')
    const db = {
      getSession: vi.fn().mockResolvedValue({
        id: 'session-1',
        styleId: 'style-old',
        metadata: JSON.stringify({ locale: 'zh' }),
        designContract: JSON.stringify({ theme: 'old-theme' })
      }),
      getSessionStyleSnapshot: vi.fn().mockResolvedValue(snapshot)
    }
    const service = new GitHistoryService(db as never)

    const metadata = await (service as any).buildOperationMetadata({
      sessionId: 'session-1',
      metadata: { reason: 'test' }
    })

    expect(metadata).toMatchObject({
      reason: 'test',
      sessionMetadata: { locale: 'zh' },
      sessionStyleState: {
        styleId: 'style-old',
        snapshot,
        designContract: { theme: 'old-theme' }
      }
    })
  })

  it('restores the target version style id and snapshot during rollback', async () => {
    const currentSnapshot = styleSnapshot('session-1', 'style-new', '新风格')
    const targetSnapshot = styleSnapshot('session-1', 'style-old', '旧风格')
    const restoreSessionStyleState = vi.fn().mockResolvedValue(undefined)
    const db = {
      getSession: vi.fn().mockResolvedValue({
        id: 'session-1',
        status: 'completed',
        styleId: 'style-new',
        metadata: '{}',
        designContract: JSON.stringify({ theme: 'new-theme' }),
        currentOperationId: 'operation-new',
        currentCommit: 'commit-new'
      }),
      getSessionOperation: vi.fn().mockResolvedValue({
        id: 'operation-old',
        session_id: 'session-1',
        status: 'completed',
        after_commit: 'commit-old',
        tracked_files_json: JSON.stringify(['index.html', 'page-1.html']),
        metadata_json: JSON.stringify({
          sessionMetadata: { locale: 'zh' },
          sessionStyleState: {
            styleId: 'style-old',
            snapshot: targetSnapshot,
            designContract: { theme: 'old-theme' }
          }
        })
      }),
      listSessionPages: vi.fn().mockResolvedValue([]),
      getSessionStyleSnapshot: vi.fn().mockResolvedValue(currentSnapshot),
      updateSessionHistoryPointer: vi.fn().mockResolvedValue(undefined),
      updateSessionMetadata: vi.fn().mockResolvedValue(undefined),
      updateSessionDesignContract: vi.fn().mockResolvedValue(undefined),
      restoreSessionStyleState
    }
    const service = new GitHistoryService(db as never)
    const internals = service as any
    internals.ensureRepository = vi.fn().mockResolvedValue(undefined)
    internals.resolveHead = vi.fn().mockResolvedValue('commit-new')
    internals.assertCommitExists = vi.fn().mockResolvedValue(undefined)
    internals.listTrackedFiles = vi.fn().mockResolvedValue(['index.html', 'page-1.html'])
    internals.restoreCommitFiles = vi.fn().mockResolvedValue(undefined)
    internals.syncSessionPagesForRestoredVersion = vi.fn().mockResolvedValue(undefined)
    internals.moveHeadToCommit = vi.fn().mockResolvedValue(undefined)

    await service.rollbackToVersion({
      sessionId: 'session-1',
      projectDir: '/tmp/session-1',
      versionId: 'operation-old'
    })

    expect(restoreSessionStyleState).toHaveBeenCalledTimes(1)
    expect(restoreSessionStyleState).toHaveBeenCalledWith(
      'session-1',
      'style-old',
      targetSnapshot
    )
    expect(db.updateSessionDesignContract).toHaveBeenCalledWith('session-1', {
      theme: 'old-theme'
    })
    expect(logMocks.info).toHaveBeenCalledWith(
      '[history] restored session style snapshot',
      expect.objectContaining({
        sessionId: 'session-1',
        versionId: 'operation-old',
        styleId: 'style-old'
      })
    )
  })

  it('backfills the current history version before a style switch', async () => {
    const snapshot = styleSnapshot('session-1', 'style-old', '旧风格')
    const updateSessionOperationMetadata = vi.fn().mockResolvedValue(undefined)
    const db = {
      getSession: vi.fn().mockResolvedValue({
        id: 'session-1',
        styleId: 'style-old',
        currentOperationId: 'operation-current',
        designContract: JSON.stringify({ theme: 'old-theme' })
      }),
      getSessionOperation: vi.fn().mockResolvedValue({
        id: 'operation-current',
        session_id: 'session-1',
        metadata_json: JSON.stringify({ runId: 'run-old' })
      }),
      getSessionStyleSnapshot: vi.fn().mockResolvedValue(snapshot),
      updateSessionOperationMetadata
    }
    const service = new GitHistoryService(db as never)

    await service.captureCurrentVersionStyleState('session-1')

    expect(updateSessionOperationMetadata).toHaveBeenCalledWith('operation-current', {
      runId: 'run-old',
      sessionStyleState: {
        styleId: 'style-old',
        snapshot,
        designContract: { theme: 'old-theme' }
      }
    })
  })
})
