import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import log from 'electron-log/main.js'
import { customAlphabet } from 'nanoid'
import {
  listStyleCatalog,
  getStyleDetail,
  createStyleSkill,
  updateStyleSkill,
  hasStyleSkill,
  deleteStyleSkill,
  exportStylePackageZip,
  importStylePackageZip
} from '../../utils/style-skills'
import type { IpcContext } from '../context'
import { resolveGlobalModelTimeouts, resolveModelConfigForTask } from './model-config-utils'
import { parseStyleFile } from '../../utils/style-import'
import { parseStyleImage } from '../../utils/style-image-import'
import { parseStylePptx } from '../../utils/style-pptx-import'
import { isSupportedImageMimeType, normalizeImageMimeType } from '@shared/image-mime'
import { getInstalledStylesPath } from '../../styles'

const nanoidLower = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12)
const MAX_STYLE_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

function resolvePreviewPath(row: {
  id: string
  style: string
  source: string
  packageDir?: string | null
}): string | null {
  const installedRoot = getInstalledStylesPath()
  if (!installedRoot) return null
  const dir = row.packageDir
    ? path.join(installedRoot, row.packageDir)
    : row.source === 'builtin'
      ? path.join(installedRoot, 'system', row.style)
      : path.join(installedRoot, 'user', row.id)
  const htmlPath = path.join(dir, 'preview.html')
  return fs.existsSync(htmlPath) ? htmlPath : null
}

type StyleBasePayload = {
  label: string
  description: string
  category: string
  aliases: string[]
  prompt: string
  styleCase: string
}

type StylePayload = StyleBasePayload & {
  id: string
}

