import {
  enqueueHtmlThumbnail,
  enqueueHtmlThumbnails,
  getFreshHtmlThumbnailPaths,
  type HtmlThumbnailRequest
} from '../io/thumbnails/html-thumbnail-service'

const HTML_EDITOR_THUMBNAIL_VARIANT = 'cover'
const THUMBNAIL_WIDTH = 640
const THUMBNAIL_HEIGHT = 360

export type HtmlEditorThumbnailEntry = {
  id: string
  htmlPath?: string | null
  designWidth?: number | null
}

function entryToRequest(entry: HtmlEditorThumbnailEntry): HtmlThumbnailRequest | null {
  const resourceId = entry.id.trim()
  const sourcePath = typeof entry.htmlPath === 'string' ? entry.htmlPath.trim() : ''
  if (!resourceId || !sourcePath) return null

  const designWidth =
    typeof entry.designWidth === 'number' && Number.isFinite(entry.designWidth)
      ? Math.round(entry.designWidth)
      : 1280
  const captureWidth = Math.max(640, Math.min(2048, designWidth))

  return {
    resourceType: 'html-editor',
    resourceId,
    variant: HTML_EDITOR_THUMBNAIL_VARIANT,
    sourcePath,
    captureWidth,
    captureHeight: Math.round((captureWidth * 9) / 16),
    thumbnailWidth: THUMBNAIL_WIDTH,
    thumbnailHeight: THUMBNAIL_HEIGHT
  }
}

function entriesToRequests(entries: HtmlEditorThumbnailEntry[]): HtmlThumbnailRequest[] {
  const requests: HtmlThumbnailRequest[] = []
  for (const entry of entries) {
    const request = entryToRequest(entry)
    if (request) requests.push(request)
  }
  return requests
}

export async function warmHtmlEditorCoverThumbnails(
  entries: HtmlEditorThumbnailEntry[]
): Promise<Map<string, string>> {
  const requests = entriesToRequests(entries)
  let freshMap: Map<string, string>
  try {
    freshMap = await getFreshHtmlThumbnailPaths(requests)
  } catch (error) {
    console.warn('[html-editor-thumbnail] fresh thumbnail lookup failed', error)
    return new Map()
  }

  const missing = requests.filter((request) => !freshMap.has(request.resourceId))
  if (missing.length > 0) {
    void enqueueHtmlThumbnails(missing).catch((error) => {
      console.warn('[html-editor-thumbnail] background warmup failed', error)
    })
  }
  return freshMap
}

export function refreshHtmlEditorCoverThumbnail(entry: HtmlEditorThumbnailEntry): void {
  const request = entryToRequest(entry)
  if (!request) return
  void enqueueHtmlThumbnail(request, { force: true }).catch((error) => {
    console.warn('[html-editor-thumbnail] refresh failed', error)
  })
}
