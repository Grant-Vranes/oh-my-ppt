import { ipcMain } from 'electron'
import type { IpcContext } from '../ipc/context'
import {
  createEditableSessionFromTemplate,
  createSessionFromTemplate,
  createTemplateFromSession,
  deleteTemplate,
  getTemplate,
  importPptxAsTemplate,
  listTemplates,
  updateTemplateMetadata
} from './template-service'

export function registerTemplateHandlers(ctx: IpcContext): void {
  ipcMain.handle('templates:list', async () => listTemplates())

  ipcMain.handle('templates:get', async (_event, templateId: string) => getTemplate(templateId))

  ipcMain.handle('templates:createFromSession', async (_event, payload: unknown) =>
    createTemplateFromSession(ctx, payload)
  )

  ipcMain.handle('templates:createSession', async (_event, payload: unknown) =>
    createSessionFromTemplate(ctx, payload)
  )

  ipcMain.handle('templates:createEditableSession', async (_event, payload: unknown) =>
    createEditableSessionFromTemplate(ctx, payload)
  )

  ipcMain.handle('templates:importPptx', async (event, payload: unknown) =>
    importPptxAsTemplate(ctx, payload, (progress) => {
      event.sender.send('templates:importPptx:progress', progress)
    })
  )

  ipcMain.handle('templates:updateMetadata', async (_event, payload: unknown) =>
    updateTemplateMetadata(payload)
  )

  ipcMain.handle('templates:delete', async (_event, templateId: string) => deleteTemplate(templateId))
}
