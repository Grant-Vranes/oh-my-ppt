import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type { SessionPageRecord } from '../db/database'
import { GitHistoryService } from '../history/git-history-service'
import { ensureMasterStyleLink, hasUniqueMasterStyleLink } from '../presentation/html/master-link'
import {
  copyProjectFontResources,
  resolveProjectFontResources
} from '../presentation/fonts/font-registry'
import type { IpcContext } from '../ipc/context'
import {
  getMasterFontFamilies,
  MASTER_CSS_FILENAME,
  normalizeMasterConfig,
  type SessionMasterConfig,
  type SessionMasterStatus
} from '@shared/master'
import { getSessionMasterPath, readSessionMaster, writeSessionMaster } from './master-service'

type FileSnapshot = {
  path: string
  exists: boolean
  content?: Buffer
}

type ExistingPage = {
  record: SessionPageRecord
  htmlPath: string
  html: string
}

type PageCounts = Pick<
  SessionMasterStatus,
  'linkedPageCount' | 'unlinkedPageCount' | 'missingPageCount' | 'totalPageCount'
>

const sessionLocks = new Map<string, Promise<void>>()

const runExclusive = async <T>(sessionId: string, task: () => Promise<T>): Promise<T> => {
  let release: () => void = () => undefined
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const previous = sessionLocks.get(sessionId) || Promise.resolve()
  sessionLocks.set(sessionId, current)
  await previous
  try {
    return await task()
  } finally {
    release()
    if (sessionLocks.get(sessionId) === current) sessionLocks.delete(sessionId)
  }
}

const isInside = (candidate: string, root: string): boolean => {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

const readSnapshot = async (filePath: string): Promise<FileSnapshot> => {
  try {
    return { path: filePath, exists: true, content: await fs.promises.readFile(filePath) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: filePath, exists: false }
    throw error
  }
}

const writeAtomically = async (filePath: string, content: string | Buffer): Promise<void> => {
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fs.promises.writeFile(tempPath, content)
    await fs.promises.rename(tempPath, filePath)
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined)
  }
}

const restoreSnapshot = async (snapshot: FileSnapshot): Promise<void> => {
  if (!snapshot.exists) {
    await fs.promises.rm(snapshot.path, { force: true })
    return
  }
  await writeAtomically(snapshot.path, snapshot.content || Buffer.alloc(0))
}

const getRevision = (css: string): string =>
  crypto.createHash('sha256').update(css, 'utf8').digest('hex')

const assertMutableSession = (ctx: IpcContext, sessionId: string): void => {
  const runState = ctx.sessionRunStates.get(sessionId)
  if (runState?.status === 'queued' || runState?.status === 'running') {
    throw new Error('当前会话正在生成或编辑，暂时不能修改母版。')
  }
}

const resolveExistingPages = async (
  projectDir: string,
  records: SessionPageRecord[]
): Promise<{ pages: ExistingPage[]; missingPageCount: number }> => {
  const projectRoot = await fs.promises.realpath(projectDir)
  const pages: ExistingPage[] = []
  let missingPageCount = 0
  for (const record of records) {
    const rawPath = typeof record.html_path === 'string' ? record.html_path.trim() : ''
    const candidate = path.resolve(projectRoot, rawPath || `${record.file_slug}.html`)
    try {
      const htmlPath = await fs.promises.realpath(candidate)
      if (!isInside(htmlPath, projectRoot)) {
        missingPageCount += 1
        continue
      }
      pages.push({ record, htmlPath, html: await fs.promises.readFile(htmlPath, 'utf-8') })
    } catch {
      missingPageCount += 1
    }
  }
  return { pages, missingPageCount }
}

const summarizePages = async (
  projectDir: string,
  records: SessionPageRecord[],
  masterExists: boolean
): Promise<PageCounts> => {
  const { pages, missingPageCount } = await resolveExistingPages(projectDir, records)
  const linkedPageCount = masterExists
    ? pages.filter((page) => hasUniqueMasterStyleLink(page.html)).length
    : 0
  return {
    linkedPageCount,
    unlinkedPageCount: pages.length - linkedPageCount,
    missingPageCount,
    totalPageCount: records.length
  }
}

const getStatus = async (
  ctx: IpcContext,
  sessionId: string,
  projectDir: string
): Promise<SessionMasterStatus> => {
  const [master, records] = await Promise.all([
    readSessionMaster(projectDir),
    ctx.db.listSessionPages(sessionId)
  ])
  return {
    ...master,
    revision: getRevision(master.css),
    ...(await summarizePages(projectDir, records, master.exists))
  }
}

const getAllowedPaths = async (projectDir: string, pages: ExistingPage[]): Promise<string[]> => {
  const root = await fs.promises.realpath(projectDir)
  return [
    MASTER_CSS_FILENAME,
    ...pages.map((page) => path.relative(root, page.htmlPath).split(path.sep).join('/'))
  ]
}

