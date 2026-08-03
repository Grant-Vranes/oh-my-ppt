import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createDefaultMasterGradient } from '../../../src/shared/master'

const state = vi.hoisted(() => ({
  ensureBaseline: vi.fn(),
  recordOperation: vi.fn(),
  rollbackCommittedOperation: vi.fn(),
  resolveProjectFontResources: vi.fn(),
  copyProjectFontResources: vi.fn()
}))

vi.mock('../../../src/main/history/git-history-service', () => ({
  GitHistoryService: class {
    ensureBaseline = state.ensureBaseline
    recordOperation = state.recordOperation
    rollbackCommittedOperation = state.rollbackCommittedOperation
  }
}))

vi.mock('../../../src/main/presentation/fonts/font-registry', () => ({
  resolveProjectFontResources: state.resolveProjectFontResources,
  copyProjectFontResources: state.copyProjectFontResources
}))

const roots: string[] = []

const pageRecord = (htmlPath: string) => ({
  id: 'page-row-1',
  session_id: 'session-1',
  legacy_page_id: null,
  file_slug: 'page-1',
  page_number: 1,
  title: 'Page 1',
  html_path: htmlPath,
  status: 'completed',
  error: null,
  created_at: 0,
  updated_at: 0,
  deleted_at: null
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('slide master mutation transaction', () => {
  beforeEach(() => {
    state.ensureBaseline.mockReset()
    state.recordOperation.mockReset()
    state.rollbackCommittedOperation.mockReset()
    state.resolveProjectFontResources.mockReset()
    state.copyProjectFontResources.mockReset()
    state.recordOperation.mockResolvedValue(null)
    state.resolveProjectFontResources.mockResolvedValue({ css: '', assets: [] })
    state.copyProjectFontResources.mockResolvedValue(undefined)
  })

  const createContext = (projectDir: string, pages: ReturnType<typeof pageRecord>[]) => ({
    sessionRunStates: new Map(),
    resolveSessionProjectDir: vi.fn(async () => projectDir),
    db: {
      listSessionPages: vi.fn(async () => pages)
    }
  })

  it('saves the current config and links every readable session page in one operation', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-mutation-'))
    roots.push(projectDir)
    const htmlPath = path.join(projectDir, 'page-1.html')
    await writeFile(htmlPath, '<html><head><style>.page{}</style></head><body>Page</body></html>')
    const ctx = createContext(projectDir, [pageRecord(htmlPath)])
    const { saveSessionMaster } = await import('../../../src/main/session/master-mutation-service')

    const result = await saveSessionMaster(ctx as never, 'session-1', {
      backgroundColor: '#f1efea',
      backgroundMode: 'override',
      backgroundStyle: 'solid',
      backgroundGradient: createDefaultMasterGradient(),
      backgroundImage: null,
      titleFontPreset: 'serif',
      bodyFontPreset: 'sans',
      titleFontFamily: null,
      bodyFontFamily: null,
      titleFontSize: null,
      bodyFontSize: null,
      elements: {
        logoImage: null,
        footerText: '',
        watermarkText: '',
        showLogo: false,
        showFooter: false,
        showPageNumber: true,
        showWatermark: false,
        footerFontSize: 16,
        pageNumberFontSize: 16,
        footerColor: '#334155',
        pageNumberColor: '#334155',
        watermarkRotation: -24,
        watermarkSizeAuto: true,
        logoPosition: { x: 5, y: 5 },
        footerPosition: { x: 5, y: 91 },
        pageNumberPosition: { x: 90, y: 91 },
        watermarkPosition: { x: 30, y: 42 },
        logoSize: { width: 16, height: 10 },
        footerSize: { width: 56, height: 5 },
        pageNumberSize: { width: 6, height: 5 },
        watermarkSize: { width: 40, height: 16 }
      }
    })

    expect(result).toMatchObject({
      exists: true,
      linkedPageCount: 1,
      unlinkedPageCount: 0,
      missingPageCount: 0,
      totalPageCount: 1
    })
    expect(result.config).toEqual({
      backgroundColor: '#f1efea',
      backgroundMode: 'override',
      backgroundStyle: 'solid',
      backgroundGradient: createDefaultMasterGradient(),
      backgroundImage: null,
      titleFontPreset: 'serif',
      bodyFontPreset: 'sans',
      titleFontFamily: null,
      bodyFontFamily: null,
      titleFontSize: null,
      bodyFontSize: null,
      elements: {
        logoImage: null,
        footerText: '',
        watermarkText: '',
        showLogo: false,
        showFooter: false,
        showPageNumber: true,
        showWatermark: false,
        footerFontSize: 16,
        pageNumberFontSize: 16,
        footerColor: '#334155',
        pageNumberColor: '#334155',
        watermarkRotation: -24,
        watermarkSizeAuto: true,
        logoPosition: { x: 5, y: 5 },
        footerPosition: { x: 5, y: 91 },
        pageNumberPosition: { x: 90, y: 91 },
        watermarkPosition: { x: 30, y: 42 },
        logoSize: { width: 16, height: 10 },
        footerSize: { width: 56, height: 5 },
        pageNumberSize: { width: 6, height: 5 },
        watermarkSize: { width: 40, height: 16 }
      }
    })
    expect(await readFile(path.join(projectDir, 'master', 'master.css'), 'utf8')).toContain(
      '--ppt-master-slide-background: #f1efea'
    )
    expect(await readFile(path.join(projectDir, 'master', 'master.css'), 'utf8')).toContain(
      '--ppt-title-font:'
    )
    expect(await readFile(path.join(projectDir, 'master', 'master.css'), 'utf8')).toContain(
      '--ppt-body-font:'
    )
    expect(await readFile(htmlPath, 'utf8')).toContain('data-ppt-master="1"')
    expect(state.recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '修改并应用演示母版',
        metadata: { feature: 'slide-master', action: 'save-and-apply' },
        allowedPaths: ['master/master.css', 'master/master.html', 'page-1.html']
      })
    )
  })

  it('rejects missing pages before writing master.css or changing any HTML', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-mutation-'))
    roots.push(projectDir)
    const missingPath = path.join(projectDir, 'page-1.html')
    const ctx = createContext(projectDir, [pageRecord(missingPath)])
    const { saveSessionMaster } = await import('../../../src/main/session/master-mutation-service')

    await expect(
      saveSessionMaster(ctx as never, 'session-1', {
        backgroundColor: '#112233',
        backgroundMode: 'override',
        backgroundStyle: 'solid',
        backgroundGradient: createDefaultMasterGradient(),
        backgroundImage: null,
        titleFontPreset: 'inherit',
        bodyFontPreset: 'inherit',
        titleFontFamily: null,
        bodyFontFamily: null,
        titleFontSize: null,
        bodyFontSize: null
      })
    ).rejects.toThrow('存在缺失或不安全的页面文件')
    await expect(readFile(path.join(projectDir, 'master', 'master.css'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
    expect(state.recordOperation).not.toHaveBeenCalled()
  })

  it('reports pages as unlinked when their master stylesheet is missing', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-mutation-'))
    roots.push(projectDir)
    const htmlPath = path.join(projectDir, 'page-1.html')
    await writeFile(
      htmlPath,
      '<html><head><link rel="stylesheet" href="./master/master.css" data-ppt-master="1"></head><body>Page</body></html>'
    )
    const ctx = createContext(projectDir, [pageRecord(htmlPath)])
    const { getSessionMasterStatus } =
      await import('../../../src/main/session/master-mutation-service')

    await expect(getSessionMasterStatus(ctx as never, 'session-1')).resolves.toMatchObject({
      exists: false,
      linkedPageCount: 0,
      unlinkedPageCount: 1,
      missingPageCount: 0,
      totalPageCount: 1
    })
  })

  it('restores the previous master.css and every touched page if history recording fails', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-mutation-'))
    roots.push(projectDir)
    const htmlPath = path.join(projectDir, 'page-1.html')
    const originalHtml = '<html><head></head><body>Page</body></html>'
    const originalMaster = '/* user managed baseline */\n:root { --ppt-page-bg: #aabbcc; }\n'
    await writeFile(htmlPath, originalHtml)
    await mkdir(path.join(projectDir, 'master'), { recursive: true })
    await writeFile(path.join(projectDir, 'master', 'master.css'), originalMaster)
    state.recordOperation.mockRejectedValueOnce(new Error('history unavailable'))
    const ctx = createContext(projectDir, [pageRecord(htmlPath)])
    const { saveSessionMaster } = await import('../../../src/main/session/master-mutation-service')

    await expect(
      saveSessionMaster(ctx as never, 'session-1', {
        backgroundColor: '#112233',
        backgroundMode: 'override',
        backgroundStyle: 'solid',
        backgroundGradient: createDefaultMasterGradient(),
        backgroundImage: null,
        titleFontPreset: 'mono',
        bodyFontPreset: 'sans',
        titleFontFamily: null,
        bodyFontFamily: null,
        titleFontSize: null,
        bodyFontSize: null
      })
    ).rejects.toThrow('history unavailable')
    expect(await readFile(htmlPath, 'utf8')).toBe(originalHtml)
    expect(await readFile(path.join(projectDir, 'master', 'master.css'), 'utf8')).toBe(originalMaster)
  })

  it('records the selected session background image in the master history operation', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-mutation-'))
    roots.push(projectDir)
    const htmlPath = path.join(projectDir, 'page-1.html')
    const backgroundPath = path.join(projectDir, 'images', 'master-background.png')
    await writeFile(htmlPath, '<html><head></head><body>Page</body></html>')
    await mkdir(path.dirname(backgroundPath), { recursive: true })
    await writeFile(backgroundPath, 'not-a-real-png')
    const ctx = createContext(projectDir, [pageRecord(htmlPath)])
    const { saveSessionMaster } = await import('../../../src/main/session/master-mutation-service')

    await saveSessionMaster(ctx as never, 'session-1', {
      backgroundColor: '#ffffff',
      backgroundMode: 'override',
      backgroundStyle: 'image',
      backgroundGradient: createDefaultMasterGradient(),
      backgroundImage: './images/master-background.png',
      titleFontPreset: 'inherit',
      bodyFontPreset: 'inherit',
      titleFontFamily: null,
      bodyFontFamily: null,
      titleFontSize: null,
      bodyFontSize: null
    })

    expect(await readFile(path.join(projectDir, 'master', 'master.css'), 'utf8')).toContain(
      'url("../images/master-background.png") center center / cover no-repeat'
    )
    expect(state.recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedPaths: [
          'master/master.css',
          'master/master.html',
          'page-1.html',
          'images/master-background.png'
        ]
      })
    )
  })

  it('persists selected font resources in the same history operation as master.css', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-mutation-'))
    roots.push(projectDir)
    const htmlPath = path.join(projectDir, 'page-1.html')
    const targetPath = path.join(
      projectDir,
      'assets',
      'fonts',
      'google-fonts',
      'NotoSansSC',
      'noto-sans-sc.woff2'
    )
    await writeFile(htmlPath, '<html><head></head><body>Page</body></html>')
    state.resolveProjectFontResources.mockResolvedValueOnce({
      css: '@font-face{font-family:"Noto Sans SC";src:url("./assets/fonts/google-fonts/NotoSansSC/noto-sans-sc.woff2")}',
      assets: [{ sourcePath: '/font-registry/NotoSansSC/noto-sans-sc.woff2', targetPath }]
    })
    const ctx = createContext(projectDir, [pageRecord(htmlPath)])
    const { saveSessionMaster } = await import('../../../src/main/session/master-mutation-service')

    await saveSessionMaster(ctx as never, 'session-1', {
      backgroundColor: '#ffffff',
      backgroundMode: 'inherit',
      backgroundStyle: 'solid',
      backgroundGradient: createDefaultMasterGradient(),
      backgroundImage: null,
      titleFontPreset: 'inherit',
      bodyFontPreset: 'inherit',
      titleFontFamily: 'Noto Sans SC',
      bodyFontFamily: null,
      titleFontSize: 56,
      bodyFontSize: null
    })

    expect(state.resolveProjectFontResources).toHaveBeenCalledWith(['Noto Sans SC'], projectDir)
    expect(state.copyProjectFontResources).toHaveBeenCalledWith(
      expect.objectContaining({ assets: [expect.objectContaining({ targetPath })] })
    )
    expect(await readFile(path.join(projectDir, 'master', 'master.css'), 'utf8')).toContain(
      '@font-face{font-family:"Noto Sans SC";'
    )
    expect(state.recordOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedPaths: [
          'master/master.css',
          'master/master.html',
          'page-1.html',
          'assets/fonts/google-fonts/NotoSansSC/noto-sans-sc.woff2'
        ]
      })
    )
  })
})
