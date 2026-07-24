import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

describe('page beautify job boundary', () => {
  it('uses dedicated IPC and restricts persistence to the selected page', () => {
    const serviceSource = fs.readFileSync(
      path.resolve('src/main/ipc/edit-jobs/page-beautify-job-service.ts'),
      'utf8'
    )

    expect(serviceSource).toContain("ipcMain.handle('page-beautify:start'")
    expect(serviceSource).toContain("mode: 'page-beautify'")
    expect(serviceSource).toContain("kind: 'page-beautify'")
    expect(serviceSource).toContain('createGenerationRunWithSessionJob')
    expect(serviceSource).toContain('resolvePageBeautifyContext')
    expect(serviceSource).toContain('runPageBeautifyAgent')
    expect(serviceSource).toContain('layoutAudit')
    expect(serviceSource).toContain('extractPageBeautifyContent')
    expect(serviceSource).toContain('replacePageContentFragment')
    expect(serviceSource).toContain('recordHistoryOperationStrict')
    expect(serviceSource).not.toContain('runDeepAgentEdit')
    expect(serviceSource).not.toContain('resolveCommonContext')
    expect(serviceSource).not.toContain('update_single_page_file')
    expect(serviceSource).not.toContain("from '../generation/edit-flow'")
    expect(serviceSource).not.toContain("from './page-edit-job-service'")
    expect(serviceSource).not.toContain("from './deck-edit-job-service'")
    expect(serviceSource).not.toContain("from './style-switch-job-service'")

    const agentSource = fs.readFileSync(
      path.resolve('src/main/ipc/edit-jobs/page-beautify-agent.ts'),
      'utf8'
    )
    // Beautify uses the same DeepAgents + product-skills machinery as the deck/edit
    // pipelines so the model can read_file the layout skill that matches the slide
    // size. Custom tool surface stays narrow: only read_page_html + save_current_page_content.
    expect(agentSource).toContain("createDeepAgent")
    expect(agentSource).toContain("from 'deepagents'")
    expect(agentSource).toContain('attachProductSkillsBackend')
    expect(agentSource).toContain("name: 'read_page_html'")
    expect(agentSource).toContain("name: 'save_current_page_content'")
    // The project backend is read-only — beautify never persists by writing files.
    expect(agentSource).toContain('ReadOnlyProjectBackend')
    expect(agentSource).not.toContain('get_session_context')
    expect(agentSource).not.toContain('update_single_page_file')
    expect(agentSource).not.toContain('read_current_page_content')

    const promptSource = fs.readFileSync(
      path.resolve('src/main/ipc/edit-jobs/page-beautify-prompt.ts'),
      'utf8'
    )
    expect(promptSource).toContain('ppt-page-root')
    expect(promptSource).toContain('read_page_html')
    expect(promptSource).toContain('read_file')
    expect(promptSource).toContain('layoutSkillName')
    expect(promptSource).toContain('styleCase')
    expect(promptSource).not.toContain('update_single_page_file')
    expect(promptSource).not.toContain('read_current_page_content')
  })
})
