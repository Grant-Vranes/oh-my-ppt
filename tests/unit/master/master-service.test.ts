import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createSessionMasterIfMissing,
  getSessionMasterPath,
  readSessionMaster,
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
      bodyFontSize: null
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
        bodyFontSize: null
      }
    })
    const onDisk = await readFile(getSessionMasterPath(projectDir), 'utf8')
    expect(onDisk).toBe(saved.css)
    expect(onDisk).not.toContain('preserved only until save')
  })
})
