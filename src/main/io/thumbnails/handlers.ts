import { onHtmlThumbnailTaskChanged } from './html-thumbnail-service'
import type { IpcContext } from '../../ipc/context'

export function registerThumbnailHandlers(ctx: IpcContext): void {
  onHtmlThumbnailTaskChanged((task) => {
    if (ctx.mainWindow.isDestroyed() || ctx.mainWindow.webContents.isDestroyed()) return
    ctx.mainWindow.webContents.send('thumbnails:changed', task)
  })
}
