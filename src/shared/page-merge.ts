export const PAGE_MERGE_ERROR_CODES = [
  'PAGE_MERGE_INVALID_REQUEST',
  'PAGE_MERGE_SAME_SESSION',
  'PAGE_MERGE_NO_PAGE_SELECTED',
  'PAGE_MERGE_PAGE_LIMIT_EXCEEDED',
  'PAGE_MERGE_SESSION_NOT_FOUND',
  'PAGE_MERGE_SESSION_BUSY',
  'PAGE_MERGE_SLIDE_SIZE_MISMATCH',
  'PAGE_MERGE_SOURCE_PAGE_NOT_FOUND',
  'PAGE_MERGE_SOURCE_PAGE_UNAVAILABLE',
  'PAGE_MERGE_TARGET_FONT_UNAVAILABLE',
  'PAGE_MERGE_PAGE_COPY_FAILED',
  'PAGE_MERGE_INTERNAL_ERROR'
] as const

export type PageMergeErrorCode = (typeof PAGE_MERGE_ERROR_CODES)[number]

export const PAGE_MERGE_DISABLED_REASONS = [
  'PAGE_MERGE_SESSION_BUSY',
  'PAGE_MERGE_SESSION_EMPTY',
  'PAGE_MERGE_SLIDE_SIZE_MISMATCH',
  'PAGE_MERGE_PAGE_INCOMPLETE',
  'PAGE_MERGE_PAGE_FILE_MISSING'
] as const

export type PageMergeDisabledReason = (typeof PAGE_MERGE_DISABLED_REASONS)[number]

export class PageMergeError extends Error {
  constructor(
    readonly code: PageMergeErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'PageMergeError'
  }
}

export const readPageMergeErrorCode = (error: unknown): PageMergeErrorCode | null => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return PAGE_MERGE_ERROR_CODES.find((code) => message.includes(code)) || null
}
