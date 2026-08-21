import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import log from 'electron-log/main.js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

let tray: Tray | null = null
let hasShownHideBalloon = false
const __dirname = dirname(fileURLToPath(import.meta.url))
// This module is bundled into the main-process entry, so __dirname is out/main
// at runtime even though the source lives in app/.
const mainOutputDir = __dirname

function resolveTrayIconPaths(): string[] {
  const iconPaths: string[] = []
  const fileNames = ['16x16.png', '32x32.png', 'icon.ico']
  const roots = [
    join(process.resourcesPath, 'icons'),
    join(process.resourcesPath, 'build/icons'),
    join(process.resourcesPath, 'app.asar.unpacked/build/icons'),
    join(process.resourcesPath, 'app.asar.unpacked/resources/icons'),
    join(mainOutputDir, '../../resources/icons'),
    join(mainOutputDir, '../../build/icons'),
    join(process.cwd(), 'build/icons')
  ]

  for (const root of roots) {
    for (const fileName of fileNames) {
      const iconPath = join(root, fileName)
      if (existsSync(iconPath)) iconPaths.push(iconPath)
    }
  }

  if (process.platform === 'win32' && existsSync(process.execPath)) {
    iconPaths.push(process.execPath)
  }

  return Array.from(new Set(iconPaths))
}

function showMainWindow(mainWindow: BrowserWindow | null): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

export function createTray(mainWindow: BrowserWindow | null): boolean {
  const iconPaths = resolveTrayIconPaths()
  if (iconPaths.length === 0) {
    log.warn('[tray] icon not found')
    return false
  }

  let selectedIconPath: string | null = null
  let trayIcon: Electron.NativeImage | null = null
  for (const iconPath of iconPaths) {
    const icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      log.warn('[tray] candidate icon is empty', { iconPath })
      continue
    }
    selectedIconPath = iconPath
    trayIcon =
      process.platform === 'win32' && !iconPath.toLowerCase().endsWith('.exe')
        ? icon.resize({ width: 16, height: 16 })
        : icon
    break
  }

  if (!selectedIconPath || !trayIcon || trayIcon.isEmpty()) {
    log.warn('[tray] all candidate icons are empty', { iconPaths })
    return false
  }

  try {
    tray = new Tray(trayIcon)
  } catch (error) {
    log.warn('[tray] create failed', {
      iconPath: selectedIconPath,
      message: error instanceof Error ? error.message : String(error)
    })
    return false
  }
  tray.setToolTip('ChatPPT')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        showMainWindow(mainWindow)
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy()
        }
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    showMainWindow(mainWindow)
  })

  log.info('[tray] created', { iconPath: selectedIconPath })
  return true
}

export function showTrayHideBalloon(): void {
  if (process.platform !== 'win32' || !tray || tray.isDestroyed() || hasShownHideBalloon) return
  hasShownHideBalloon = true
  tray.displayBalloon({
    title: 'ChatPPT 已最小化到托盘',
    content: '点击通知区域中的 ChatPPT 图标可恢复窗口。',
    iconType: 'info',
    largeIcon: false,
    noSound: true
  })
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
