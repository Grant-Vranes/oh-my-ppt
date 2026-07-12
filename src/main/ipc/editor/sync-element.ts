import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import { allocateBlockId, attrEscape } from './shared'

export const SYNC_ELEMENT_ATTR = 'data-ppt-sync-element-id'

const SYNC_ID_PREFIX = 'sync-'

export type ApplySyncElementResult = {
  html: string
  syncElementId: string
  changed: boolean
  inserted: boolean
  updated: boolean
}

const normalizeSyncElementId = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!text || text.length > 80) return ''
  return /^[a-zA-Z0-9_-]+$/.test(text) ? text : ''
}

const createSyncElementId = (): string => `${SYNC_ID_PREFIX}${allocateBlockId().replace(/^select-arcsin1-/, '')}`

function findFirstElement($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
  const bodyChildren = $('body').children()
  const element = bodyChildren.filter((_, node) => {
    const tagName = String((node as { tagName?: string }).tagName || '').toLowerCase()
    return tagName !== 'style'
  })
  if (element.length > 0) return element.first()
  return $.root().children().first()
}

function readSyncIdFromFragment(sourceHtmlFragment: string): string {
  const source = cheerio.load(sourceHtmlFragment, { scriptingEnabled: false })
  const element = findFirstElement(source)
  return normalizeSyncElementId(element.attr(SYNC_ELEMENT_ATTR))
}

function buildSourceElementHtml(args: {
  sourceHtmlFragment: string
  syncElementId: string
  blockId: string
}): string {
  const source = cheerio.load(args.sourceHtmlFragment, { scriptingEnabled: false })
  const element = findFirstElement(source)
  if (element.length === 0) throw new Error('无法读取要同步的元素')
  element.attr(SYNC_ELEMENT_ATTR, args.syncElementId)
  element.attr('data-block-id', args.blockId)
  return element.toString()
}

function findElementBySyncId(
  $: cheerio.CheerioAPI,
  syncElementId: string
): cheerio.Cheerio<AnyNode> {
  let matched: cheerio.Cheerio<AnyNode> | null = null
  $(`[${SYNC_ELEMENT_ATTR}]`).each((_, node) => {
    if (matched) return
    const item = $(node)
    if ((item.attr(SYNC_ELEMENT_ATTR) || '').trim() === syncElementId) {
      matched = item
    }
  })
  return matched || $([])
}

function resolveInsertParent($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
  const selectors = [
    'main[data-role="content"]',
    '[data-role="content"]',
    '.ppt-page-content main',
    '.ppt-page-content',
    'body'
  ]
  for (const selector of selectors) {
    const parent = $(selector).first()
    if (parent.length > 0) return parent
  }
  return $.root()
}

export function applySyncElementToPageHtml(args: {
  html: string
  sourceHtmlFragment: string
  syncElementId?: string
  preserveSourceBlockId?: string
}): ApplySyncElementResult {
  const requestedSyncId = normalizeSyncElementId(args.syncElementId)
  const fragmentSyncId = readSyncIdFromFragment(args.sourceHtmlFragment)
  const syncElementId = requestedSyncId || fragmentSyncId || createSyncElementId()
  const $ = cheerio.load(args.html, { scriptingEnabled: false })
  const existing = findElementBySyncId($, syncElementId)
  const existingBlockId = (existing.attr('data-block-id') || '').trim()
  const sourceBlockId =
    typeof args.preserveSourceBlockId === 'string' ? args.preserveSourceBlockId.trim() : ''
  const blockId = existingBlockId || sourceBlockId || allocateBlockId()
  const nextElementHtml = buildSourceElementHtml({
    sourceHtmlFragment: args.sourceHtmlFragment,
    syncElementId,
    blockId
  })

  let inserted = false
  let updated = false
  if (existing.length > 0) {
    const before = existing.toString()
    existing.replaceWith(nextElementHtml)
    updated = before !== nextElementHtml
  } else {
    resolveInsertParent($).append(`\n${nextElementHtml}\n`)
    inserted = true
  }

  const nextHtml = $.html()
  return {
    html: nextHtml,
    syncElementId,
    changed: inserted || updated || nextHtml !== args.html,
    inserted,
    updated
  }
}

export const syncElementSelector = (syncElementId: string): string =>
  `[${SYNC_ELEMENT_ATTR}="${attrEscape(syncElementId)}"]`
