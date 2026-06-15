import fs from 'fs'
import path from 'path'
import * as cheerio from 'cheerio'

export const isMergePathInside = (candidate: string, root: string): boolean => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export const resolveMergeFileInside = async (
  candidate: string,
  root: string
): Promise<string | null> => {
  try {
    const [resolvedCandidate, resolvedRoot] = await Promise.all([
      fs.promises.realpath(candidate),
      fs.promises.realpath(root)
    ])
    return isMergePathInside(resolvedCandidate, resolvedRoot) ? resolvedCandidate : null
  } catch {
    return null
  }
}

const splitResourceSuffix = (value: string): { pathname: string; suffix: string } => {
  const match = value.match(/^([^?#]*)([?#].*)?$/)
  return { pathname: match?.[1] || value, suffix: match?.[2] || '' }
}

const isIgnoredMergeResourceValue = (value: string): boolean =>
  !value ||
  value.startsWith('#') ||
  /^(?:data|blob|https?|javascript|mailto|tel|local-asset):/i.test(value)

const normalizeResourceKey = (value: string): string | null => {
  const raw = value.trim().replace(/^['"]|['"]$/g, '')
  if (isIgnoredMergeResourceValue(raw)) return null
  const { pathname } = splitResourceSuffix(raw)
  if (!pathname || path.isAbsolute(pathname) || pathname.startsWith('/')) return null
  let decodedPathname = pathname
  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const normalized = path.posix.normalize(decodedPathname.replace(/\\/g, '/').replace(/^\.\//, ''))
  if (!normalized || normalized === '.' || normalized.startsWith('../')) return null
  return normalized
}

const unsafeLocalResourceValue = (value: string): string | null => {
  const raw = value.trim().replace(/^['"]|['"]$/g, '')
  if (isIgnoredMergeResourceValue(raw)) return null
  const { pathname } = splitResourceSuffix(raw)
  let decodedPathname = pathname
  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {
    return raw
  }
  if (/\.(?:woff2?|ttf|otf|eot)$/i.test(decodedPathname)) return null
  const normalized = path.posix.normalize(decodedPathname.replace(/\\/g, '/'))
  return path.isAbsolute(decodedPathname) ||
    decodedPathname.startsWith('/') ||
    normalized.startsWith('../')
    ? raw
    : null
}

const rewriteResourceValue = (value: string, resourcePathMap: Map<string, string>): string => {
  const { pathname, suffix } = splitResourceSuffix(value.trim())
  const key = normalizeResourceKey(pathname)
  if (!key) return value
  const replacement = resourcePathMap.get(key)
  return replacement ? `${replacement}${suffix}` : value
}

const rewriteSrcset = (value: string, resourcePathMap: Map<string, string>): string =>
  value
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim()
      if (!trimmed) return trimmed
      const [url, ...descriptor] = trimmed.split(/\s+/)
      return [rewriteResourceValue(url, resourcePathMap), ...descriptor].join(' ')
    })
    .join(', ')

const rewriteCssUrls = (value: string, resourcePathMap: Map<string, string>): string =>
  value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote: string, url: string) => {
    const rewritten = rewriteResourceValue(url, resourcePathMap)
    return rewritten === url ? full : `url(${quote}${rewritten}${quote})`
  })

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface MergePageFontProfile {
  titleFont: string
  bodyFont: string
  declaredFamilies: string[]
  headTags: string[]
}

const readCssVariable = (css: string, name: string): string => {
  const match = css.match(new RegExp(`${escapeRegExp(name)}\\s*:\\s*(["']?)([^;"'}]+)\\1`, 'i'))
  return match?.[2]?.trim() || ''
}

export function extractMergePageFontProfile(html: string): MergePageFontProfile | null {
  const $ = cheerio.load(html, { scriptingEnabled: false })
  const families = new Set<string>()
  const headTags: string[] = []
  let variableCss = ''
  $('style[data-ppt-fonts]').each((_, node) => {
    const marker = ($(node).attr('data-ppt-fonts') || '').trim()
    const css = $(node).text()
    headTags.push($.html(node))
    if (marker === '1') variableCss += `\n${css}`
  })
  $('style[data-ppt-fonts="google"], style[data-ppt-fonts="user"]').each((_, node) => {
    const css = $(node).text()
    for (const match of css.matchAll(/font-family\s*:\s*(["']?)([^;"'}]+)\1\s*;/gi)) {
      const family = match[2]?.trim()
      if (family) families.add(family)
    }
  })
  const titleFont = readCssVariable(variableCss, '--ppt-title-font')
  const bodyFont = readCssVariable(variableCss, '--ppt-body-font')
  if (!titleFont || !bodyFont || headTags.length === 0) return null
  return {
    titleFont,
    bodyFont,
    declaredFamilies: Array.from(families),
    headTags
  }
}

const buildFontFamilyMap = (
  sourceProfile: MergePageFontProfile | null,
  targetProfile: MergePageFontProfile,
  extraSourceFamilies: string[] = []
): Map<string, string> => {
  const replacements = new Map<string, string>()
  if (sourceProfile) {
    if (sourceProfile.titleFont) replacements.set(sourceProfile.titleFont, targetProfile.titleFont)
    if (sourceProfile.bodyFont && !replacements.has(sourceProfile.bodyFont)) {
      replacements.set(sourceProfile.bodyFont, targetProfile.bodyFont)
    }
    for (const family of sourceProfile.declaredFamilies) {
      if (!replacements.has(family)) replacements.set(family, targetProfile.bodyFont)
    }
  }
  for (const family of extraSourceFamilies) {
    if (!replacements.has(family)) replacements.set(family, targetProfile.bodyFont)
  }
  return replacements
}

const stripFontFaceBlocks = (css: string, families: Set<string>): string =>
  css.replace(/@font-face\s*\{([^{}]*)\}/gi, (_full, body: string) => {
    const family = body.match(/font-family\s*:\s*(["']?)([^;"'}]+)\1\s*;/i)?.[2]?.trim()
    if (family) families.add(family)
    return ''
  })

const replaceInjectedFontFamilies = (value: string, replacements: Map<string, string>): string => {
  let next = value
  for (const [sourceFamily, targetFamily] of replacements) {
    const escaped = escapeRegExp(sourceFamily)
    next = next.replace(
      new RegExp(`(["'])${escaped}\\1`, 'gi'),
      (_match, quote: string) => `${quote}${targetFamily}${quote}`
    )
    next = next.replace(
      new RegExp(`((?:font-family\\s*:|,)\\s*)${escaped}(?=\\s*(?:[,;}]))`, 'gi'),
      `$1${targetFamily}`
    )
    next = next.replace(
      new RegExp(`(--[A-Za-z0-9_-]*font[A-Za-z0-9_-]*\\s*:\\s*)${escaped}(?=\\s*[;}])`, 'gi'),
      `$1${targetFamily}`
    )
  }
  return next
}

const replacePageIdentityBoundary = (
  html: string,
  oldPageId: string,
  nextPageId: string
): string => {
  const oldId = oldPageId.trim()
  if (!oldId || oldId === nextPageId) return html
  const escapedOldId = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapedOldId}(?=$|[^A-Za-z0-9_-])`, 'g')
  return html.replace(pattern, `$1${nextPageId}`)
}

export function rewriteMergedPageHtml(args: {
  html: string
  oldPageId: string
  nextPageId: string
  resourcePathMap: Map<string, string>
  targetFontProfile: MergePageFontProfile
}): string {
  const $ = cheerio.load(args.html, { scriptingEnabled: false })
  const sourceFontProfile = extractMergePageFontProfile(args.html)
  const unmarkedFontFamilies = new Set<string>()
  $('style:not([data-ppt-fonts])').each((_, node) => {
    const element = $(node)
    element.text(stripFontFaceBlocks(element.html() || '', unmarkedFontFamilies))
  })
  const fontFamilyMap = buildFontFamilyMap(
    sourceFontProfile,
    args.targetFontProfile,
    Array.from(unmarkedFontFamilies)
  )
  $('style[data-ppt-fonts]').remove()
  $('link[href]').each((_, node) => {
    const element = $(node)
    const href = element.attr('href') || ''
    if (
      (element.attr('as') || '').toLowerCase() === 'font' ||
      /\.(?:woff2?|ttf|otf|eot)(?:[?#].*)?$/i.test(href)
    ) {
      element.remove()
    }
  })
  $('body').attr('data-page-id', args.nextPageId)
  $('[data-page-id]').each((_, node) => {
    const element = $(node)
    if ((element.attr('data-page-id') || '').trim() === args.oldPageId) {
      element.attr('data-page-id', args.nextPageId)
    }
  })
  const resourceAttributes = new Set(['src', 'poster', 'href', 'xlink:href', 'srcset', 'style'])
  $('*').each((_, node) => {
    const element = $(node)
    const attributes = element.attr() || {}
    for (const [attribute, value] of Object.entries(attributes)) {
      if (resourceAttributes.has(attribute) || typeof value !== 'string') continue
      element.attr(attribute, replacePageIdentityBoundary(value, args.oldPageId, args.nextPageId))
    }
  })
  $('[src], [poster], [href], [xlink\\:href], [srcset]').each((_, node) => {
    const element = $(node)
    for (const attribute of ['src', 'poster', 'href', 'xlink:href']) {
      const value = element.attr(attribute)
      if (value) element.attr(attribute, rewriteResourceValue(value, args.resourcePathMap))
    }
    const srcset = element.attr('srcset')
    if (srcset) element.attr('srcset', rewriteSrcset(srcset, args.resourcePathMap))
  })
  $('[style]').each((_, node) => {
    const element = $(node)
    const style = element.attr('style')
    if (style) {
      element.attr(
        'style',
        replaceInjectedFontFamilies(rewriteCssUrls(style, args.resourcePathMap), fontFamilyMap)
      )
    }
  })
  $('style').each((_, node) => {
    const element = $(node)
    element.text(
      replaceInjectedFontFamilies(
        rewriteCssUrls(element.html() || '', args.resourcePathMap),
        fontFamilyMap
      )
    )
  })
  $('script:not([src])').each((_, node) => {
    const element = $(node)
    element.text(replacePageIdentityBoundary(element.html() || '', args.oldPageId, args.nextPageId))
  })
  $('head').append(`\n${args.targetFontProfile.headTags.join('\n')}\n`)
  return $.html()
}

export function collectMergedPageResourceKeys(html: string): string[] {
  const keys = new Set<string>()
  const collect = (value?: string | null): void => {
    if (!value) return
    const key = normalizeResourceKey(value)
    if (key) keys.add(key)
  }
  const collectCss = (value?: string | null): void => {
    if (!value) return
    value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, _quote, url: string) => {
      collect(url)
      return full
    })
  }
  const $ = cheerio.load(html, { scriptingEnabled: false })
  $('[src], [poster], [href], [xlink\\:href], [srcset]').each((_, node) => {
    const element = $(node)
    collect(element.attr('src'))
    collect(element.attr('poster'))
    collect(element.attr('href'))
    collect(element.attr('xlink:href'))
    const srcset = element.attr('srcset')
    if (srcset) {
      srcset.split(',').forEach((candidate) => collect(candidate.trim().split(/\s+/)[0]))
    }
  })
  $('[style]').each((_, node) => collectCss($(node).attr('style')))
  $('style').each((_, node) => collectCss($(node).html()))
  return Array.from(keys).sort()
}

export function collectUnsafeMergedPageResourceReferences(html: string): string[] {
  const unsafe = new Set<string>()
  const collect = (value?: string | null): void => {
    if (!value) return
    const invalid = unsafeLocalResourceValue(value)
    if (invalid) unsafe.add(invalid)
  }
  const collectCss = (value?: string | null): void => {
    if (!value) return
    value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, _quote, url: string) => {
      collect(url)
      return full
    })
  }
  const $ = cheerio.load(html, { scriptingEnabled: false })
  $('[src], [poster], [href], [xlink\\:href], [srcset]').each((_, node) => {
    const element = $(node)
    collect(element.attr('src'))
    collect(element.attr('poster'))
    collect(element.attr('href'))
    collect(element.attr('xlink:href'))
    const srcset = element.attr('srcset')
    if (srcset) {
      srcset.split(',').forEach((candidate) => collect(candidate.trim().split(/\s+/)[0]))
    }
  })
  $('[style]').each((_, node) => collectCss($(node).attr('style')))
  $('style').each((_, node) => collectCss($(node).html()))
  return Array.from(unsafe).sort()
}
