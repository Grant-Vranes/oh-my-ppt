import type {
  ChatSendContext,
  ChatSendGuardInput,
  ResolveChatSendContextInput,
  SessionPreviewPage,
  SessionDetailChatType
} from '@renderer/types/session-detail'

export type MainSessionEditResolution =
  | { ready: true; selectPageIds: string[] }
  | { ready: false; reason: 'page-structure' | 'page-not-found' }

const ALL_PAGES_PATTERN = /\b(all|every|entire)\b|全部|所有|整套|全套|每一页|每页/i
const CURRENT_PAGE_PATTERN = /当前页|这一页|本页|current\s+(?:page|slide)|this\s+(?:page|slide)/i
const EXPLICIT_PAGE_PATTERN =
  /第\s*(?:\d+|[零一二两三四五六七八九十百]+)\s*页|\b(?:p|page|slide)\s*[-#]?\s*\d+\b|\/[a-z0-9_-]+\.html|当前页|这一页|本页|current\s+(?:page|slide)|this\s+(?:page|slide)/i
const PAGE_NUMBER_SOURCE = '(?:\\d+|[零一二两三四五六七八九十百]+)'
const PAGE_CONTENT_TARGET_PATTERN =
  /(?:页面|页)\s*(?:的\s*)?(?:标题|副标题|内容|文案|文字|图表|图片|元素|配色|颜色|样式|布局|背景)|(?:page|slide)\s*(?:['’]s\s*)?(?:title|heading|subtitle|content|copy|text|chart|image|element|color|style|layout|background)\b/i

const parseChinesePageNumber = (value: string): number | null => {
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  }
  const units: Record<string, number> = { 十: 10, 百: 100 }
  let total = 0
  let digit: number | null = null
  let previousUnit = Number.POSITIVE_INFINITY

  for (const character of value) {
    if (character in digits) {
      digit = digits[character]
      continue
    }
    const unit = units[character]
    if (!unit || unit >= previousUnit) return null
    total += (digit ?? 1) * unit
    digit = null
    previousUnit = unit
  }
  return total + (digit ?? 0)
}

const parsePageNumber = (value: string): number | null =>
  /^\d+$/.test(value) ? Number(value) : parseChinesePageNumber(value)

export function isUnsupportedMainSessionPageStructureRequest(userMessage: string): boolean {
  const text = userMessage.trim()
  if (PAGE_CONTENT_TARGET_PATTERN.test(text)) return false
  return (
    /(?:新增|添加|插入|复制)\s*(?:(?:一|两|几|\d+)\s*)?(?:个|张)?\s*(?:新)?(?:页|页面)/i.test(
      text
    ) ||
    /(?:删除|移除|删掉)\s*(?:(?:第\s*)?(?:\d+|[零一二两三四五六七八九十百]+)\s*(?:页|页面)|当前页|这一页|本页)(?:\s*$|[，。,.!?！？])/i.test(
      text
    ) ||
    /(?:调整|修改|移动|重排|重新排列).{0,8}(?:页面|页)(?:的)?顺序/i.test(text) ||
    /(?:add|insert|duplicate|create)\s+(?:(?:a|an|one|\d+)\s+)?(?:new\s+)?(?:page|slide)\b/i.test(
      text
    ) ||
    /(?:delete|remove)\s+(?:page|slide)\s*\d+\s*[.!?]?$/i.test(text) ||
    /(?:move|reorder)\s+(?:the\s+)?(?:pages?|slides?)(?:\s+order)?\b/i.test(text)
  )
}

export function resolveMainSessionEdit(
  userMessage: string,
  pages: Array<Pick<SessionPreviewPage, 'pageId' | 'pageNumber'>>,
  selectedPageId: string | undefined,
  requestedPageIds: string[] = []
): MainSessionEditResolution {
  if (isUnsupportedMainSessionPageStructureRequest(userMessage)) {
    return { ready: false, reason: 'page-structure' }
  }

  const pageById = new Map(pages.map((page) => [page.pageId.toLowerCase(), page]))
  const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]))
  const selectedIds = Array.from(
    new Set(
      requestedPageIds
        .map((pageId) => pageById.get(pageId.toLowerCase())?.pageId)
        .filter((pageId): pageId is string => Boolean(pageId))
    )
  )
  if (selectedIds.length > 0 || requestedPageIds.length > 0) {
    return selectedIds.length > 0
      ? { ready: true, selectPageIds: selectedIds }
      : { ready: false, reason: 'page-not-found' }
  }

  const pageIds = new Set<string>()
  const addPageNumber = (pageNumber: number): void => {
    const page = pageByNumber.get(pageNumber)
    if (page) pageIds.add(page.pageId)
  }

  if (CURRENT_PAGE_PATTERN.test(userMessage) && selectedPageId) pageIds.add(selectedPageId)

  for (const match of userMessage.matchAll(/\/([a-z0-9_-]+)\.html/gi)) {
    const page = pageById.get(match[1].toLowerCase())
    if (page) pageIds.add(page.pageId)
  }

  const rangePattern = new RegExp(
    `(?:第\\s*|(?:p|page|slide)\\s*)?(${PAGE_NUMBER_SOURCE})\\s*(?:页\\s*)?(?:到|至|[-~—–])\\s*(?:第\\s*|(?:p|page|slide)\\s*)?(${PAGE_NUMBER_SOURCE})\\s*(?:页|pages?|slides?)?`,
    'gi'
  )
  for (const match of userMessage.matchAll(rangePattern)) {
    const start = parsePageNumber(match[1])
    const end = parsePageNumber(match[2])
    if (start === null || end === null || Math.abs(end - start) > pages.length) continue
    const direction = start <= end ? 1 : -1
    for (let pageNumber = start; pageNumber !== end + direction; pageNumber += direction) {
      addPageNumber(pageNumber)
    }
  }

  const pageReferencePattern = new RegExp(
    `第\\s*(${PAGE_NUMBER_SOURCE})\\s*页|\\b(?:p|page|slide)\\s*[-#]?\\s*(\\d+)\\b`,
    'gi'
  )
  for (const match of userMessage.matchAll(pageReferencePattern)) {
    const pageNumber = parsePageNumber(match[1] || match[2])
    if (pageNumber !== null) addPageNumber(pageNumber)
  }

  for (const match of userMessage.matchAll(/第\s*([\d\s、,，和与及~-]+)\s*页/g)) {
    for (const pageNumber of match[1].matchAll(/\d+/g)) addPageNumber(Number(pageNumber[0]))
  }

  if (pageIds.size > 0) return { ready: true, selectPageIds: Array.from(pageIds) }
  if (ALL_PAGES_PATTERN.test(userMessage)) return { ready: true, selectPageIds: [] }
  if (EXPLICIT_PAGE_PATTERN.test(userMessage)) return { ready: false, reason: 'page-not-found' }
  return { ready: true, selectPageIds: [] }
}

export function isChatSendBlocked(input: ChatSendGuardInput): boolean {
  return (
    !input.sessionId ||
    input.sending ||
    input.generating ||
    (!input.input.trim() && input.pendingAssetCount === 0)
  )
}

export function resolveChatSendContext(input: ResolveChatSendContextInput): ChatSendContext {
  const selector = input.selectedSelector?.trim() || ''
  const hasSelector = selector.length > 0
  const chatType: SessionDetailChatType = hasSelector ? 'page' : input.chatType
  const targetPage = input.selectedPage ?? input.firstPage

  if (chatType === 'page') {
    if (!targetPage?.id) return { ready: false }
    return {
      ready: true,
      hasSelector,
      selector: hasSelector ? selector : null,
      chatType,
      targetPageId: targetPage.id,
      targetPagePath: targetPage.htmlPath || input.firstPage?.htmlPath,
      messagePageId: targetPage.id
    }
  }

  return {
    ready: true,
    hasSelector,
    selector: null,
    chatType,
    messagePageId: null
  }
}
