import { BrowserWindow, dialog, ipcMain, type WebContents } from 'electron'
import log from 'electron-log/main.js'
import type { IpcContext } from '../ipc/context'
import { importSessionFile } from '../session-import/session-importer'

export function registerSessionImportHandlers(ctx: IpcContext): void {
  const { mainWindow } = ctx

  const resolveOwnerWindow = (sender: WebContents): BrowserWindow =>
    BrowserWindow.fromWebContents(sender) ?? BrowserWindow.getFocusedWindow() ?? mainWindow

  ipcMain.handle('session:importFile', async (event) => {
    const ownerWindow = resolveOwnerWindow(event.sender)
    log.info('[session:importFile] open dialog')
    const openResult = await dialog.showOpenDialog(ownerWindow, {
      title: '导入会话文件',
      buttonLabel: '导入',
      properties: ['openFile'],
      filters: [
        { name: 'OhMyPPT 会话文件', extensions: ['zip', 'exe'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })

    if (openResult.canceled || openResult.filePaths.length === 0) {
      log.info('[session:importFile] cancelled')
      return { success: false, cancelled: true }
    }

    try {
      log.info('[session:importFile] selected file', {
        filePath: openResult.filePaths[0]
      })
      return await importSessionFile(ctx, openResult.filePaths[0])
    } catch (error) {
      log.error('[session:importFile] failed', {
        filePath: openResult.filePaths[0],
        message: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  })
}
