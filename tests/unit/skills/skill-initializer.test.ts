import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CompositeBackend, FilesystemBackend } from 'deepagents'
import { describe, expect, it } from 'vitest'
import { compareVersion, initializeSkills } from '../../../src/main/skills/skill-initializer'
import { attachProductSkillsBackend } from '../../../src/main/skills/product-skills-backend'
import { setSkillsRuntime } from '../../../src/main/skills/skill-runtime'
import {
  CHART_SKILL_NAME,
  DATA_ANIM_SKILL_NAME,
  LAYOUT_SKILL_NAME,
  PRODUCT_SKILLS_ROUTE,
  RED_LAYOUT_SKILL_NAME,
  REQUIRED_PRODUCT_SKILL_NAMES,
  SOURCE_READING_SKILL_NAME,
  SQUARE_1_1_LAYOUT_SKILL_NAME,
  STANDARD_4_3_LAYOUT_SKILL_NAME,
  SYSTEM_SKILLS_SOURCE_PATH,
  VERTICAL_3_4_LAYOUT_SKILL_NAME,
  VERTICAL_9_16_LAYOUT_SKILL_NAME
} from '../../../src/main/skills/skill-contract'

async function makeSkill(root: string, name: string, version: string, body = '# Skill\n'): Promise<void> {
  const skillPath = path.join(root, name)
  await mkdir(skillPath, { recursive: true })
  await writeFile(
    path.join(skillPath, 'skill.json'),
    `${JSON.stringify({ name, version, source: 'builtin' }, null, 2)}\n`,
    'utf8'
  )
  await writeFile(
    path.join(skillPath, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Test skill\n---\n\n${body}`,
    'utf8'
  )
}

describe('initializeSkills', () => {
  it('compares numeric semver segments', () => {
    expect(compareVersion('1.10.0', '1.2.0')).toBeGreaterThan(0)
    expect(compareVersion('2.0.0', '10.0.0')).toBeLessThan(0)
    expect(compareVersion('1.0', '1.0.0')).toBe(0)
  })

  it('installs bundled system skills into installed root and writes manifest', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-skills-'))
    const bundled = path.join(tmp, 'bundled')
    const installed = path.join(tmp, 'installed')
    await makeSkill(bundled, 'oh-my-ppt-data-anim', '1.0.0')

    const result = await initializeSkills({
      builtinSourcePath: bundled,
      installedRootPath: installed,
    })

    expect(result).toMatchObject({
      builtinCount: 1,
      copiedCount: 1,
      skippedCount: 0,
      failedCount: 0,
    })
    const manifest = JSON.parse(
      await readFile(path.join(installed, 'system', '.manifest.json'), 'utf8')
    )
    expect(manifest.skills['oh-my-ppt-data-anim']).toMatchObject({
      version: '1.0.0',
      source: 'builtin',
    })
    await expect(
      readFile(path.join(installed, 'system', 'oh-my-ppt-data-anim', 'SKILL.md'), 'utf8')
    ).resolves.toContain('Test skill')
  })

  it('keeps installed skills readable through the DeepAgents composite route', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-skills-route-'))
    const bundled = path.join(tmp, 'bundled')
    const installed = path.join(tmp, 'installed')
    await makeSkill(bundled, 'oh-my-ppt-data-anim', '1.0.0', '# Routed Skill\n')
    await makeSkill(bundled, 'oh-my-ppt-chart', '1.0.0', '# Routed Chart Skill\n')
    await initializeSkills({
      builtinSourcePath: bundled,
      installedRootPath: installed,
    })

    const backend = new CompositeBackend(
      new FilesystemBackend({ rootDir: tmp, virtualMode: true }),
      {
        [PRODUCT_SKILLS_ROUTE]: new FilesystemBackend({
          rootDir: installed,
          virtualMode: true,
        }),
      }
    )

    const skillSource = `${PRODUCT_SKILLS_ROUTE}${SYSTEM_SKILLS_SOURCE_PATH.replace(/^\//, '')}`
    const dataAnimSkillPath = `${skillSource}oh-my-ppt-data-anim/SKILL.md`
    const chartSkillPath = `${skillSource}oh-my-ppt-chart/SKILL.md`
    const listed = await backend.ls(skillSource)
    expect(listed.error).toBeUndefined()
    expect(listed.files?.map((file) => file.path)).toContain(
      `${skillSource}oh-my-ppt-data-anim/`
    )
    expect(listed.files?.map((file) => file.path)).toContain(
      `${skillSource}oh-my-ppt-chart/`
    )

    const read = await backend.read(
      dataAnimSkillPath,
      0,
      20
    )
    expect(read.error).toBeUndefined()
    expect(read.content).toContain('Routed Skill')

    const downloads = await backend.downloadFiles([
      dataAnimSkillPath,
      chartSkillPath,
    ])
    expect(downloads.map((download) => download.error ?? null)).toEqual([null, null])
    expect(new TextDecoder().decode(downloads[1].content)).toContain('Routed Chart Skill')
  })

  it('upgrades system skills by numeric version and marks removed bundled skills', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-skills-upgrade-'))
    const bundled = path.join(tmp, 'bundled')
    const installed = path.join(tmp, 'installed')
    await makeSkill(bundled, 'oh-my-ppt-data-anim', '1.0.0', 'old body\n')
    await makeSkill(bundled, 'legacy-skill', '1.0.0', 'legacy body\n')

    await initializeSkills({
      builtinSourcePath: bundled,
      installedRootPath: installed,
    })

    const upgradedBundled = path.join(tmp, 'bundled-upgraded')
    await makeSkill(upgradedBundled, 'oh-my-ppt-data-anim', '1.10.0', 'new body\n')
    const upgraded = await initializeSkills({
      builtinSourcePath: upgradedBundled,
      installedRootPath: installed,
    })

    expect(upgraded.copiedCount).toBe(1)
    expect(upgraded.manifest.skills['oh-my-ppt-data-anim']).toMatchObject({
      version: '1.10.0',
    })
    await expect(
      readFile(path.join(installed, 'system', 'oh-my-ppt-data-anim', 'SKILL.md'), 'utf8')
    ).resolves.toContain('new body')
    expect(upgraded.manifest.skills['legacy-skill'].missingFromBundle).toBe(true)
  })

  it('exposes only the selected canvas product skills through the DeepAgents source', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-filtered-skills-'))
    const bundled = path.join(tmp, 'bundled')
    const installed = path.join(tmp, 'installed')
    await makeSkill(bundled, VERTICAL_9_16_LAYOUT_SKILL_NAME, '1.0.0', '# Portrait Layout\n')
    await makeSkill(bundled, STANDARD_4_3_LAYOUT_SKILL_NAME, '1.0.0', '# Standard Layout\n')
    await makeSkill(bundled, DATA_ANIM_SKILL_NAME, '1.0.0', '# Data Anim\n')
    await makeSkill(bundled, CHART_SKILL_NAME, '1.0.0', '# Chart\n')
    await makeSkill(bundled, SOURCE_READING_SKILL_NAME, '1.0.0', '# Source Reading\n')
    await initializeSkills({
      builtinSourcePath: bundled,
      installedRootPath: installed
    })
    setSkillsRuntime({ installedSkillsPath: installed, ready: Promise.resolve(null) })

    const agentBackend = attachProductSkillsBackend(
      new FilesystemBackend({ rootDir: tmp, virtualMode: true }),
      'session-deck',
      [
        VERTICAL_9_16_LAYOUT_SKILL_NAME,
        DATA_ANIM_SKILL_NAME,
        CHART_SKILL_NAME,
        SOURCE_READING_SKILL_NAME
      ]
    )

    const listed = await agentBackend.backend.ls(agentBackend.skillSource)
    expect(listed.error).toBeUndefined()
    expect(listed.files?.map((file) => file.path).sort()).toEqual([
      `${agentBackend.skillSource}${CHART_SKILL_NAME}/`,
      `${agentBackend.skillSource}${DATA_ANIM_SKILL_NAME}/`,
      `${agentBackend.skillSource}${SOURCE_READING_SKILL_NAME}/`,
      `${agentBackend.skillSource}${VERTICAL_9_16_LAYOUT_SKILL_NAME}/`
    ])

    const allowedRead = await agentBackend.backend.read(
      `${agentBackend.skillSource}${VERTICAL_9_16_LAYOUT_SKILL_NAME}/SKILL.md`
    )
    expect(allowedRead.error).toBeUndefined()
    expect(allowedRead.content).toContain('Portrait Layout')

    const blockedRead = await agentBackend.backend.read(
      `${agentBackend.skillSource}${STANDARD_4_3_LAYOUT_SKILL_NAME}/SKILL.md`
    )
    expect(blockedRead.error).toContain('Product skill is not enabled for this canvas')
  })

  it('bundles dedicated layout skills for every supported canvas', async () => {
    for (const skillName of [
      LAYOUT_SKILL_NAME,
      VERTICAL_9_16_LAYOUT_SKILL_NAME,
      STANDARD_4_3_LAYOUT_SKILL_NAME,
      SQUARE_1_1_LAYOUT_SKILL_NAME,
      VERTICAL_3_4_LAYOUT_SKILL_NAME,
      RED_LAYOUT_SKILL_NAME
    ]) {
      expect(REQUIRED_PRODUCT_SKILL_NAMES).toContain(skillName)
      const raw = await readFile(
        path.join(process.cwd(), 'resources', 'skills', skillName, 'skill.json'),
        'utf8'
      )
      expect(JSON.parse(raw)).toMatchObject({ name: skillName, source: 'builtin' })
      await expect(
        readFile(path.join(process.cwd(), 'resources', 'skills', skillName, 'SKILL.md'), 'utf8')
      ).resolves.toContain(`name: ${skillName}`)
    }
  })
})
