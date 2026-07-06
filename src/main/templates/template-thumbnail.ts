import {
  enqueueHtmlThumbnail,
  enqueueHtmlThumbnails,
  getFreshHtmlThumbnailPaths,
  waitForHtmlThumbnailTask,
  type HtmlThumbnailRequest
} from '../utils/html-thumbnail-service'
import { TEMPLATE_THUMBNAIL_RESOURCE_TYPE } from '@shared/thumbnail'

const TEMPLATE_COVER_VARIANT = 'cover'

export type TemplateThumbnailEntry = {
  templateId: string
  pageId?: string | null
  sourcePath?: string | null
  width?: number
  height?: number
}

function entryToRequest(entry: TemplateThumbnailEntry): HtmlThumbnailRequest | null {
  const templateId = entry.templateId.trim()
  const sourcePath = typeof entry.sourcePath === 'string' ? entry.sourcePath.trim() : ''
  if (!templateId || !sourcePath) return null
  return {
    resourceType: TEMPLATE_THUMBNAIL_RESOURCE_TYPE,
    resourceId: templateId,
    variant: TEMPLATE_COVER_VARIANT,
    sourcePath,
    pageId: typeof entry.pageId === 'string' ? entry.pageId.trim() : '',
    captureWidth: entry.width,
    captureHeight: entry.height,
    thumbnailWidth: 640,
    thumbnailHeight:
      entry.width && entry.height
        ? Math.max(64, Math.round((640 * entry.height) / entry.width))
        : undefined
  }
}

function entriesToRequests(entries: TemplateThumbnailEntry[]): HtmlThumbnailRequest[] {
  const requests: HtmlThumbnailRequest[] = []
  for (const entry of entries) {
    const request = entryToRequest(entry)
    if (request) requests.push(request)
  }
  return requests
}

export async function captureTemplateCoverThumbnail(
  entry: TemplateThumbnailEntry
): Promise<string | null> {
  const request = entryToRequest(entry)
  if (!request) return null
  try {
    const task = await enqueueHtmlThumbnail(request)
    if (task.status === 'completed') return task.thumbnailPath
    const completed = await waitForHtmlThumbnailTask(
      request.resourceType,
      request.resourceId,
      request.variant
    )
    return completed.thumbnailPath
  } catch (error) {
    console.warn('[template-thumbnail] cover capture failed', error)
    return null
  }
}

export async function warmTemplateCoverThumbnails(
  entries: TemplateThumbnailEntry[],
  delayMs = 300
): Promise<Map<string, string>> {
  const requests = entriesToRequests(entries)
  let freshMap: Map<string, string>
  try {
    freshMap = await getFreshHtmlThumbnailPaths(requests)
  } catch (error) {
    console.warn('[template-thumbnail] fresh thumbnail lookup failed', error)
    return new Map()
  }

  const missing = requests.filter((request) => !freshMap.has(request.resourceId))
  if (missing.length > 0) {
    void enqueueHtmlThumbnails(missing, { delayMs }).catch((error) => {
      console.warn('[template-thumbnail] background warmup failed', error)
    })
  }
  return freshMap
}
