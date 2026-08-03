import { pathToFileURL } from 'node:url'
import path from 'node:path'
import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'

/**
 * 独立 HTML 编辑器（/edit-html）的导入归一化纯函数。
 *
 * 与 session-edit 完全解耦：不读 DB、不写 git、不碰 session 项目目录。
 * 仅做两件事：
 *   1. 轻量包裹成 slide 脚手架（`main.ppt-page-root[data-ppt-guard-root]` + `.ppt-page-fit-scope`），
 *      只固定设计宽度、不限定高度（document/滚动模式，支持长页）。
 *   2. 把相对资源引用改写为指向源文件目录的 `file://` URL，使工作文件 webview 仍能加载同目录资源。
 *
 * 全部为纯函数（html in → html out），便于单测。
 */

export const DEFAULT_DESIGN_WIDTH = 1280

const PROTOCOL_RE = /^(https?:|data:|blob:|file:|mailto:|tel:|javascript:|#|\/\/)/i
const EXTERNAL_MEDIA_PROTOCOLS = ['http:', 'https:']

/** 是否已含 slide 脚手架（`main.ppt-page-root[data-ppt-guard-root]`）。 */
export function hasSlideScaffold(html: string): boolean {
  const $ = cheerio.load(html, { scriptingEnabled: false })
  return $('main.ppt-page-root[data-ppt-guard-root]').length > 0
}

/**
 * 把一个相对 URL 解析为指向 `sourceDir` 的 `file://` URL。
 * 已是协议/片段/绝对路径/`..` 逃逸的，返回 null（保持原样）。
 */
function resolveRelativeUrl(url: string, sourceDir: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  if (PROTOCOL_RE.test(trimmed)) return null
  if (trimmed.startsWith('/')) return null // 绝对路径：v1 不改写
  // 分离 fragment / query，避免 pathToFileURL 把 # 编码成 %23
  let base = trimmed.replace(/^\.\//, '')
  let frag = ''
  const hashIdx = base.indexOf('#')
  if (hashIdx >= 0) {
    frag = base.slice(hashIdx)
    base = base.slice(0, hashIdx)
  }
  let query = ''
  const qIdx = base.indexOf('?')
  if (qIdx >= 0) {
    query = base.slice(qIdx)
    base = base.slice(0, qIdx)
  }
  if (!base) return null
  const resolved = path.resolve(sourceDir, base)
  const rel = path.relative(sourceDir, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null // 逃逸出 sourceDir：不改写
  return pathToFileURL(resolved).href + query + frag
}

function rewriteCssUrls(css: string, sourceDir: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (full, _quote, url) => {
    const r = resolveRelativeUrl(url, sourceDir)
    return r ? `url("${r}")` : full
  })
}

function injectRuntimeScripts($: cheerio.CheerioAPI, hrefs: string[]): void {
  if (hrefs.length === 0) return
  if ($('head').length === 0) $('<head></head>').prependTo('html')
  const existing = new Set(
    $('script[src]')
      .toArray()
      .map((el) => {
        const src = String($(el).attr('src') || '')
        const clean = src.split(/[?#]/, 1)[0]
        if (/^(?:https?:|\/\/)/i.test(clean)) return ''
        return clean.replace(/\\/g, '/').split('/').pop() || ''
      })
  )
  for (const href of hrefs) {
    const fileName = href.replace(/\\/g, '/').split(/[?#]/, 1)[0].split('/').pop() || ''
    if (!fileName || existing.has(fileName)) continue
    $('head').append($('<script></script>').attr('src', href))
    existing.add(fileName)
  }
}

/**
 * 编辑器中的文档由 webview 单独加载，不继承应用壳层的 CSP。导入页若自行限制
 * img-src/media-src，会让用户新增的外链媒体无法加载；仅放开这两类资源，不改脚本策略。
 */
function allowExternalMediaInDocumentCsp($: cheerio.CheerioAPI): void {
  $('meta[http-equiv]').each((_, el) => {
    const node = $(el)
    if ((node.attr('http-equiv') || '').trim().toLowerCase() !== 'content-security-policy') return
    const content = (node.attr('content') || '').trim()
    if (!content) return

    const directives = content
      .split(';')
      .map((rawDirective) => rawDirective.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name = '', ...values] = directive.split(/\s+/)
        const normalizedName = name.toLowerCase()
        if (normalizedName !== 'img-src' && normalizedName !== 'media-src') return directive
        const allowedValues = values.filter((value) => value !== "'none'")
        for (const protocol of EXTERNAL_MEDIA_PROTOCOLS) {
          if (!allowedValues.includes(protocol)) allowedValues.push(protocol)
        }
        return [name, ...allowedValues].join(' ')
      })

    const hasDirective = (name: 'img-src' | 'media-src'): boolean =>
      directives.some((directive) => directive.split(/\s+/, 1)[0]?.toLowerCase() === name)
    for (const name of ['img-src', 'media-src'] as const) {
      if (!hasDirective(name)) {
        directives.push(`${name} 'self' data: local-asset: file: http: https:`)
      }
    }

    node.attr('content', directives.join('; '))
  })
}

/**
 * 改写 HTML 内的相对资源引用为指向 `sourceDir` 的 `file://` URL。
 * 覆盖：`src`/`href`/`poster`/`xlink:href`/`srcset`、行内 `style` 与 `<style>` 内的 `url(...)`。
 * 保留 `http(s)`/`data`/`blob`/`file`/片段原样；`..` 逃逸与绝对路径不改写。
 */
export function rewriteRelativeAssetsToSource(input: { html: string; sourceDir: string }): string {
  const { html, sourceDir } = input
  const $ = cheerio.load(html, { scriptingEnabled: false })

  const rewriteAttr = (node: cheerio.Cheerio<AnyNode>, attr: string): void => {
    const v = node.attr(attr)
    if (!v) return
    const r = resolveRelativeUrl(v, sourceDir)
    if (r) node.attr(attr, r)
  }

  $('img,script,video,source,audio,embed,track,link,use,image').each((_, el) => {
    const node = $(el)
    rewriteAttr(node, 'src')
    rewriteAttr(node, 'href')
    rewriteAttr(node, 'poster')
    rewriteAttr(node, 'xlink:href')
    const ss = node.attr('srcset')
    if (ss) {
      const rewritten = ss
        .split(',')
        .map((part) => {
          const seg = part.trim()
          if (!seg) return seg
          const [url, ...desc] = seg.split(/\s+/)
          const r = resolveRelativeUrl(url, sourceDir)
          return r ? [r, ...desc].join(' ') : seg
        })
        .join(', ')
      node.attr('srcset', rewritten)
    }
  })

  $('*[style]').each((_, el) => {
    const node = $(el)
    const s = node.attr('style')
    if (s && s.includes('url(')) node.attr('style', rewriteCssUrls(s, sourceDir))
  })

  $('style').each((_, el) => {
    const node = $(el)
    const css = node.html()
    if (css && css.includes('url(')) node.html(rewriteCssUrls(css, sourceDir))
  })

  return $.html()
}

/**
 * 归一化导入的 HTML：
 *  - 确保有 `main.ppt-page-root[data-ppt-guard-root]` + `.ppt-page-fit-scope`（presentation editor runtime 依赖）；
 *  - 只设 `data-ppt-width`（designWidth），不设高度——document/滚动模式；
 *  - 确保 `body[data-page-id=docId]`；补齐图表运行时；保留原 `<head>`；
 *  - 相对资源改写为 `file://`。
 */
export function normalizeImportedHtml(input: {
  html: string
  sourceDir: string
  docId: string
  defaultDesignWidth?: number
  /** 注入 <head> 的运行时样式表 file:// URL。 */
  runtimeStyleHrefs?: string[]
  /** 注入 <head> 的运行时脚本 file:// URL（Chart.js、PPT runtime）。 */
  runtimeScriptHrefs?: string[]
}): { html: string; designWidth: number; title: string } {
  const { html, sourceDir, docId } = input
  const defaultWidth = input.defaultDesignWidth ?? DEFAULT_DESIGN_WIDTH
  const $ = cheerio.load(html, { scriptingEnabled: false })

  // 注入运行时样式
  const styles = input.runtimeStyleHrefs ?? []
  if (styles.length > 0) {
    if ($('head').length === 0) $('<head></head>').prependTo('html')
    for (const href of styles) {
      $('head').append(`<link rel="stylesheet" href="${href}">`)
    }
  }
  injectRuntimeScripts($, input.runtimeScriptHrefs ?? [])

  const title = $('title').first().text().trim() || ''
  let designWidth = defaultWidth

  const existing = $('main.ppt-page-root[data-ppt-guard-root]').first()
  if (existing.length > 0) {
    const w = parseInt(existing.attr('data-ppt-width') || '', 10)
    if (Number.isFinite(w) && w > 0) designWidth = w
    existing.removeAttr('data-ppt-height') // 不限定高度
    $('body').attr('data-page-id', docId)
  } else {
    const bodyInner = $('body').html() ?? ''
    $('body').empty()
    $('body').attr('data-page-id', docId)
    $('body').append(
      `<main class="ppt-page-root" data-ppt-guard-root="1" data-ppt-width="${designWidth}"><div class="ppt-page-fit-scope">${bodyInner}</div></main>`
    )
  }

  // 确保 fit-scope 存在
  if ($('.ppt-page-fit-scope').length === 0) {
    const main = $('main.ppt-page-root[data-ppt-guard-root]').first()
    const inner = main.html()
    main.empty().append(`<div class="ppt-page-fit-scope">${inner}</div>`)
  }

  allowExternalMediaInDocumentCsp($)

  let out = $.html()
  out = rewriteRelativeAssetsToSource({ html: out, sourceDir })
  return { html: out, designWidth, title }
}
