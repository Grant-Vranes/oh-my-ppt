export const HTML_THUMBNAIL_RESOURCE_TYPES = ['session', 'style', 'template'] as const

export type HtmlThumbnailResourceType = (typeof HTML_THUMBNAIL_RESOURCE_TYPES)[number]

export const TEMPLATE_THUMBNAIL_RESOURCE_TYPE: HtmlThumbnailResourceType = 'template'
