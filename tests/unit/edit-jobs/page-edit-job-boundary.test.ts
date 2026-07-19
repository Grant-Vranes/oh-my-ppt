import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('page edit job boundary', () => {
  it('uses its own IPC while sharing the unified session job persistence', () => {
    const serviceSource = fs.readFileSync(
      path.resolve('src/main/ipc/edit-jobs/page-edit-job-service.ts'),
      'utf8'
    )
    const generationHandlerSource = fs.readFileSync(
      path.resolve('src/main/ipc/engine/generation-handlers.ts'),
      'utf8'
    )

    expect(serviceSource).toContain("ipcMain.handle('page-edit:start'")
    expect(serviceSource).toContain("kind: 'page-edit'")
    expect(serviceSource).toContain('createGenerationRunWithSessionJob')
    expect(serviceSource).not.toContain('createGenerationJob')
    expect(generationHandlerSource).toContain('单页编辑请使用 page-edit:start')
  })
})
