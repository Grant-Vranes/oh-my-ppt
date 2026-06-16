import { app } from 'electron'
import { is } from '@electron-toolkit/utils'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { allowLocalAssetRoot } from '../ipc/io/assets-handlers'

export function resolveBundledStylesSourcePath(): string {
  return is.dev
    ? path.join(process.cwd(), 'resources', 'styles')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'styles')
}

export function resolveInstalledStylesPath(): string {
  return path.join(app.getPath('userData'), is.dev ? 'styles-dev' : 'styles')
}

export async function ensureInstalledStylesPath(installedRootPath: string): Promise<void> {
  await mkdir(path.join(installedRootPath, 'system'), { recursive: true })
  await mkdir(path.join(installedRootPath, 'user'), { recursive: true })
  allowLocalAssetRoot(installedRootPath)
}
