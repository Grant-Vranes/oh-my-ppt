import fs from 'fs'
import type { StyleSwitchFileSnapshot } from './style-switch-job-types'

export const readStyleSwitchFileSnapshot = async (
  filePath: string
): Promise<StyleSwitchFileSnapshot> => {
  if (!fs.existsSync(filePath)) return { exists: false, content: '' }
  return { exists: true, content: await fs.promises.readFile(filePath, 'utf-8') }
}

export const restoreStyleSwitchFileSnapshot = async (
  filePath: string,
  snapshot: StyleSwitchFileSnapshot
): Promise<void> => {
  if (snapshot.exists) {
    await fs.promises.writeFile(filePath, snapshot.content, 'utf-8')
    return
  }
  await fs.promises.rm(filePath, { force: true })
}
