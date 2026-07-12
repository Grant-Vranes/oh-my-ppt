import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

/**
 * 纯函数：把 HTML 里出现的 oldPageId（按词边界匹配）整体替换为 nextPageId，
 * 用于派生新页时避免 pageId 身份与源页串台。只依赖 cheerio，不碰 fs / electron / db，
 * 便于在单测环境直接验证。
 */
export const replacePageIdentity = (html: string, oldPageId: string, nextPageId: string): string => {
  const oldId = oldPageId.trim()
  if (!oldId || oldId === nextPageId) return html
  const escapedOldId = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const boundaryPattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapedOldId}(?=$|[^A-Za-z0-9_-])`, 'g')
  return html.replace(boundaryPattern, `$1${nextPageId}`)
}

export const clearVisibleText = ($: cheerio.CheerioAPI, root: cheerio.Cheerio<AnyNode>): void => {
  root.find('input, textarea').each((_, node) => {
    const el = $(node)
    el.removeAttr('value')
    el.removeAttr('placeholder')
    el.text('')
  })
  root.find('*').contents().each((_, node) => {
    const parentTag = node.parent?.type === 'tag' ? node.parent.name.toLowerCase() : ''
    if (parentTag === 'script' || parentTag === 'style') return
    if (node.type === 'text' && node.data?.trim()) {
      node.data = ''
    }
  })
}

/**
 * 基于源页 HTML 生成一个**空白页**：重写 pageId 身份 + 改 title，并清空
 * `.ppt-page-content` 内的可见文字、打上 data-blank-page 标记。
 */
export function buildBlankPageHtmlFromSource(args: {
  html: string
  oldPageId: string
  nextPageId: string
  title: string
}): string {
  const rewritten = replacePageIdentity(args.html, args.oldPageId, args.nextPageId)
  const $ = cheerio.load(rewritten, { scriptingEnabled: false })
  $('title').text(args.title)
  $('body').attr('data-page-id', args.nextPageId)
  $('[data-page-id]').each((_, node) => {
    const el = $(node)
    if ((el.attr('data-page-id') || '').trim() === args.oldPageId) {
      el.attr('data-page-id', args.nextPageId)
    }
  })

  const content = $('.ppt-page-content').first()
  if (content.length > 0) {
    clearVisibleText($, content)
    content.attr('data-blank-page', '1')
  }

  return $.html()
}

/**
 * 复制页面用：与 buildBlankPageHtmlFromSource 共用「换 pageId 身份 + 改 title」逻辑，
 * 但**保留全部可见内容**（不调用 clearVisibleText，不打 data-blank-page 标记），
 * 只把 pageId 相关身份重写到新页，避免两页之间 pageId/block 引用串台。
 */
export function buildDuplicatePageHtmlFromSource(args: {
  html: string
  oldPageId: string
  nextPageId: string
  title: string
}): string {
  const rewritten = replacePageIdentity(args.html, args.oldPageId, args.nextPageId)
  const $ = cheerio.load(rewritten, { scriptingEnabled: false })
  $('title').text(args.title)
  $('body').attr('data-page-id', args.nextPageId)
  $('[data-page-id]').each((_, node) => {
    const el = $(node)
    if ((el.attr('data-page-id') || '').trim() === args.oldPageId) {
      el.attr('data-page-id', args.nextPageId)
    }
  })
  return $.html()
}
