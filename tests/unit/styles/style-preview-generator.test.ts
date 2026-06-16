import { mkdtemp, readFile, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeStylePackage } from '../../../src/main/styles/style-package'

vi.mock('../../../src/main/agent', () => ({
  resolveModel: vi.fn()
}))

vi.mock('deepagents', () => ({
  FilesystemBackend: class FilesystemBackend {},
  createDeepAgent: vi.fn()
}))

const modelArgs = {
  provider: 'openai',
  apiKey: 'test-key',
  model: 'test-model',
  baseUrl: '',
  maxTokens: 4096,
  modelTimeoutMs: 600000
}

async function makeStylePackage(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ohmyppt-style-preview-test-'))
  const dir = path.join(root, 'paper-story')
  await writeStylePackage({
    dir,
    json: {
      style: 'paper-story',
      name: { zh: '纸上故事', en: 'Paper Story' },
      description: '温暖、有手作感的叙事风格',
      category: '叙事',
      aliases: [],
      styleCase: '品牌故事',
      version: '1.0.0',
      source: 'custom'
    },
    skillMarkdown: '# Paper Story\nUse warm paper textures and expressive editorial type.\n'
  })
  return dir
}

describe('generateStylePreview', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('generates in a temporary package and saves a validated preview.html', async () => {
    const stylePackageDir = await makeStylePackage()
    const { generateStylePreviewHtml } = await import('../../../src/main/utils/style-preview-generator')
    const runAgent = vi.fn(async ({ workspaceDir, prompt }) => {
      expect(prompt).toContain('original, presentation-ready copy')
      expect(prompt).toContain('copy language consistent')
      expect(await readFile(path.join(workspaceDir, 'SKILL.md'), 'utf8')).toContain('Paper Story')
      await writeFile(
        path.join(workspaceDir, 'preview.html'),
        '<!doctype html><html><head><style>html,body{width:1600px;height:900px}</style></head><body>把灵感写在纸上</body></html>',
        'utf8'
      )
    })

    const result = await generateStylePreviewHtml(
      { ...modelArgs, styleId: 'paper-story', stylePackageDir },
      { runAgent }
    )

    expect(result).toContain('把灵感写在纸上')
    await expect(readFile(path.join(stylePackageDir, 'preview.html'), 'utf8')).rejects.toThrow()
    expect(runAgent).toHaveBeenCalledOnce()
  })

  it('does not leave an invalid generated preview in the style package', async () => {
    const stylePackageDir = await makeStylePackage()
    const { generateStylePreviewHtml } = await import('../../../src/main/utils/style-preview-generator')

    await expect(
      generateStylePreviewHtml(
        { ...modelArgs, styleId: 'paper-story', stylePackageDir },
        {
          runAgent: async ({ workspaceDir }) => {
            await writeFile(
              path.join(workspaceDir, 'preview.html'),
              '<div>incomplete</div>',
              'utf8'
            )
          }
        }
      )
    ).rejects.toThrow(/complete HTML/)

    await expect(readFile(path.join(stylePackageDir, 'preview.html'), 'utf8')).rejects.toThrow()
  })

  it('does not regenerate a style that already has preview.html', async () => {
    const stylePackageDir = await makeStylePackage()
    await writeFile(
      path.join(stylePackageDir, 'preview.html'),
      '<!doctype html><html><body>existing preview</body></html>',
      'utf8'
    )
    const { generateStylePreviewHtml } = await import(
      '../../../src/main/utils/style-preview-generator'
    )
    const runAgent = vi.fn()

    await expect(
      generateStylePreviewHtml(
        { ...modelArgs, styleId: 'paper-story', stylePackageDir },
        { runAgent }
      )
    ).rejects.toThrow('该风格已有预览，无需重复生成。')
    expect(runAgent).not.toHaveBeenCalled()
  })
})
