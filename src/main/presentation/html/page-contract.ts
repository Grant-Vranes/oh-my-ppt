export const SHARED_PAGE_STYLES_START = '/* SHARED_PAGE_STYLES_START */'
export const SHARED_PAGE_STYLES_END = '/* SHARED_PAGE_STYLES_END */'

export const pageContentStartMarker = (pageId: string): string =>
  `<!-- PAGE_CONTENT_START:${pageId} -->`
export const pageContentEndMarker = (pageId: string): string => `<!-- PAGE_CONTENT_END:${pageId} -->`
