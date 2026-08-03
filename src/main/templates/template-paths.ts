import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { customAlphabet } from 'nanoid'
import { allowLocalAssetRoot } from '../io/local-asset-roots'

const TEMPLATE_ID_RE = /^tpl_[a-zA-Z0-9_-]{8,80}$/
const nanoidLower = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12)

export function createLowercaseId(): string {
  return nanoidLower()
}

export function resolveTemplatesRoot(): string {
  const root = path.join(app.getPath('userData'), 'templates')
  allowLocalAssetRoot(root)
  return root
}

export async function ensureTemplatesRoot(): Promise<string> {
  const root = resolveTemplatesRoot()
  await fs.promises.mkdir(root, { recursive: true })
  allowLocalAssetRoot(root)
  return root
}

export function isPathInside(targetPath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

export function normalizeTemplateId(value: unknown): string {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!TEMPLATE_ID_RE.test(id)) throw new Error('模板 ID 无效')
  return id
}

export function resolveTemplateDir(templatesRoot: string, templateId: string): string {
  const id = normalizeTemplateId(templateId)
  const dir = path.resolve(templatesRoot, id)
  if (!isPathInside(dir, templatesRoot)) throw new Error('模板路径越界')
  return dir
}

export function resolveTemplateManifestPath(templatesRoot: string, templateId: string): string {
  return path.join(resolveTemplateDir(templatesRoot, templateId), 'manifest.json')
}

export function resolveTemplateRelativePath(templateDir: string, relativePath?: string | null): string | null {
  const raw = typeof relativePath === 'string' ? relativePath.trim() : ''
  if (!raw) return null
  const resolved = path.resolve(templateDir, raw)
  if (!isPathInside(resolved, templateDir)) return null
  return resolved
}

export function createTemplateId(): string {
  return `tpl_${createLowercaseId()}`
}