const getFontAllowedPaths = async (
  projectDir: string,
  resources: Awaited<ReturnType<typeof resolveProjectFontResources>>
): Promise<string[]> => {
  const root = path.resolve(projectDir)
  return resources.assets
    .map((asset) => path.relative(root, path.resolve(asset.targetPath)).split(path.sep).join('/'))
    .filter((relativePath) => relativePath.startsWith('assets/fonts/'))
}

const getBackgroundImageAllowedPaths = async (
  projectDir: string,
  config: SessionMasterConfig
): Promise<string[]> => {
  if (config.backgroundStyle !== 'image' || !config.backgroundImage) return []
  const projectRoot = await fs.promises.realpath(projectDir)
  const imageRootPath = path.resolve(projectRoot, 'images')
  const imagePath = path.resolve(projectRoot, config.backgroundImage)
  const relativePath = path.relative(projectRoot, imagePath).split(path.sep).join('/')
  if (!relativePath.startsWith('images/') || !isInside(imagePath, imageRootPath)) {
    throw new Error('母版背景图片路径无效。')
  }
  const [imageRoot, imageStat] = await Promise.all([
    fs.promises.realpath(imageRootPath).catch(() => ''),
    fs.promises.lstat(imagePath).catch(() => null)
  ])
  if (
    !imageRoot ||
    !isInside(imageRoot, projectRoot) ||
    !imageStat?.isFile() ||
    imageStat.isSymbolicLink()
  ) {
    throw new Error('母版背景图片不存在或不安全。')
  }
  const resolvedImagePath = await fs.promises.realpath(imagePath).catch(() => '')
  if (!resolvedImagePath || !isInside(resolvedImagePath, imageRoot)) {
    throw new Error('母版背景图片不存在或不安全。')
  }
  return [relativePath]
}

const rewriteUnlinkedPages = (pages: ExistingPage[]): Array<{ path: string; html: string }> =>
  pages
    .map((page) => ({ path: page.htmlPath, html: ensureMasterStyleLink(page.html) }))
    .filter((page, index) => page.html !== pages[index]?.html)

const restoreAll = async (snapshots: FileSnapshot[]): Promise<void> => {
  for (const snapshot of [...snapshots].reverse()) await restoreSnapshot(snapshot)
}

export async function getSessionMasterStatus(
  ctx: IpcContext,
  sessionId: string
): Promise<SessionMasterStatus> {
  const projectDir = await ctx.resolveSessionProjectDir(sessionId)
  return getStatus(ctx, sessionId, projectDir)
}

export async function saveSessionMaster(
  ctx: IpcContext,
  sessionId: string,
  config: SessionMasterConfig
): Promise<SessionMasterStatus> {
  return runExclusive(sessionId, async () => {
    assertMutableSession(ctx, sessionId)
    const normalizedConfig = normalizeMasterConfig(config)
    const projectDir = await ctx.resolveSessionProjectDir(sessionId)
    const history = new GitHistoryService(ctx.db)
    await history.ensureBaseline(sessionId, projectDir)
    const records = await ctx.db.listSessionPages(sessionId)
    const { pages, missingPageCount } = await resolveExistingPages(projectDir, records)
    if (missingPageCount > 0) throw new Error('存在缺失或不安全的页面文件，无法保存并应用母版。')
    const fontResources = await resolveProjectFontResources(
      getMasterFontFamilies(normalizedConfig),
      projectDir
    )
    const backgroundImageAllowedPaths = await getBackgroundImageAllowedPaths(
      projectDir,
      normalizedConfig
    )
    const masterSnapshot = await readSnapshot(getSessionMasterPath(projectDir))
    const rewrittenPages = rewriteUnlinkedPages(pages)
    const pageSnapshots = await Promise.all(rewrittenPages.map((page) => readSnapshot(page.path)))
    const fontSnapshots = await Promise.all(
      fontResources.assets.map((asset) => readSnapshot(asset.targetPath))
    )
    const allowedPaths = [
      ...(await getAllowedPaths(projectDir, pages)),
      ...(await getFontAllowedPaths(projectDir, fontResources)),
      ...backgroundImageAllowedPaths
    ]
    try {
      await copyProjectFontResources(fontResources)
      await writeSessionMaster(projectDir, normalizedConfig, fontResources.css)
      for (const page of rewrittenPages) await writeAtomically(page.path, page.html)
      const operation = await history.recordOperation({
        sessionId,
        projectDir,
        type: 'edit',
        scope: 'session',
        prompt: '修改并应用演示母版',
        metadata: { feature: 'slide-master', action: 'save-and-apply' },
        allowedPaths
      })
      try {
        return await getStatus(ctx, sessionId, projectDir)
      } catch (error) {
        if (operation) {
          await history.rollbackCommittedOperation({
            sessionId,
            projectDir,
            operation,
            allowedPaths,
            reason: error instanceof Error ? error.message : String(error)
          })
        }
        throw error
      }
    } catch (error) {
      await restoreAll([masterSnapshot, ...pageSnapshots, ...fontSnapshots]).catch(() => undefined)
      throw error
    }
  })
}
