import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export type StyleSource = 'builtin' | 'custom' | 'override'

export interface StylePackageJson {
  style: string
  name: {
    zh: string
    en: string
  }
  description: string
  category: string
  aliases: string[]
  styleCase: string
  version: string
  source: StyleSource
}

export interface StylePackage {
  dir: string
  json: StylePackageJson
  skillMarkdown: string
  previewPath?: string
}

export function normalizeStyleVersion(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/^v/i, '')
  if (!raw) return '1.0.0'
  const parts = raw
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => {
      const parsed = Number.parseInt(part, 10)
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    })
  while (parts.length < 3) parts.push(0)
  if (parts.every((part) => part === 0) && !/^0+(?:[.-]0+){0,2}$/.test(raw)) return '1.0.0'
  return parts.join('.')
}

export function compareStyleVersion(a: string, b: string): number {
  const aa = normalizeStyleVersion(a).split('.').map((part) => Number(part) || 0)
  const bb = normalizeStyleVersion(b).split('.').map((part) => Number(part) || 0)
  for (let index = 0; index < Math.max(aa.length, bb.length, 3); index += 1) {
    const diff = (aa[index] || 0) - (bb[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function styleRowToPackageJson(input: {
  style: string
  styleName: string
  styleNameZh?: string
  styleNameEn?: string
  description?: string
  category?: string
  aliases?: string[] | string
  source?: StyleSource | string
  version?: string | number
  styleCase?: string
}): StylePackageJson {
  const aliases = Array.isArray(input.aliases)
    ? input.aliases
    : typeof input.aliases === 'string'
      ? parseAliases(input.aliases)
      : []
  return {
    style: normalizeStyleKey(input.style),
    name: normalizeStyleName(input),
    description: String(input.description || '').trim(),
    category: String(input.category || '').trim(),
    aliases: aliases.map((alias) => String(alias || '').trim()).filter(Boolean),
    styleCase: String(input.styleCase || '').trim(),
    version: normalizeStyleVersion(input.version),
    source: normalizeSource(input.source)
  }
}

export async function readStylePackage(styleDir: string): Promise<StylePackage> {
  const styleJsonPath = path.join(styleDir, 'style.json')
  const previewPath = path.join(styleDir, 'preview.html')
  const skillPath = path.join(styleDir, 'SKILL.md')
  const raw = await readFile(styleJsonPath, 'utf8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const json = styleRowToPackageJson({
    style: String(parsed.style || ''),
    styleName: readLegacyStyleName(parsed),
    styleNameZh: readLocalizedName(parsed, 'zh'),
    styleNameEn: readLocalizedName(parsed, 'en'),
    description: String(parsed.description || ''),
    category: String(parsed.category || ''),
    aliases: Array.isArray(parsed.aliases) ? parsed.aliases.map(String) : [],
    source: String(parsed.source || 'custom'),
    version: parsed.version as string | number | undefined,
    styleCase: String(parsed.styleCase || '')
  })
  validateStylePackageJson(json, styleJsonPath)
  const skillMarkdown = await readFile(skillPath, 'utf8')
  validateStyleSkillMarkdown(skillMarkdown, skillPath)
  if (fs.existsSync(previewPath)) {
    const previewHtml = await readFile(previewPath, 'utf8')
    validatePreviewHtml(previewHtml, previewPath)
    return { dir: styleDir, json, skillMarkdown, previewPath }
  }
  return { dir: styleDir, json, skillMarkdown }
}

export async function writeStylePackage(args: {
  dir: string
  json: StylePackageJson
  skillMarkdown: string
  previewHtml?: string
}): Promise<void> {
  validateStylePackageJson(args.json, path.join(args.dir, 'style.json'))
  validateStyleSkillMarkdown(args.skillMarkdown, path.join(args.dir, 'SKILL.md'))
  if (args.previewHtml !== undefined) {
    validatePreviewHtml(args.previewHtml, path.join(args.dir, 'preview.html'))
  }
  await mkdir(args.dir, { recursive: true })
  await writeFile(
    path.join(args.dir, 'style.json'),
    JSON.stringify(args.json, null, 2) + '\n',
    'utf8'
  )
  await writeFile(path.join(args.dir, 'SKILL.md'), args.skillMarkdown.trim() + '\n', 'utf8')
  if (args.previewHtml !== undefined) {
    await writeFile(path.join(args.dir, 'preview.html'), args.previewHtml, 'utf8')
  }
}

export async function listStylePackageDirectories(rootPath: string): Promise<string[]> {
  if (!fs.existsSync(rootPath)) return []
  const entries = await readdir(rootPath, { withFileTypes: true })
  const names: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!/^[a-z0-9-]{3,40}$/.test(entry.name)) continue
    if (fs.existsSync(path.join(rootPath, entry.name, 'style.json'))) {
      names.push(entry.name)
    }
  }
  return names.sort()
}

export async function atomicCopyDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  const parent = path.dirname(destinationDir)
  const baseName = path.basename(destinationDir)
  const token = crypto.randomUUID()
  const tmpDir = path.join(parent, `.${baseName}-${token}.tmp`)
  const backupDir = path.join(parent, `.${baseName}-${token}.bak`)
  await rm(tmpDir, { recursive: true, force: true })
  await rm(backupDir, { recursive: true, force: true })
  await cp(sourceDir, tmpDir, { recursive: true })
  let backupCreated = false
  try {
    if (fs.existsSync(destinationDir)) {
      await rename(destinationDir, backupDir)
      backupCreated = true
    }
    await rename(tmpDir, destinationDir)
  } catch (error) {
    await rm(destinationDir, { recursive: true, force: true }).catch(() => undefined)
    if (backupCreated && fs.existsSync(backupDir) && !fs.existsSync(destinationDir)) {
      await rename(backupDir, destinationDir).catch(() => undefined)
    }
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  if (backupCreated) {
    await rm(backupDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function buildDefaultPreviewHtml(style: StylePackageJson): string {
  const title = escapeHtml(style.name.zh || style.name.en || style.style)
  const description = escapeHtml(style.description || style.styleCase || style.style)
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>' + title + '</title>',
    '  <style>',
    "    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #0f172a; }",
    '    main { width: min(860px, 86vw); border: 1px solid rgba(15, 23, 42, 0.12); border-radius: 28px; padding: 56px; background: rgba(255, 255, 255, 0.9); box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12); }',
    '    h1 { margin: 0 0 18px; font-size: 48px; }',
    '    p { margin: 0; font-size: 20px; line-height: 1.7; color: #475569; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <main>',
    '    <h1>' + title + '</h1>',
    '    <p>' + description + '</p>',
    '  </main>',
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

function validateStylePackageJson(json: StylePackageJson, filePath: string): void {
  if (!/^[a-z0-9-]{3,40}$/.test(json.style)) throw new Error('Invalid style key at ' + filePath)
  if (!json.name || typeof json.name !== 'object') throw new Error('name is required at ' + filePath)
  if (!json.name.zh.trim()) throw new Error('name.zh is required at ' + filePath)
  if (!json.name.en.trim()) throw new Error('name.en is required at ' + filePath)
  if (!Array.isArray(json.aliases)) throw new Error('aliases must be an array at ' + filePath)
  if (!/^\d+\.\d+\.\d+$/.test(json.version)) throw new Error('Invalid style version at ' + filePath)
  if (!['builtin', 'custom', 'override'].includes(json.source)) {
    throw new Error('Invalid style source at ' + filePath)
  }
}

function validateStyleSkillMarkdown(markdown: string, filePath: string): void {
  if (!markdown.trim()) throw new Error('SKILL.md is required at ' + filePath)
}

function validatePreviewHtml(html: string, filePath: string): void {
  if (!/<!doctype html>|<html[\s>]/i.test(html)) {
    throw new Error('preview.html must be complete HTML at ' + filePath)
  }
  const lower = html.toLowerCase()
  const forbidden = ['http://', 'https://', 'file://', '../']
  for (const token of forbidden) {
    if (lower.includes(token)) throw new Error('Forbidden preview reference ' + token + ' at ' + filePath)
  }
  if (/\b(?:src|href)=["']\/[^"']*/i.test(html)) {
    throw new Error('Absolute preview asset path is forbidden at ' + filePath)
  }
  if (/<script\b/i.test(html)) throw new Error('Inline or external script is forbidden at ' + filePath)
  if (/@import\b/i.test(html)) throw new Error('CSS @import is forbidden at ' + filePath)
}

function normalizeStyleKey(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!/^[a-z0-9-]{3,40}$/.test(normalized)) throw new Error('Invalid style key: ' + value)
  return normalized
}

function normalizeSource(value: unknown): StyleSource {
  return value === 'builtin' || value === 'override' ? value : 'custom'
}

function normalizeStyleName(input: {
  style: string
  styleName: string
  styleNameZh?: string
  styleNameEn?: string
}): StylePackageJson['name'] {
  const zh = String(input.styleNameZh || input.styleName || input.style || '').trim()
  const en = String(input.styleNameEn || '').trim() || titleCaseStyleKey(input.style)
  return { zh, en }
}

function readLocalizedName(parsed: Record<string, unknown>, locale: 'zh' | 'en'): string {
  const name = parsed.name
  if (name && typeof name === 'object' && !Array.isArray(name)) {
    return String((name as Record<string, unknown>)[locale] || '').trim()
  }
  return ''
}

function readLegacyStyleName(parsed: Record<string, unknown>): string {
  return String(parsed.styleName || parsed.label || parsed.style || '').trim()
}

function titleCaseStyleKey(value: string): string {
  return String(value || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

function parseAliases(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
