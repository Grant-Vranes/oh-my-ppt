import fs from 'node:fs'
import path from 'node:path'
import {
  atomicCopyDirectory,
  listStylePackageDirectories,
  readStylePackage,
  type StylePackageJson
} from './style-package'
import { ensureInstalledStylesPath } from './style-paths'

export interface StyleInitializerLogger {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

export interface InitializeStylesResult {
  bundledCount: number
  copiedCount: number
  skippedCount: number
  failedCount: number
}

interface SystemReleaseManifest {
  version: string
  time: string
  author: string
}

export async function initializeStyles(options: {
  bundledSourcePath: string
  installedRootPath: string
  logger?: StyleInitializerLogger
}): Promise<InitializeStylesResult> {
  const logger = options.logger
  await ensureInstalledStylesPath(options.installedRootPath)
  const systemPath = path.join(options.installedRootPath, 'system')
  const bundledManifest = await readSystemReleaseManifest(options.bundledSourcePath, logger)
  const installedManifest = await readSystemReleaseManifest(systemPath, logger)

  if (
    bundledManifest &&
    installedManifest &&
    bundledManifest.version === installedManifest.version &&
    fs.existsSync(systemPath)
  ) {
    logger?.info?.('[styles] system styles are up to date', {
      version: bundledManifest.version
    })
    return {
      bundledCount: 0,
      copiedCount: 0,
      skippedCount: 1,
      failedCount: 0
    }
  }

  const bundledStyles = await readBundledStyles(options.bundledSourcePath, logger)
  let copiedCount = 0
  let failedCount = 0

  for (const style of bundledStyles) {
    try {
      const destinationPath = path.join(systemPath, style.json.style)
      await atomicCopyDirectory(style.path, destinationPath)
      copiedCount += 1
      logger?.info?.('[styles] installed bundled style', {
        style: style.json.style,
        version: style.json.version
      })
    } catch (error) {
      failedCount += 1
      logger?.error?.('[styles] failed to sync bundled style', {
        style: style.json.style,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  if (bundledManifest && failedCount === 0) {
    await writeSystemReleaseManifest(systemPath, bundledManifest)
  }

  return {
    bundledCount: bundledStyles.length,
    copiedCount,
    skippedCount: 0,
    failedCount
  }
}

async function readBundledStyles(
  bundledSourcePath: string,
  logger?: StyleInitializerLogger
): Promise<Array<{ path: string; json: StylePackageJson }>> {
  const entryNames = await listStylePackageDirectories(bundledSourcePath).catch((error) => {
    logger?.warn?.('[styles] bundled styles source missing or unreadable', {
      path: bundledSourcePath,
      message: error instanceof Error ? error.message : String(error)
    })
    return []
  })

  const styles: Array<{ path: string; json: StylePackageJson }> = []
  for (const styleName of entryNames) {
    const stylePath = path.join(bundledSourcePath, styleName)
    try {
      const pkg = await readStylePackage(stylePath)
      if (pkg.json.style !== styleName) {
        logger?.warn?.('[styles] style key does not match directory', {
          directory: styleName,
          style: pkg.json.style
        })
        continue
      }
      if (pkg.json.source !== 'builtin') {
        logger?.warn?.('[styles] bundled style source must be builtin', { path: stylePath })
        continue
      }
      styles.push({ path: stylePath, json: pkg.json })
    } catch (error) {
      logger?.warn?.('[styles] invalid bundled style package', {
        path: stylePath,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return styles
}

async function readSystemReleaseManifest(
  rootPath: string,
  logger?: StyleInitializerLogger
): Promise<SystemReleaseManifest | null> {
  const manifestPath = path.join(rootPath, 'manifest.json')
  try {
    const raw = await fs.promises.readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<SystemReleaseManifest>
    const version = String(parsed.version || '').trim()
    const time = String(parsed.time || '').trim()
    const author = String(parsed.author || '').trim()
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      throw new Error('Invalid system styles manifest version')
    }
    return { version, time, author }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      logger?.warn?.('[styles] system styles manifest invalid', {
        path: manifestPath,
        message: error instanceof Error ? error.message : String(error)
      })
    }
    return null
  }
}

async function writeSystemReleaseManifest(
  systemPath: string,
  manifest: SystemReleaseManifest
): Promise<void> {
  await fs.promises.mkdir(systemPath, { recursive: true })
  const manifestPath = path.join(systemPath, 'manifest.json')
  const tmpPath = path.join(systemPath, `.manifest.json.tmp-${process.pid}-${Date.now()}`)
  await fs.promises.writeFile(tmpPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  await fs.promises.rename(tmpPath, manifestPath)
}
