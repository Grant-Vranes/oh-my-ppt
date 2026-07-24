import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('deck edit job boundary', () => {
  it('uses its own IPC while sharing the unified session job persistence', () => {
    const serviceSource = fs.readFileSync(
      path.resolve('src/main/ipc/edit-jobs/deck-edit-job-service.ts'),
      'utf8'
    )
    const generationHandlerSource = fs.readFileSync(
      path.resolve('src/main/ipc/engine/generation-handlers.ts'),
      'utf8'
    )

    expect(serviceSource).toContain("ipcMain.handle('deck-edit:start'")
    expect(serviceSource).toContain("kind: 'deck-edit'")
    expect(serviceSource).toContain('createGenerationRunWithSessionJob')
    expect(serviceSource).not.toContain('createGenerationJob')
    expect(generationHandlerSource).toContain('主会话编辑请使用 deck-edit:start')
  })
})
