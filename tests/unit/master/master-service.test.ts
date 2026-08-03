import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createSessionMasterIfMissing,
  getSessionMasterHtmlPath,
  getSessionMasterLayoutsPath,
  getSessionMasterPath,
  readSessionLayoutLibrary,
  readSessionMaster,
  writeSessionLayoutLibrary,
  writeSessionMaster
} from '../../../src/main/session/master-service'
import { createDefaultMasterGradient } from '../../../src/shared/master'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('session master file service', () => {
  it('reads a missing master in memory without creating a file', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-'))
    roots.push(projectDir)

    const result = await readSessionMaster(projectDir)

    expect(result.exists).toBe(false)
    expect(result.config.backgroundColor).toBe('#ffffff')
    await expect(readFile(getSessionMasterPath(projectDir), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('reads a missing layout library in memory without creating a file', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-'))
    roots.push(projectDir)

    const result = await readSessionLayoutLibrary(projectDir)

    expect(result.exists).toBe(false)
    expect(result.library.mappings.cover).toBe('cover-statement')
    await expect(readFile(getSessionMasterLayoutsPath(projectDir), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('ignores an unrelated root-level master.css without modifying it', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-'))
    roots.push(projectDir)
    const rootMasterPath = path.join(projectDir, 'master.css')
    const rootMasterCss = ':root { --ppt-page-bg: #112233; }'
    await writeFile(rootMasterPath, rootMasterCss, 'utf8')

    const result = await readSessionMaster(projectDir)

    expect(result.exists).toBe(false)
    expect(result.config.backgroundColor).toBe('#ffffff')
    expect(await readFile(rootMasterPath, 'utf8')).toBe(rootMasterCss)

    await writeSessionMaster(projectDir, result.config)
    expect(await readFile(rootMasterPath, 'utf8')).toBe(rootMasterCss)
  })

  it('creates once and atomically replaces only structured CSS', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-'))
    roots.push(projectDir)

    const created = await createSessionMasterIfMissing(projectDir)
    await writeFile(
      getSessionMasterPath(projectDir),
      `${created.css}/* preserved only until save */`,
      'utf8'
    )
    const saved = await writeSessionMaster(projectDir, {
      backgroundColor: '#112233',
      backgroundMode: 'override',
      backgroundStyle: 'solid',
      backgroundGradient: createDefaultMasterGradient(),
      backgroundImage: null,
      titleFontPreset: 'sans',
      bodyFontPreset: 'inherit',
      titleFontFamily: null,
      bodyFontFamily: null,
      titleFontSize: null,
      bodyFontSize: null,
      elements: {
        logoImage: null,
        footerText: 'Confidential',
        watermarkText: '',
        showPageNumber: true
      }
    })

    expect(saved).toMatchObject({
      exists: true,
      config: {
        backgroundColor: '#112233',
        backgroundMode: 'override',
        backgroundStyle: 'solid',
        backgroundGradient: createDefaultMasterGradient(),
        backgroundImage: null,
        titleFontPreset: 'sans',
        bodyFontPreset: 'inherit',
        titleFontFamily: null,
        bodyFontFamily: null,
        titleFontSize: null,
        bodyFontSize: null,
        elements: {
          logoImage: null,
          footerText: 'Confidential',
          watermarkText: '',
          showPageNumber: true
        }
      }
    })
    const onDisk = await readFile(getSessionMasterPath(projectDir), 'utf8')
    expect(onDisk).toBe(saved.css)
    expect(onDisk).not.toContain('preserved only until save')
    expect(await readFile(getSessionMasterHtmlPath(projectDir), 'utf8')).toContain(
      'data-ppt-master-elements="1"'
    )
    expect(
      JSON.parse(await readFile(getSessionMasterLayoutsPath(projectDir), 'utf8'))
    ).toMatchObject({
      version: 1,
      mappings: { cover: 'cover-statement' }
    })
  })

  it('persists only normalized, compatible layout mappings', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-'))
    roots.push(projectDir)

    const saved = await writeSessionLayoutLibrary(projectDir, {
      version: 1,
      mappings: { cover: 'cover-split', comparison: 'image-spotlight' }
    })

    expect(saved).toMatchObject({
      exists: true,
      library: { mappings: { cover: 'cover-split', comparison: 'comparison-versus' } }
    })
    expect(await readSessionLayoutLibrary(projectDir)).toMatchObject({
      exists: true,
      library: { mappings: { cover: 'cover-split', comparison: 'comparison-versus' } }
    })
  })

  it('keeps logo image paths relative to the page document and restores them for the UI model', async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-master-'))
    roots.push(projectDir)

    await writeSessionMaster(projectDir, {
      backgroundColor: '#ffffff',
      backgroundMode: 'inherit',
      backgroundStyle: 'solid',
      backgroundGradient: createDefaultMasterGradient(),
      backgroundImage: null,
      titleFontPreset: 'inherit',
      bodyFontPreset: 'inherit',
      titleFontFamily: null,
      bodyFontFamily: null,
      titleFontSize: null,
      bodyFontSize: null,
      elements: {
        logoImage: './images/brand.png',
        footerText: 'Acme',
        watermarkText: '',
        showPageNumber: true
      }
    })

    expect(await readFile(getSessionMasterHtmlPath(projectDir), 'utf8')).toContain(
      'src="./images/brand.png"'
    )
    expect((await readSessionMaster(projectDir)).config.elements).toMatchObject({
      logoImage: './images/brand.png'
    })
  })
})
