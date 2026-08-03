import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import type { PPTDatabase } from '../../db/database'

export type SessionGenerationSnapshot = {
  session: Record<string, unknown> | null | undefined
  pages: Array<{
    pageNumber: number
    title: string
    html: string
    htmlPath?: string
    pageId?: string
    sourceUrl?: string
    status?: string
    error?: string | null
  }>
}

export type SessionProjectResolver = {
  getPageSourceUrl(htmlPath?: string): string | undefined
  validateProjectIndexHtml(html: string): string[]
  parseSessionMetadataObject(value: unknown): Record<string, unknown>
  buildSessionGenerationSnapshot(
    session: Record<string, unknown> | null | undefined,
    options?: { includeHtml?: boolean }
  ): Promise<SessionGenerationSnapshot>
  isPathInside(targetPath: string, rootPath: string): boolean
  resolveProjectPageHtmlPath(
    projectDir: string,
    fileSlug: string,
    candidatePath?: string | null
  ): string
  toSafeAssetBaseName(value: string): string
  resolveSessionProjectDir(sessionId: string): Promise<string>
}

export function createSessionProjectResolver(args: {
  db: PPTDatabase
}): SessionProjectResolver {
  const { db } = args

  const getPageSourceUrl = (htmlPath?: string): string | undefined => {
    if (!htmlPath || !fs.existsSync(htmlPath)) return undefined
    return pathToFileURL(htmlPath).toString()
  }

  const validateProjectIndexHtml = (html: string): string[] => {
    const errors: string[] = []
    if (!/<html[\s>]/i.test(html)) errors.push('index.html 缺少 <html> 标签')
    if (!/<body[\s>]/i.test(html)) errors.push('index.html 缺少 <body> 标签')
    if (!/<iframe\b[^>]*class=["'][^"']*\bppt-preview-frame\b/i.test(html)) {
      errors.push('index.html 缺少页面预览 iframe')
    }
    if (!/id=["']pages-data["']/i.test(html)) {
      errors.push('index.html 缺少 pages-data 页面数据')
    }
    const hasInlineJs =
      /const\s+pages\s*=\s*JSON\.parse/i.test(html) && /function\s+applyPage\s*\(/i.test(html)
    const hasExternalRuntime = /src=["'][^"']*index-runtime\.js["']/i.test(html)
    if (!hasInlineJs && !hasExternalRuntime) {
      errors.push('index.html 缺少页面数据解析逻辑')
    }
    return errors
  }

  const parseSessionMetadataObject = (value: unknown): Record<string, unknown> => {
    if (typeof value !== 'string' || value.trim().length === 0) return {}
    try {
      const parsed = JSON.parse(value) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }

  const isPathInside = (targetPath: string, rootPath: string): boolean => {
    const relative = path.relative(rootPath, targetPath)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  }

  const resolveProjectPageHtmlPath = (
    projectDir: string,
    fileSlug: string,
    candidatePath?: string | null
  ): string => {
    const projectRoot = path.resolve(projectDir)
    const fallbackPath = path.resolve(projectRoot, `${fileSlug}.html`)
    const rawCandidate = typeof candidatePath === 'string' ? candidatePath.trim() : ''
    if (!rawCandidate) return fallbackPath
    const resolvedCandidate = path.isAbsolute(rawCandidate)
      ? path.resolve(rawCandidate)
      : path.resolve(projectRoot, rawCandidate)
    if (!isPathInside(resolvedCandidate, projectRoot)) return fallbackPath
    return fs.existsSync(resolvedCandidate) ? resolvedCandidate : fallbackPath
  }

  const toSafeAssetBaseName = (value: string): string => {
    const parsed = path.parse(value)
    const fallback = parsed.name || 'image'
    const safe = fallback
      .normalize('NFKD')
      .replace(/[^\w\u4e00-\u9fff.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72)
    return safe || 'image'
  }

  const resolveSessionProjectDir = async (sessionId: string): Promise<string> => {
    const session = await db.getSession(sessionId)
    if (!session) throw new Error('Session not found')
    const project = await db.getProject(sessionId)
    const rootPath = typeof project?.root_path === 'string' ? project.root_path.trim() : ''
    if (!rootPath) throw new Error(`Session ${sessionId} has no root_path`)
    return path.resolve(rootPath)
  }

  const buildSessionGenerationSnapshot = async (
    session: Record<string, unknown> | null | undefined,
    options?: { includeHtml?: boolean }
  ): Promise<SessionGenerationSnapshot> => {
    if (!session) return { session, pages: [] }
    const sessionId = String(session.id || '').trim()
    if (!sessionId) return { session, pages: [] }

    const metadata = parseSessionMetadataObject(session.metadata)
    const sessionPages = await db.listSessionPages(sessionId)
    if (sessionPages.length === 0) return { session, pages: [] }

    const projectDir = await resolveSessionProjectDir(sessionId)
    const project = await db.getProject(sessionId)
    const indexPath = path.join(projectDir, 'index.html')
    const pages: SessionGenerationSnapshot['pages'] = []

    for (const page of sessionPages) {
      const pageId = page.file_slug
      const title = page.title || `第 ${page.page_number} 页`
      const htmlPath = resolveProjectPageHtmlPath(projectDir, pageId, page.html_path)
      const html =
        options?.includeHtml && fs.existsSync(htmlPath)
          ? await fs.promises.readFile(htmlPath, 'utf-8')
          : ''
      pages.push({
        pageNumber: page.page_number,
        title,
        html: options?.includeHtml ? html : '',
        htmlPath,
        pageId,
        sourceUrl: getPageSourceUrl(htmlPath),
        status: page.status,
        error: page.error
      })
    }

    const synthesizedMetadata = {
      ...metadata,
      entryMode: 'multi_page',
      indexPath,
      projectId: project?.id || metadata.projectId
    }
    const completedCount = pages.filter((page) => page.status === 'completed').length
    const failedCount = pages.filter((page) => page.status === 'failed').length

    return {
      session: {
        ...session,
        metadata: JSON.stringify(synthesizedMetadata),
        page_count: pages.length,
        generated_count: completedCount,
        failed_count: failedCount
      },
      pages: pages.sort((a, b) => a.pageNumber - b.pageNumber)
    }
  }

  return {
    getPageSourceUrl,
    validateProjectIndexHtml,
    parseSessionMetadataObject,
    buildSessionGenerationSnapshot,
    isPathInside,
    resolveProjectPageHtmlPath,
    toSafeAssetBaseName,
    resolveSessionProjectDir
  }
}
