import fs from 'fs'
import path from 'path'
import { isPathInside } from './template-paths'

const EXCLUDED_NAMES = new Set([
  '.git',
  '.gitignore',
  'node_modules',
  'docs',
  'tmp',
  'history',
  '.DS_Store'
])

function shouldExclude(name: string, extraExclude?: Set<string>): boolean {
  return EXCLUDED_NAMES.has(name) || Boolean(extraExclude?.has(name)) || name.endsWith('.log')
}

export async function copyDirExcluding(
  sourceDir: string,
  targetDir: string,
  options?: { exclude?: string[] }
): Promise<void> {
  if (!fs.existsSync(sourceDir)) return
  const sourceRoot = await fs.promises.realpath(sourceDir)
  const extraExclude = new Set(options?.exclude || [])
  await fs.promises.mkdir(targetDir, { recursive: true })

  const copyEntry = async (sourcePath: string, targetPath: string): Promise<void> => {
    const name = path.basename(sourcePath)
    if (shouldExclude(name, extraExclude)) return

    const realSource = await fs.promises.realpath(sourcePath).catch(() => sourcePath)
    if (!isPathInside(realSource, sourceRoot)) return

    const stat = await fs.promises.stat(sourcePath)
    if (stat.isDirectory()) {
      await fs.promises.mkdir(targetPath, { recursive: true })
      const entries = await fs.promises.readdir(sourcePath)
      await Promise.all(
        entries.map((entry) => copyEntry(path.join(sourcePath, entry), path.join(targetPath, entry)))
      )
      return
    }

    if (stat.isFile()) {
      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.promises.copyFile(sourcePath, targetPath)
    }
  }

  const entries = await fs.promises.readdir(sourceDir)
  await Promise.all(entries.map((entry) => copyEntry(path.join(sourceDir, entry), path.join(targetDir, entry))))
}
