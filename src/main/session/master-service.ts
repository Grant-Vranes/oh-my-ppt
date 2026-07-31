import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import {
  MASTER_CSS_FILENAME,
  buildDefaultMasterConfig,
  buildMasterCss,
  normalizeMasterConfig,
  parseMasterCss,
  type SessionMasterConfig
} from '@shared/master'

export type SessionMasterReadResult = {
  css: string
  config: SessionMasterConfig
  exists: boolean
}

export const getSessionMasterPath = (projectDir: string): string =>
  path.join(path.resolve(projectDir), MASTER_CSS_FILENAME)

const toResult = (css: string, exists: boolean): SessionMasterReadResult => ({
  css,
  config: parseMasterCss(css),
  exists
})

export async function readSessionMaster(projectDir: string): Promise<SessionMasterReadResult> {
  const masterPath = getSessionMasterPath(projectDir)
  try {
    return toResult(await fs.promises.readFile(masterPath, 'utf-8'), true)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const config = buildDefaultMasterConfig()
    return { css: buildMasterCss(config), config, exists: false }
  }
}

export async function writeSessionMaster(
  projectDir: string,
  value: unknown,
  fontFaceCss = ''
): Promise<SessionMasterReadResult> {
  const config = normalizeMasterConfig(value)
  const css = buildMasterCss(config, fontFaceCss)
  const masterPath = getSessionMasterPath(projectDir)
  const tempPath = `${masterPath}.${crypto.randomUUID()}.tmp`
  await fs.promises.mkdir(path.dirname(masterPath), { recursive: true })
  try {
    await fs.promises.writeFile(tempPath, css, 'utf-8')
    await fs.promises.rename(tempPath, masterPath)
  } finally {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined)
  }
  return { css, config, exists: true }
}

export async function createSessionMasterIfMissing(projectDir: string): Promise<SessionMasterReadResult> {
  const current = await readSessionMaster(projectDir)
  return current.exists ? current : writeSessionMaster(projectDir, current.config)
}
