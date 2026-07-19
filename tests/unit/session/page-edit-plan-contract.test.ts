import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { normalizeSessionPageEditPlan } from '../../../src/shared/generation'

describe('single-page edit plan contract', () => {
  it('accepts a complete, bounded user-confirmable plan', () => {
    expect(
      normalizeSessionPageEditPlan({
        intent: 'layout',
        target: '第 2 页图表区',
        summary: '调整图表区的层级与留白。',
        changes: ['增加标题与图表间距'],
        confirmationQuestion: '确认按此计划修改吗？'
      })
    ).toMatchObject({ intent: 'layout', changes: ['增加标题与图表间距'] })
  })

  it('rejects incomplete plans and lets the ReAct assessment choose confirmation', () => {
    expect(normalizeSessionPageEditPlan({ intent: 'layout', target: '第 2 页' })).toBeUndefined()

    const serviceSource = fs.readFileSync(
      path.resolve('src/main/ipc/edit-jobs/page-edit-job-service.ts'),
      'utf8'
    )
    expect(serviceSource).toContain("ipcMain.handle('page-edit:assess'")
    expect(serviceSource).toContain("ipcMain.handle('page-edit:start'")
    expect(serviceSource).toContain('!input.approvedPlan && !input.autoApply')
    const editFlowSource = fs.readFileSync(
      path.resolve('src/main/ipc/generation/edit-flow.ts'),
      'utf8'
    )
    expect(editFlowSource).toContain('record_session_page_edit_assessment')
    expect(editFlowSource).toContain('requiresConfirmation=false only when the request has a concrete target')
    expect(serviceSource).toContain('请先确认页面修改计划，再执行编辑。')
  })

  it('uses the ReAct assessment instead of a client-side wording heuristic', () => {
    const controllerSource = fs.readFileSync(
      path.resolve('src/renderer/src/components/session-detail/hooks/useChatPanelController.ts'),
      'utf8'
    )
    expect(controllerSource).toContain('ipc.assessPageEdit(generatePayload)')
    expect(controllerSource).not.toContain('isExplicitSessionPageEditRequest')
    expect(controllerSource).toContain('const autoApplyPayload = { ...generatePayload, autoApply: true }')
  })
})
