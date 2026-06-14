import { onHtmlThumbnailTaskChanged } from '../../utils/html-thumbnail-service'
import type { IpcContext } from '../context'

export function registerThumbnailHandlers(ctx: IpcContext): void {
  onHtmlThumbnailTaskChanged((task) => {
    if (ctx.mainWindow.isDestroyed() || ctx.mainWindow.webContents.isDestroyed()) return
    ctx.mainWindow.webContents.send('thumbnails:changed', task)
  })
}