export function registerStyleHandlers(ctx: IpcContext): void {
  const { db } = ctx

  ipcMain.handle('styles:get', async () => {
    log.info('[styles:get] requested')
    const styles = listStyleCatalog()
    const categories: Record<
      string,
      Array<{
        id: string
        label: string
        description: string
        source?: 'builtin' | 'custom' | 'override'
        editable?: boolean
        styleCase?: string
      }>
    > = {}
    for (const style of styles) {
      const category = style.category
      if (!categories[category]) categories[category] = []
      categories[category].push({
        id: style.id,
        label: style.label,
        description: style.description,
        source: style.source,
        editable: style.editable,
        styleCase: style.styleCase
      })
    }
    const defaultStyle =
      styles.find((item) => item.styleKey === 'minimal-white')?.id ?? styles[0]?.id ?? ''
    return { categories, defaultStyle }
  })

  ipcMain.handle('styles:getDetail', async (_event, styleId: string) => {
    return getStyleDetail(styleId)
  })

  ipcMain.handle('styles:list', async () => {
    const rows = (await db.listStyleRows()).filter((row) => row.active !== false)
    rows.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)
    return {
      items: rows.map((row) => ({
        id: row.id,
        styleKey: row.style,
        label: row.styleName,
        name: {
          zh: row.styleNameZh || row.styleName,
          en: row.styleNameEn || ''
        },
        description: row.description,
        aliases: JSON.parse(row.aliases || '[]'),
        category: row.category || (row.source === 'builtin' ? '内置' : '自定义'),
        source: row.source,
        editable: row.source !== 'builtin',
        version: row.version,
        styleCase: row.styleCase,
        packageDir: row.packageDir || '',
        previewPath: resolvePreviewPath(row),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    }
  })

  const parseBasePayload = (payload: unknown): StyleBasePayload => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const label = String(record.label || '').trim()
    const description = String(record.description || '').trim()
    const category = String(record.category || '').trim()
    const styleSkill = String(record.styleSkill || '').trim()
    const aliases = Array.isArray(record.aliases)
      ? record.aliases
          .map((alias: unknown) => String(alias || '').trim())
          .filter((alias: string) => alias.length > 0)
      : []
    if (!label) {
      throw new Error('保存风格失败：label 必填。')
    }
    if (!styleSkill) {
      throw new Error('保存风格失败：styleSkill 不能为空。')
    }
    return {
      label,
      description,
      category,
      aliases,
      prompt: styleSkill,
      styleCase: String(record.styleCase || '').trim()
    }
  }

  const parseCreatePayload = (payload: unknown): StyleBasePayload => {
    log.info('[styles:create] payload requested')
    return parseBasePayload(payload)
  }

  const parseUpdatePayload = (payload: unknown): StylePayload => {
    const record =
      payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const id = String(record.id || '').trim()
    if (!id) {
      throw new Error('保存风格失败：id 必填。')
    }
    log.info('[styles:update] payload requested', { styleId: id })
    return {
      ...parseBasePayload(payload),
      id
    }
  }

  ipcMain.handle('styles:parseFile', async (_event, payload) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : ''
    if (!filePath) throw new Error('文件路径为空')
    const activeModel = await resolveModelConfigForTask(ctx, {
      modelConfigId: payload?.modelConfigId,
      purpose: 'styles:parseFile'
    })
    const modelTimeouts = await resolveGlobalModelTimeouts(ctx)
    const styleImportDir = path.join(await ctx.resolveStoragePath(), 'style-import')
    await fs.promises.mkdir(styleImportDir, { recursive: true })
    return await parseStyleFile({
      filePath,
      provider: activeModel.provider,
      apiKey: activeModel.apiKey,
      model: activeModel.model,
      baseUrl: activeModel.baseUrl,
      maxTokens: activeModel.maxTokens,
      modelTimeoutMs: modelTimeouts.document,
      workspaceDir: styleImportDir
    })
  })

  ipcMain.handle('styles:parsePptx', async (_event, payload) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : ''
    if (!filePath) throw new Error('文件路径为空')
    const activeModel = await resolveModelConfigForTask(ctx, {
      modelConfigId: payload?.modelConfigId,
      purpose: 'styles:parsePptx'
    })
    const modelTimeouts = await resolveGlobalModelTimeouts(ctx)
    const tmpRootDir = path.join(await ctx.resolveStoragePath(), 'tmpStyle')
    await fs.promises.mkdir(tmpRootDir, { recursive: true })
    return await parseStylePptx({
      filePath,
      provider: activeModel.provider,
      apiKey: activeModel.apiKey,
      model: activeModel.model,
      baseUrl: activeModel.baseUrl,
      maxTokens: activeModel.maxTokens,
      modelTimeoutMs: modelTimeouts.document,
      tmpRootDir
    })
  })

  ipcMain.handle('styles:parseImage', async (_event, payload) => {
    const imageBase64 = typeof payload?.imageBase64 === 'string' ? payload.imageBase64.trim() : ''
    const rawMimeType = typeof payload?.mimeType === 'string' ? payload.mimeType : ''
    const mimeType = normalizeImageMimeType(rawMimeType)
    if (!imageBase64) throw new Error('图片数据为空')
    if (!isSupportedImageMimeType(rawMimeType)) {
      throw new Error(`不支持的图片格式：${mimeType || 'unknown'}`)
    }
    let imageBuffer: Buffer
    try {
      imageBuffer = Buffer.from(imageBase64, 'base64')
    } catch {
      throw new Error('图片数据格式无效')
    }
    if (!imageBuffer.length) {
      throw new Error('图片数据为空')
    }
    if (imageBuffer.length > MAX_STYLE_IMAGE_SIZE_BYTES) {
      throw new Error(
        `图片过大（${(imageBuffer.length / 1024 / 1024).toFixed(1)}MB），图片上限 5MB`
      )
    }

    const activeModel = await resolveModelConfigForTask(ctx, {
      modelConfigId: payload?.modelConfigId,
      purpose: 'styles:parseImage'
    })
    const modelTimeouts = await resolveGlobalModelTimeouts(ctx)
    return await parseStyleImage({
      imageBase64,
      mimeType,
      provider: activeModel.provider,
      apiKey: activeModel.apiKey,
      model: activeModel.model,
      baseUrl: activeModel.baseUrl,
      maxTokens: activeModel.maxTokens,
      modelTimeoutMs: modelTimeouts.document
    })
  })

  ipcMain.handle('styles:importPackageZip', async (_event, payload) => {
    const filePath = typeof payload?.filePath === 'string' ? payload.filePath.trim() : ''
    if (!filePath) throw new Error('文件路径为空')
    const result = await importStylePackageZip(filePath)
    return { success: true, ...result }
  })

  ipcMain.handle('styles:exportPackageZip', async (event, payload) => {
    const styleId = typeof payload?.styleId === 'string' ? payload.styleId.trim() : ''
    if (!styleId) throw new Error('styleId 为空')
    const detail = getStyleDetail(styleId)
    const safeName = (detail.styleKey || detail.id).replace(/[^a-z0-9-]/gi, '-').toLowerCase()
    const ownerWindow = BrowserWindow.fromWebContents(event.sender)
    const saveResult = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, {
          title: '导出风格包',
          defaultPath: safeName + '.zip',
          filters: [{ name: 'Style ZIP', extensions: ['zip'] }]
        })
      : await dialog.showSaveDialog({
          title: '导出风格包',
          defaultPath: safeName + '.zip',
          filters: [{ name: 'Style ZIP', extensions: ['zip'] }]
        })
    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true }
    }
    const outputPath = saveResult.filePath.toLowerCase().endsWith('.zip')
      ? saveResult.filePath
      : saveResult.filePath + '.zip'
    const result = await exportStylePackageZip(styleId, outputPath)
    return { success: true, canceled: false, ...result }
  })

  ipcMain.handle('styles:create', async (_event, payload) => {
    const parsed = parseCreatePayload(payload)
    let id = `style-${nanoidLower()}`
    while (hasStyleSkill(id)) {
      id = `style-${nanoidLower()}`
    }
    const result = await createStyleSkill({
      ...parsed,
      id
    })
    return { success: true, ...result }
  })

  ipcMain.handle('styles:update', async (_event, payload) => {
    const parsed = parseUpdatePayload(payload)
    const result = await updateStyleSkill(parsed)
    return { success: true, ...result }
  })

  ipcMain.handle('styles:delete', async (_event, styleId: string) => {
    const id = String(styleId || '').trim()
    if (!id) return { success: false, deleted: false }
    const result = await deleteStyleSkill(id)
    return { success: result.deleted, deleted: result.deleted }
  })
}
