import fs from 'node:fs'
import path from 'node:path'
import {
  enqueueHtmlThumbnails,
  type HtmlThumbnailRequest,
  type HtmlThumbnailTask
} from '../utils/html-thumbnail-service'

export async function warmStyleThumbnails(
  installedRootPath: string,
  styles: Array<{ id: string; style: string; source: string; packageDir?: string | null }>,
  delayMs = 500
): Promise<HtmlThumbnailTask[]> {
  const requests: HtmlThumbnailRequest[] = styles.flatMap((style) => {
    const packagePath = style.packageDir
      ? path.join(installedRootPath, style.packageDir)
      : style.source === 'builtin'
        ? path.join(installedRootPath, 'system', style.style)
        : path.join(installedRootPath, 'user', style.id)
    const sourcePath = path.join(packagePath, 'preview.html')
    return fs.existsSync(sourcePath)
      ? [{ resourceType: 'style', resourceId: style.id, sourcePath }]
      : []
  })
  return enqueueHtmlThumbnails(requests, { delayMs })
}
