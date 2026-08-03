let installedSkillsPath: string | null = null
let skillsReadyPromise: Promise<unknown> = Promise.resolve(null)

export const setSkillsRuntime = (options: {
  installedSkillsPath: string
  ready: Promise<unknown>
}): void => {
  installedSkillsPath = options.installedSkillsPath
  skillsReadyPromise = options.ready
}

export const getInstalledSkillsPath = (): string | null => installedSkillsPath

export const waitForSkillsReady = (): Promise<unknown> => skillsReadyPromise
