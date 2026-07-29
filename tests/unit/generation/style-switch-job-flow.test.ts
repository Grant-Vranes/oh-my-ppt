import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readStyleSwitchFileSnapshot,
  restoreStyleSwitchFileSnapshot
} from '../../../src/main/edit-jobs/style-switch-job-files'

const tempDirs: string[] = []

const createTempDir = async (): Promise<string> => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'style-switch-job-'))
  tempDirs.push(tempDir)
  return tempDir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((tempDir) => fs.promises.rm(tempDir, { recursive: true }))
  )
})

describe('style-switch job flow', () => {
  it('restores only the captured page file after a failed isolated page attempt', async () => {
    const tempDir = await createTempDir()
    const pagePath = path.join(tempDir, 'page-1.html')
    const otherPagePath = path.join(tempDir, 'page-2.html')
    await fs.promises.writeFile(pagePath, '<main>before</main>', 'utf8')
    await fs.promises.writeFile(otherPagePath, '<main>other</main>', 'utf8')

    const snapshot = await readStyleSwitchFileSnapshot(pagePath)
    await fs.promises.writeFile(pagePath, '<main>changed</main>', 'utf8')
    await restoreStyleSwitchFileSnapshot(pagePath, snapshot)

    await expect(fs.promises.readFile(pagePath, 'utf8')).resolves.toBe('<main>before</main>')
    await expect(fs.promises.readFile(otherPagePath, 'utf8')).resolves.toBe('<main>other</main>')
  })

  it('removes a file that did not exist in the captured snapshot', async () => {
    const tempDir = await createTempDir()
    const pagePath = path.join(tempDir, 'page-3.html')
    const snapshot = await readStyleSwitchFileSnapshot(pagePath)
    await fs.promises.writeFile(pagePath, '<main>unexpected</main>', 'utf8')

    await restoreStyleSwitchFileSnapshot(pagePath, snapshot)

    await expect(fs.promises.stat(pagePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
