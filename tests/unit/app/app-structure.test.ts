import fs from 'fs'
import { describe, expect, it } from 'vitest'

describe('main app structure', () => {
  it('keeps window, menu, tray, and lifecycle implementation outside the bootstrap entry', () => {
    for (const filePath of [
      'src/main/app/window.ts',
      'src/main/app/menu.ts',
      'src/main/app/tray.ts',
      'src/main/app/lifecycle.ts',
      'src/main/app/renderer-recovery.ts',
      'src/main/app/application.ts'
    ]) {
      expect(fs.existsSync(filePath), filePath).toBe(true)
    }

    expect(fs.existsSync('src/main/tray.ts')).toBe(false)
    expect(fs.existsSync('src/main/renderer-recovery.ts')).toBe(false)
  })

  it('leaves the bootstrap responsible for composition rather than window implementation', () => {
    const bootstrap = fs.readFileSync('src/main/index.ts', 'utf8')

    expect(bootstrap).toContain("from './app/application'")
    expect(bootstrap).not.toContain("from './app/window'")
    expect(bootstrap).not.toContain("from './app/lifecycle'")
    expect(bootstrap).not.toContain("from './app/tray'")
    expect(bootstrap).not.toContain('function resolveWindowBounds')
    expect(bootstrap).not.toContain('function configureLogging')
    expect(bootstrap).not.toContain('function scheduleUpdateNotification')
  })

  it('resolves packaged assets from the bundled main-process output directory', () => {
    const windowModule = fs.readFileSync('src/main/app/window.ts', 'utf8')
    const trayModule = fs.readFileSync('src/main/app/tray.ts', 'utf8')

    expect(windowModule).toContain('const mainOutputDir = __dirname')
    expect(windowModule).toContain("join(mainOutputDir, '../preload/index.mjs')")
    expect(windowModule).toContain("join(mainOutputDir, '../renderer/index.html')")
    expect(trayModule).toContain('const mainOutputDir = __dirname')
    expect(trayModule).toContain("join(mainOutputDir, '../../build/icons')")
  })
})
