export type StyleSwitchRetryPageRef = {
  id?: string | null
  page_id?: string | null
  file_slug?: string | null
  legacy_page_id?: string | null
  status?: string | null
}

export function resolveStyleSwitchRetryPageId(page: StyleSwitchRetryPageRef): string {
  return page.page_id || page.file_slug || page.legacy_page_id || page.id || ''
}

export function collectFailedStyleSwitchPageIds(pages: StyleSwitchRetryPageRef[]): string[] {
  return pages
    .filter((page) => page.status !== 'completed')
    .map(resolveStyleSwitchRetryPageId)
    .filter((pageId) => pageId.length > 0)
}

export function buildStyleSwitchUserMessage(styleName: string): string {
  return [
    `将整套演示文稿切换为现有风格「${styleName}」。`,
    '',
    '硬性要求：',
    '- 禁止修改每页文字内容。该页现有的全部可见文字、数字、数据、标题、段落和标签必须逐字逐项原样保留。',
    '- 禁止删减、改写、概括、扩写、翻译或新增任何文字与数据，包括标点、数值和单位。',
    '- 禁止把文字或数据移动到其他页面；每页内容必须留在原页。',
    '- 禁止增删页面或改变页面顺序。',
    '- 允许为适配新风格重新设计页面布局、视觉层级、图形结构和装饰表现。',
    '- 可以调整配色、字体、字号、间距、边框、背景、对齐和元素位置。',
    '- 禁止沿用此前风格的配色、装饰和布局语言；视觉设计必须以当前现有风格规范为准。',
    '- 必须使用当前会话中已经切换完成的现有风格规范。',
    '',
    '再次强调：禁止修改每页文字内容和数据，必须逐字逐项原样保留；页面布局与视觉结构可以按现有风格重新设计。'
  ].join('\n')
}
