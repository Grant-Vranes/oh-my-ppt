import fs from 'fs'
import os from 'os'
import path from 'path'
import { FilesystemBackend, createDeepAgent } from 'deepagents'
import { resolveModelTimeoutMs } from '@shared/model-timeout'
import { resolveModel } from '../agent'
import { readStylePackage } from '../styles/style-package'
import { buildStylePreviewPrompt } from '../prompt/style-preview-prompt'

const MAX_PREVIEW_HTML_BYTES = 1024 * 1024

type StylePreviewAgentArgs = {
  provider: string
  apiKey: string
  model: string
  baseUrl: string
  maxTokens?: number
  modelTimeoutMs: number
  workspaceDir: string
  prompt: string
}

type GenerateStylePreviewArgs = Omit<StylePreviewAgentArgs, 'workspaceDir' | 'prompt'> & {
  styleId: string
  stylePackageDir: string
}

type StylePreviewGeneratorDependencies = {
  runAgent?: (args: StylePreviewAgentArgs) => Promise<void>
}

async function runStylePreviewAgent(args: StylePreviewAgentArgs): Promise<void> {
  const model = resolveModel(
    args.provider,
    args.apiKey,
    args.model,
    args.baseUrl,
    0.65,
    args.maxTokens
  )
  const agent = createDeepAgent({
    model,
    backend: new FilesystemBackend({
      rootDir: args.workspaceDir,
      virtualMode: true
    }),
    systemPrompt:
      'You are a presentation style preview designer. Read the provided style package and use write_file to create the requested standalone preview.html. The file, not the chat response, is the deliverable.'
  })

  const stream = await agent.stream(
    {
      messages: [{ role: 'user', content: args.prompt }]
    },
    {
      streamMode: ['updates', 'messages'],
      subgraphs: true,
      signal: AbortSignal.timeout(resolveModelTimeoutMs(args.modelTimeoutMs, 'document'))
    }
  )

  for await (const _chunk of stream as AsyncIterable<unknown>) {
    // Consuming the stream drives the agent until preview.html has been written.
  }
}

export async function generateStylePreviewHtml(
  args: GenerateStylePreviewArgs,
  dependencies: StylePreviewGeneratorDependencies = {}
): Promise<string> {
  const stylePackageDir = path.resolve(args.stylePackageDir)
  const existingPackage = await readStylePackage(stylePackageDir)
  if (existingPackage.previewPath) {
    throw new Error('该风格已有预览，无需重复生成。')
  }

  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ohmyppt-style-preview-'))
  const workspaceDir = path.join(tempRoot, args.styleId)

  try {
    await fs.promises.mkdir(workspaceDir, { recursive: true })
    await Promise.all([
      fs.promises.copyFile(
        path.join(stylePackageDir, 'style.json'),
        path.join(workspaceDir, 'style.json')
      ),
      fs.promises.copyFile(
        path.join(stylePackageDir, 'SKILL.md'),
        path.join(workspaceDir, 'SKILL.md')
      )
    ])

    const prompt = buildStylePreviewPrompt()
    await (dependencies.runAgent || runStylePreviewAgent)({
      provider: args.provider,
      apiKey: args.apiKey,
      model: args.model,
      baseUrl: args.baseUrl,
      maxTokens: args.maxTokens,
      modelTimeoutMs: args.modelTimeoutMs,
      workspaceDir,
      prompt
    })

    const generatedPackage = await readStylePackage(workspaceDir)
    if (!generatedPackage.previewPath) {
      throw new Error('预览生成失败：模型未创建 preview.html。')
    }
    const previewHtml = await fs.promises.readFile(generatedPackage.previewPath, 'utf8')
    if (Buffer.byteLength(previewHtml, 'utf8') > MAX_PREVIEW_HTML_BYTES) {
      throw new Error('预览生成失败：preview.html 超过 1MB。')
    }
    return previewHtml
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}
