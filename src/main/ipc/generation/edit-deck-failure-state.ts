export function resolveRemainingFailedPageInfo(args: {
  previousFailures: Map<string, { title: string; reason: string }>
  failedResults: Array<{ pageId: string; reason: string }>
  completedPageIds: Set<string>
  pageRefs: Array<{ pageId: string; title: string }>
}): Map<string, { title: string; reason: string }> {
  const remaining = new Map(args.previousFailures)
  const titleByPageId = new Map(args.pageRefs.map((page) => [page.pageId, page.title]))

  for (const failed of args.failedResults) {
    remaining.set(failed.pageId, {
      title: titleByPageId.get(failed.pageId) || failed.pageId,
      reason: failed.reason
    })
  }
  for (const pageId of args.completedPageIds) {
    remaining.delete(pageId)
  }
  return remaining
}
