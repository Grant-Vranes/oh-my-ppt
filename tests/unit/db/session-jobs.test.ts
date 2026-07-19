import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), 'ohmyppt-test-user-data'))
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

import { PPTDatabase } from '../../../src/main/db/database'

describe('session jobs', () => {
  const roots: string[] = []

  afterEach(async () => {
    for (const root of roots.splice(0)) {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('creates the run and unified page-edit job atomically', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-session-jobs-'))
    roots.push(root)
    const db = new PPTDatabase(path.join(root, 'test.db'))
    await db.init()

    try {
      const sessionId = await db.createSession({
        id: 'session-job-1',
        title: 'Job test',
        slideSizeId: 'wide-16-9',
        slideWidth: 1600,
        slideHeight: 900,
        provider: 'test',
        model: 'test-model'
      })
      await db.createGenerationRunWithSessionJob({
        run: {
          id: 'run-page-edit-1',
          sessionId,
          mode: 'edit',
          totalPages: 1,
          modelConfigId: 'model-1',
          metadata: { jobType: 'page-edit' }
        },
        job: {
          id: 'run-page-edit-1',
          sessionId,
          kind: 'page-edit',
          status: 'active',
          previousSessionStatus: 'completed',
          targetPageId: 'page-1',
          targetPageNumber: 1,
          selector: '#title',
          totalPages: 1
        }
      })

      await expect(db.getGenerationRun('run-page-edit-1')).resolves.toMatchObject({
        session_id: sessionId,
        mode: 'edit',
        status: 'running'
      })
      await expect(db.getLatestSessionJob(sessionId, ['page-edit'])).resolves.toMatchObject({
        id: 'run-page-edit-1',
        kind: 'page-edit',
        previous_session_status: 'completed',
        target_page_id: 'page-1',
        target_page_number: 1,
        selector: '#title',
        status: 'active'
      })
      await expect(db.listActiveSessionJobs(['page-edit'])).resolves.toHaveLength(1)

      await db.updateSessionJobStatus('run-page-edit-1', 'finished')
      await expect(db.listActiveSessionJobs(['page-edit'])).resolves.toEqual([])
    } finally {
      await db.close()
    }
  })

  it('migrates a legacy generation job into session_jobs during startup', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-session-jobs-migration-'))
    roots.push(root)
    const dbPath = path.join(root, 'test.db')
    const client = createClient({ url: `file:${dbPath}` })
    await client.executeMultiple(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        topic TEXT,
        style_id TEXT,
        page_count INTEGER,
        slide_size_id TEXT NOT NULL DEFAULT 'wide-16-9',
        slide_width INTEGER NOT NULL DEFAULT 1600,
        slide_height INTEGER NOT NULL DEFAULT 900,
        reference_document_path TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT,
        design_contract TEXT,
        current_operation_id TEXT,
        current_commit TEXT
      );
      CREATE TABLE generation_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        mode TEXT NOT NULL DEFAULT 'generate',
        status TEXT NOT NULL DEFAULT 'running',
        total_pages INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE generation_jobs (
        id TEXT PRIMARY KEY REFERENCES generation_runs(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE page_edit_jobs (
        id TEXT PRIMARY KEY REFERENCES generation_runs(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        target_page_id TEXT NOT NULL,
        target_page_number INTEGER,
        selector TEXT,
        previous_session_status TEXT NOT NULL,
        status TEXT NOT NULL,
        abort_reason TEXT,
        created_at INTEGER NOT NULL,
        activated_at INTEGER,
        updated_at INTEGER NOT NULL,
        finished_at INTEGER
      );
      CREATE TABLE deck_edit_jobs (
        id TEXT PRIMARY KEY REFERENCES generation_runs(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        previous_session_status TEXT NOT NULL,
        total_pages INTEGER NOT NULL,
        status TEXT NOT NULL,
        abort_reason TEXT,
        created_at INTEGER NOT NULL,
        activated_at INTEGER,
        updated_at INTEGER NOT NULL,
        finished_at INTEGER
      );
      INSERT INTO sessions (
        id, title, status, provider, model, created_at, updated_at
      ) VALUES ('legacy-session', 'Legacy', 'active', 'test', 'test-model', 1, 1);
      INSERT INTO generation_runs (
        id, session_id, mode, status, total_pages, metadata, created_at, updated_at
      ) VALUES (
        'legacy-run', 'legacy-session', 'generate', 'running', 3,
        '{"previousSessionStatus":"completed"}', 1, 1
      );
      INSERT INTO generation_jobs (id, session_id, kind, status, created_at, updated_at)
      VALUES ('legacy-run', 'legacy-session', 'standard', 'active', 1, 1);
      INSERT INTO generation_runs (
        id, session_id, mode, status, total_pages, created_at, updated_at
      ) VALUES ('legacy-page-run', 'legacy-session', 'edit', 'running', 1, 1, 1);
      INSERT INTO page_edit_jobs (
        id, session_id, target_page_id, target_page_number, selector, previous_session_status,
        status, created_at, updated_at
      ) VALUES (
        'legacy-page-run', 'legacy-session', 'page-2', 2, '#title', 'failed', 'active', 2, 2
      );
      INSERT INTO generation_jobs (id, session_id, kind, status, created_at, updated_at)
      VALUES ('legacy-page-run', 'legacy-session', 'edit', 'active', 2, 2);
      INSERT INTO generation_runs (
        id, session_id, mode, status, total_pages, created_at, updated_at
      ) VALUES ('legacy-deck-run', 'legacy-session', 'edit', 'running', 4, 1, 1);
      INSERT INTO deck_edit_jobs (
        id, session_id, previous_session_status, total_pages, status, created_at, updated_at
      ) VALUES ('legacy-deck-run', 'legacy-session', 'completed', 4, 'active', 3, 3);
      INSERT INTO generation_jobs (id, session_id, kind, status, created_at, updated_at)
      VALUES ('legacy-deck-run', 'legacy-session', 'standard', 'active', 3, 3);
      INSERT INTO page_edit_jobs (
        id, session_id, target_page_id, target_page_number, selector, previous_session_status,
        status, created_at, updated_at
      ) VALUES (
        'legacy-deck-run', 'legacy-session', 'page-4', 4, '#deck-title', 'failed', 'active', 3, 3
      );
    `)
    client.close()

    const db = new PPTDatabase(dbPath)
    await db.init()
    try {
      await expect(db.getLatestSessionJob('legacy-session')).resolves.toMatchObject({
        id: 'legacy-deck-run',
        kind: 'deck-edit',
        previous_session_status: 'completed',
        status: 'active',
        total_pages: 4,
        target_page_id: null
      })
      await expect(db.getSessionJob('legacy-run')).resolves.toMatchObject({
        kind: 'standard',
        previous_session_status: 'completed',
        total_pages: 3
      })
      await expect(db.getSessionJob('legacy-page-run')).resolves.toMatchObject({
        kind: 'page-edit',
        previous_session_status: 'failed',
        target_page_id: 'page-2',
        target_page_number: 2,
        selector: '#title'
      })
    } finally {
      await db.close()
    }
  })

  it('keeps legacy job tables intact when a transactional migration fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-session-jobs-rollback-'))
    roots.push(root)
    const dbPath = path.join(root, 'test.db')
    const client = createClient({ url: `file:${dbPath}` })
    await client.executeMultiple(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        topic TEXT,
        style_id TEXT,
        page_count INTEGER,
        slide_size_id TEXT NOT NULL DEFAULT 'wide-16-9',
        slide_width INTEGER NOT NULL DEFAULT 1600,
        slide_height INTEGER NOT NULL DEFAULT 900,
        reference_document_path TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT,
        design_contract TEXT,
        current_operation_id TEXT,
        current_commit TEXT
      );
      CREATE TABLE generation_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'generate',
        status TEXT NOT NULL DEFAULT 'running',
        total_pages INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE generation_jobs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE session_jobs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind = 'blocked'),
        previous_session_status TEXT NOT NULL,
        target_page_id TEXT,
        target_page_number INTEGER,
        selector TEXT,
        total_pages INTEGER,
        status TEXT NOT NULL,
        abort_reason TEXT,
        created_at INTEGER NOT NULL,
        activated_at INTEGER,
        updated_at INTEGER NOT NULL,
        finished_at INTEGER
      );
      INSERT INTO sessions (id, title, provider, model, created_at, updated_at)
      VALUES ('rollback-session', 'Rollback', 'test', 'test-model', 1, 1);
      INSERT INTO generation_runs (id, session_id, mode, status, total_pages, created_at, updated_at)
      VALUES ('rollback-run', 'rollback-session', 'generate', 'running', 1, 1, 1);
      INSERT INTO generation_jobs (id, session_id, kind, status, created_at, updated_at)
      VALUES ('rollback-run', 'rollback-session', 'standard', 'active', 1, 1);
    `)
    client.close()

    const db = new PPTDatabase(dbPath)
    try {
      await expect(db.init()).rejects.toThrow()
    } finally {
      await db.close()
    }

    const verificationClient = createClient({ url: `file:${dbPath}` })
    try {
      const legacyJobs = await verificationClient.execute('SELECT id FROM generation_jobs')
      const migratedJobs = await verificationClient.execute('SELECT id FROM session_jobs')
      expect(legacyJobs.rows).toHaveLength(1)
      expect(migratedJobs.rows).toHaveLength(0)
    } finally {
      verificationClient.close()
    }
  })
})
