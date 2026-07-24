import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('session job schema', () => {
  it('uses one persisted job table and migrates every legacy job kind into it', () => {
    const schemaSource = fs.readFileSync(path.resolve('src/main/db/schema.ts'), 'utf8')
    const patchSource = fs.readFileSync(path.resolve('src/main/db/patch/index.ts'), 'utf8')

    expect(schemaSource).toContain("'session_jobs'")
    expect(schemaSource).not.toContain("'generation_jobs'")
    expect(schemaSource).not.toContain("'page_edit_jobs'")
    expect(schemaSource).not.toContain("'deck_edit_jobs'")
    expect(patchSource).toContain("client.transaction('write')")
    expect(patchSource).toContain('ON CONFLICT(id) DO UPDATE SET')
    expect(patchSource).toContain('NOT EXISTS (SELECT 1 FROM page_edit_jobs')
    expect(patchSource).toContain('NOT EXISTS (SELECT 1 FROM deck_edit_jobs')
    expect(patchSource).toContain("'page-edit'")
    expect(patchSource).toContain("'deck-edit'")
    expect(patchSource).toContain('DROP TABLE generation_jobs')
    expect(patchSource).toContain('DROP TABLE page_edit_jobs')
    expect(patchSource).toContain('DROP TABLE deck_edit_jobs')
  })
})
