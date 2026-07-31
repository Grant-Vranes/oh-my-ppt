import * as cheerio from 'cheerio'
import { MASTER_CSS_HREF, MASTER_LINK_SELECTOR } from '@shared/master'

export const buildMasterStyleLink = (): string =>
  `<link rel="stylesheet" href="${MASTER_CSS_HREF}" data-ppt-master="1">`

const isMasterHref = (href: string | undefined): boolean => {
  if (!href) return false
  const normalized = href.trim().split(/[?#]/, 1)[0]?.replace(/\\/g, '/')
  return (
    normalized === MASTER_CSS_HREF ||
    normalized === MASTER_CSS_HREF.slice(2)
  )
}

export function ensureMasterStyleLink(html: string): string {
  const $ = cheerio.load(html, { scriptingEnabled: false })
  if ($('head').length === 0) $('html').prepend('<head></head>')
  $('link').each((_, element) => {
    const link = $(element)
    if (link.is(MASTER_LINK_SELECTOR) || isMasterHref(link.attr('href'))) link.remove()
  })
  $('head').append(`\n    ${buildMasterStyleLink()}\n`)
  return $.html()
}

export function hasUniqueMasterStyleLink(html: string): boolean {
  const $ = cheerio.load(html, { scriptingEnabled: false })
  const masterLinks = $('link').filter((_, element) => isMasterHref($(element).attr('href')))
  if (masterLinks.length !== 1) return false
  const link = masterLinks.first()
  return link.is(MASTER_LINK_SELECTOR) && link.attr('href') === MASTER_CSS_HREF
}

export function setMasterPageNumber(html: string, pageNumber: number): string {
  const normalizedPageNumber = Math.max(1, Math.floor(pageNumber))
  if (!Number.isFinite(normalizedPageNumber)) return html
  const $ = cheerio.load(html, { scriptingEnabled: false })
  const value = String(normalizedPageNumber)
  $('body').first().attr('data-ppt-page-number', value)
  $('.ppt-page-root[data-ppt-guard-root="1"]').first().attr('data-ppt-page-number', value)
  return $.html()
}

export function isMasterElementsDisabled(html: string): boolean {
  const $ = cheerio.load(html, { scriptingEnabled: false })
  return (
    $('body').first().attr('data-ppt-master-off') === '1' ||
    $('.ppt-page-root[data-ppt-guard-root="1"]').first().attr('data-ppt-master-off') === '1'
  )
}

export function setMasterElementsDisabled(html: string, disabled: boolean): string {
  const $ = cheerio.load(html, { scriptingEnabled: false })
  const body = $('body').first()
  const root = $('.ppt-page-root[data-ppt-guard-root="1"]').first()
  if (disabled) {
    body.attr('data-ppt-master-off', '1')
    root.attr('data-ppt-master-off', '1')
  } else {
    body.removeAttr('data-ppt-master-off')
    root.removeAttr('data-ppt-master-off')
  }
  return $.html()
}
