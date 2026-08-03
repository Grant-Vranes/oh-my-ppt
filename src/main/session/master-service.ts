import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import {
  MASTER_CSS_FILENAME,
  MASTER_DIRECTORY,
  MASTER_HTML_FILENAME,
  buildDefaultMasterConfig,
  buildMasterCss,
  buildMasterElementsHtml,
  normalizeMasterConfig,
  parseMasterCss,
  parseMasterElementsHtml,
  type SessionMasterConfig
} from '@shared/master'
import {
  MASTER_LAYOUTS_FILENAME,
  buildDefaultSessionLayoutLibrary,
  normalizeSessionLayoutLibrary,
  type SessionLayoutLibrary
} from '@shared/layout-master'

export type SessionMasterReadResult = {
  css: string
  html: string
  config: SessionMasterConfig
  exists: boolean
}

export type SessionLayoutLibraryReadResult = {
  library: SessionLayoutLibrary
  exists: boolean
}

const rebaseMasterAssetUrls = (css: string): string =>
  css
    .replace(/url\(\s*(["'])\.\/assets\//gi, 'url($1../assets/')
    .replace(/url\(\s*(["'])\.\/images\//gi, 'url($1../images/')

const unbaseMasterAssetUrls = (css: string): string =>
  css
    .replace(/url\(\s*(["'])\.\.\/assets\//gi, 'url($1./assets/')
    .replace(/url\(\s*(["'])\.\.\/images\//gi, 'url($1./images/')

const writeAtomically = async (filePath: string, content: string): Promise<void> => {
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fs.promises.writeFile(tempPath, content, 'utf-8')
    await fs.promises.rename(tempPath, filePath)
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined)
  }
}

const readFileIfExists = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.promises.readFile(filePath, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export const getSessionMasterDirectory = (projectDir: string): string =>
  path.join(path.resolve(projectDir), MASTER_DIRECTORY)

export const getSessionMasterPath = (projectDir: string): string =>
  path.join(getSessionMasterDirectory(projectDir), MASTER_CSS_FILENAME)

export const getSessionMasterHtmlPath = (projectDir: string): string =>
  path.join(getSessionMasterDirectory(projectDir), MASTER_HTML_FILENAME)

export const getSessionMasterLayoutsPath = (projectDir: string): string =>
  path.join(getSessionMasterDirectory(projectDir), MASTER_LAYOUTS_FILENAME)

const toResult = (css: string, html: string, exists: boolean): SessionMasterReadResult => {
  const cssConfig = parseMasterCss(unbaseMasterAssetUrls(css))
  return {
    css,
    html,
    config: normalizeMasterConfig({
      ...cssConfig,
      elements: parseMasterElementsHtml(html)
    }),
    exists
  }
}

export async function readSessionMaster(projectDir: string): Promise<SessionMasterReadResult> {
  const [canonicalCss, masterHtml] = await Promise.all([
    readFileIfExists(getSessionMasterPath(projectDir)),
    readFileIfExists(getSessionMasterHtmlPath(projectDir))
  ])
  if (canonicalCss === null) {
    const config = buildDefaultMasterConfig()
    return {
      css: buildMasterCss(config),
      html: masterHtml || buildMasterElementsHtml(config.elements),
      config: normalizeMasterConfig({ ...config, elements: parseMasterElementsHtml(masterHtml || '') }),
      exists: false
    }
  }
  const cssConfig = parseMasterCss(unbaseMasterAssetUrls(canonicalCss))
  return toResult(canonicalCss, masterHtml || buildMasterElementsHtml(cssConfig.elements), true)
}

export async function readSessionLayoutLibrary(
  projectDir: string
): Promise<SessionLayoutLibraryReadResult> {
  const raw = await readFileIfExists(getSessionMasterLayoutsPath(projectDir))
  if (raw === null) return { library: buildDefaultSessionLayoutLibrary(), exists: false }
  try {
    return { library: normalizeSessionLayoutLibrary(JSON.parse(raw)), exists: true }
  } catch {
    return { library: buildDefaultSessionLayoutLibrary(), exists: true }
  }
}

export async function writeSessionLayoutLibrary(
  projectDir: string,
  value: unknown
): Promise<SessionLayoutLibraryReadResult> {
  const library = normalizeSessionLayoutLibrary(value)
  await writeAtomically(
    getSessionMasterLayoutsPath(projectDir),
    `${JSON.stringify(library, null, 2)}\n`
  )
  return { library, exists: true }
}

export async function createSessionLayoutLibraryIfMissing(
  projectDir: string
): Promise<SessionLayoutLibraryReadResult> {
  const existing = await readFileIfExists(getSessionMasterLayoutsPath(projectDir))
  if (existing !== null) return readSessionLayoutLibrary(projectDir)
  return writeSessionLayoutLibrary(projectDir, buildDefaultSessionLayoutLibrary())
}

async function writeSessionMasterFiles(
  projectDir: string,
  value: unknown,
  fontFaceCss = ''
): Promise<SessionMasterReadResult> {
  const config = normalizeMasterConfig(value)
  const css = rebaseMasterAssetUrls(buildMasterCss(config, fontFaceCss))
  const html = buildMasterElementsHtml(config.elements)
  await Promise.all([
    writeAtomically(getSessionMasterPath(projectDir), css),
    writeAtomically(getSessionMasterHtmlPath(projectDir), html)
  ])
  return { css, html, config, exists: true }
}

export async function writeSessionMaster(
  projectDir: string,
  value: unknown,
  fontFaceCss = ''
): Promise<SessionMasterReadResult> {
  return writeSessionMasterFiles(projectDir, value, fontFaceCss)
}

/**
 * This is only called while creating a fresh session copy, before its first
 * history baseline. Runtime refresh and ordinary reads deliberately do not
 * create master files.
 */
export async function createSessionMasterIfMissing(projectDir: string): Promise<SessionMasterReadResult> {
  const canonicalCssPath = getSessionMasterPath(projectDir)
  const canonicalHtmlPath = getSessionMasterHtmlPath(projectDir)
  const [canonicalCss, canonicalHtml] = await Promise.all([
    readFileIfExists(canonicalCssPath),
    readFileIfExists(canonicalHtmlPath)
  ])

  if (canonicalCss !== null && canonicalHtml !== null) {
    await createSessionLayoutLibraryIfMissing(projectDir)
    return toResult(canonicalCss, canonicalHtml, true)
  }

  if (canonicalCss !== null) {
    const config = parseMasterCss(unbaseMasterAssetUrls(canonicalCss))
    const html = canonicalHtml || buildMasterElementsHtml(config.elements)
    if (canonicalHtml === null) await writeAtomically(canonicalHtmlPath, html)
    await createSessionLayoutLibraryIfMissing(projectDir)
    return toResult(canonicalCss, html, true)
  }

  const result = await writeSessionMasterFiles(projectDir, buildDefaultMasterConfig())
  await createSessionLayoutLibraryIfMissing(projectDir)
  return result
}
