import type { BrowserWindow } from 'electron'

/** Owns the existing window-menu visibility policy without changing its behavior. */
export function configureWindowMenu(window: BrowserWindow): void {
  window.setAutoHideMenuBar(true)
}
