let installedStylesPath = ''
let stylesReadyPromise: Promise<unknown> = Promise.resolve(null)

export function setStylesRuntime(options: {
  installedStylesPath: string
  ready: Promise<unknown>
}): void {
  installedStylesPath = options.installedStylesPath
  stylesReadyPromise = options.ready
}

export function getInstalledStylesPath(): string {
  return installedStylesPath
}

export async function waitForStylesReady(): Promise<unknown> {
  return stylesReadyPromise
}
