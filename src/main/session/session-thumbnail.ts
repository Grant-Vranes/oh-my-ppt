import {
  enqueueHtmlThumbnails,
  getFreshHtmlThumbnailPaths,
  type HtmlThumbnailRequest
} from '../utils/html-thumbnail-service'

const SESSION_THUMBNAIL_VARIANT = 'first-page'

export type SessionThumbnailEntry = {
  sessionId: string
  pageId?: string | null
  sourcePath?: string | null
}

function createSessionThumbnailRequest(
  sessionId: string,
  sourcePath: string | null | undefined,
  pageId: string | null | undefined
): HtmlThumbnailRequest | null {
  const normalizedSessionId = sessionId.trim()
  const normalizedSourcePath = typeof sourcePath === 'string' ? sourcePath.trim() : ''
  if (!normalizedSessionId || !normalizedSourcePath) {
    return null
  }
  return {
    resourceType: 'session',
    resourceId: normalizedSessionId,
    variant: SESSION_THUMBNAIL_VARIANT,
    sourcePath: normalizedSourcePath,
    pageId: typeof pageId === 'string' ? pageId.trim() : ''
  }
}

function entriesToRequests(entries: SessionThumbnailEntry[]): HtmlThumbnailRequest[] {
  const requests: HtmlThumbnailRequest[] = []
  for (const entry of entries) {
    const request = createSessionThumbnailRequest(entry.sessionId, entry.sourcePath, entry.pageId)
    if (request) requests.push(request)
  }
  return requests
}

export async function getSessionFirstPageThumbnails(
  entries: SessionThumbnailEntry[]
): Promise<Map<string, string>> {
  return getFreshHtmlThumbnailPaths(entriesToRequests(entries))
}

export async function warmSessionFirstPageThumbnails(
  entries: SessionThumbnailEntry[]
): Promise<Map<string, string>> {
  const requests = entriesToRequests(entries)
  let freshMap: Map<string, string>
  try {
    freshMap = await getFreshHtmlThumbnailPaths(requests)
  } catch (error) {
    console.warn('[session-thumbnail] fresh thumbnail lookup failed', error)
    return new Map()
  }
  const missing = requests.filter((request) => !freshMap.has(request.resourceId))
  if (missing.length > 0) {
    void enqueueHtmlThumbnails(missing).catch((error) => {
      console.warn('[session-thumbnail] background warmup failed', error)
    })
  }
  return freshMap
}
