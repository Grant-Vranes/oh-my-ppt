// Built-in product skill installation belongs to the product domain, not Agent Runtime.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface SkillInitializerLogger {
  info?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  error?: (message: string, meta?: Record<string, unknown>) => void
}

interface BuiltinSkillJson {
  name: string
  version: string
  source: 'builtin'
}

interface SystemSkillManifestEntry {
  version: string
  source: 'builtin'
  installedAt: string
  updatedAt: string
  missingFromBundle?: boolean
}

export interface SystemSkillsManifest {
  schemaVersion: 1
  updatedAt: string
  skills: Record<string, SystemSkillManifestEntry>
}

export interface InitializeSkillsResult {
  builtinCount: number
  copiedCount: number
  skippedCount: number
  failedCount: number
  manifest: SystemSkillsManifest
}

export function compareVersion(a: string, b: string): number {
  const aa = a.split('.').map((part) => Number(part) || 0)
  const bb = b.split('.').map((part) => Number(part) || 0)
  const len = Math.max(aa.length, bb.length)
  for (let i = 0; i < len; i += 1) {
    const diff = (aa[i] || 0) - (bb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export async function initializeSkills(options: {
  builtinSourcePath: string
  installedRootPath: string
  logger?: SkillInitializerLogger
}): Promise<InitializeSkillsResult> {
  const logger = options.logger
  const systemPath = path.join(options.installedRootPath, 'system')
  await mkdir(systemPath, { recursive: true })

  const manifest = await readSystemManifest(systemPath, logger)
  const nextManifest: SystemSkillsManifest = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    skills: { ...manifest.skills },
  }

  const bundledSkills = await readBundledSkills(options.builtinSourcePath, logger)
  const bundledNames = new Set(bundledSkills.map((skill) => skill.json.name))
  let copiedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const skill of bundledSkills) {
    try {
      const destinationPath = path.join(systemPath, skill.json.name)
      const existing = nextManifest.skills[skill.json.name]
      const installedJson = await readSkillJson(destinationPath).catch(() => null)
      const shouldCopy =
        !existing ||
        existing.missingFromBundle ||
        compareVersion(skill.json.version, existing.version) > 0 ||
        !installedJson ||
        installedJson.name !== skill.json.name ||
        compareVersion(skill.json.version, installedJson.version) > 0

      if (shouldCopy) {
        await rm(destinationPath, { recursive: true, force: true })
        await cp(skill.path, destinationPath, { recursive: true })
        copiedCount += 1
        const now = new Date().toISOString()
        nextManifest.skills[skill.json.name] = {
          version: skill.json.version,
          source: 'builtin',
          installedAt: existing?.installedAt || now,
          updatedAt: now,
        }
        logger?.info?.('[skills] installed builtin skill', {
          name: skill.json.name,
          version: skill.json.version,
        })
      } else {
        skippedCount += 1
        nextManifest.skills[skill.json.name] = {
          version: skill.json.version,
          source: 'builtin',
          installedAt: existing.installedAt,
          updatedAt: existing.updatedAt,
        }
      }
    } catch (error) {
      failedCount += 1
      logger?.error?.('[skills] failed to sync builtin skill', {
        name: skill.json.name,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  for (const [name, entry] of Object.entries(nextManifest.skills)) {
    if (bundledNames.has(name)) continue
    nextManifest.skills[name] = {
      ...entry,
      missingFromBundle: true,
      updatedAt: new Date().toISOString(),
    }
  }

  nextManifest.updatedAt = new Date().toISOString()
  await writeSystemManifest(systemPath, nextManifest)

  return {
    builtinCount: bundledSkills.length,
    copiedCount,
    skippedCount,
    failedCount,
    manifest: nextManifest,
  }
}

async function readBundledSkills(
  builtinSourcePath: string,
  logger?: SkillInitializerLogger
): Promise<Array<{ path: string; json: BuiltinSkillJson }>> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = await readdir(builtinSourcePath, { withFileTypes: true })
  } catch (error) {
    logger?.warn?.('[skills] bundled skills source missing or unreadable', {
      path: builtinSourcePath,
      message: error instanceof Error ? error.message : String(error),
    })
    return []
  }

  const skills: Array<{ path: string; json: BuiltinSkillJson }> = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillPath = path.join(builtinSourcePath, entry.name)
    try {
      const json = await readSkillJson(skillPath)
      if (json.name !== entry.name) {
        logger?.warn?.('[skills] skill name does not match directory', {
          directory: entry.name,
          name: json.name,
        })
        continue
      }
      skills.push({ path: skillPath, json })
    } catch (error) {
      logger?.warn?.('[skills] invalid bundled skill metadata', {
        path: skillPath,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return skills
}

async function readSkillJson(skillPath: string): Promise<BuiltinSkillJson> {
  const filePath = path.join(skillPath, 'skill.json')
  const raw = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as Partial<BuiltinSkillJson>
  if (
    typeof parsed.name !== 'string' ||
    typeof parsed.version !== 'string' ||
    parsed.source !== 'builtin'
  ) {
    throw new Error(`Invalid skill.json at ${filePath}`)
  }
  return {
    name: parsed.name,
    version: parsed.version,
    source: parsed.source,
  }
}

async function readSystemManifest(
  systemPath: string,
  logger?: SkillInitializerLogger
): Promise<SystemSkillsManifest> {
  const filePath = path.join(systemPath, '.manifest.json')
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<SystemSkillsManifest>
    if (parsed.schemaVersion !== 1 || !parsed.skills || typeof parsed.skills !== 'object') {
      throw new Error('Invalid manifest shape')
    }
    return {
      schemaVersion: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      skills: parsed.skills as Record<string, SystemSkillManifestEntry>,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      logger?.warn?.('[skills] system manifest unreadable; recreating', {
        path: filePath,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      skills: {},
    }
  }
}

async function writeSystemManifest(
  systemPath: string,
  manifest: SystemSkillsManifest
): Promise<void> {
  await writeFile(
    path.join(systemPath, '.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  )
}
