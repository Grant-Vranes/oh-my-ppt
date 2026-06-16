import { ipcMain } from 'electron'
import log from 'electron-log/main.js'
import type { IpcContext } from '../context'
import { resolveGlobalModelTimeouts, resolveModelConfigForTask } from './model-config-utils'
import {
  getStylePackageDirectory,
  saveGeneratedStylePreview
} from '../../utils/style-skills'
import { generateStylePreviewHtml } from '../../utils/style-preview-generator'
import {
  enqueueHtmlThumbnail,
  waitForHtmlThumbnailTask
} from '../../utils/html-thumbnail-service'

export function registerStylePreviewHandlers(ctx: IpcContext): void {
  ipcMain.handle('styles:generatePreview', async (_event, payload) => {
    const styleId = typeof payload?.styleId === 'string' ? payload.styleId.trim() : ''
    if (!styleId) throw new Error('styleId 为空')

    log.info('[styles:generatePreview] requested', { styleId })
    const activeModel = await resolveModelConfigForTask(ctx, {
      modelConfigId: payload?.modelConfigId,
      purpose: 'styles:generatePreview'
    })
    const modelTimeouts = await resolveGlobalModelTimeouts(ctx)
    const previewHtml = await generateStylePreviewHtml({
      styleId,
      stylePackageDir: getStylePackageDirectory(styleId),
      provider: activeModel.provider,
      apiKey: activeModel.apiKey,
      model: activeModel.model,
      baseUrl: activeModel.baseUrl,
      maxTokens: activeModel.maxTokens,
      modelTimeoutMs: modelTimeouts.document
    })
    const result = await saveGeneratedStylePreview(styleId, previewHtml)
    const thumbnailTask = await enqueueHtmlThumbnail(
      { resourceType: 'style', resourceId: styleId, sourcePath: result.previewPath },
      { force: true }
    )
    const completedThumbnail =
      thumbnailTask.status === 'completed'
        ? thumbnailTask
        : await waitForHtmlThumbnailTask('style', styleId)

    return { success: true, ...result, thumbnailPath: completedThumbnail.thumbnailPath }
  })
}
