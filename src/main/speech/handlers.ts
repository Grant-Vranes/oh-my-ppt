import { ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import * as cheerio from 'cheerio'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import log from 'electron-log/main.js'
import { resolveModelTimeoutMs } from '@shared/model-timeout'
import type { SpeechLength, SpeechStyle } from '@shared/speech'
import type { IpcContext } from '../ipc/context'
import { resolveGlobalModelTimeouts, resolveModelConfigForTask } from '../config/model-config-utils'
import { extractModelText, resolveModel } from '../agent-runtime/model'
import { readAppLocale, uiText } from '../config/locale-utils'

const SPEECH_DIR = 'speech'
const SPEECH_SCRIPT_FILE = 'speech-script.md'

function resolveSpeechScriptPath(projectDir: string): string {
  return path.join(projectDir, SPEECH_DIR, SPEECH_SCRIPT_FILE)
}

async function ensureSpeechDir(projectDir: string): Promise<void> {
  await fs.promises.mkdir(path.join(projectDir, SPEECH_DIR), { recursive: true })
}

async function removeSpeechScript(projectDir: string): Promise<void> {
  try {
    await fs.promises.unlink(resolveSpeechScriptPath(projectDir))
  } catch {
    // file may not exist
  }
}

async function readSpeechScript(projectDir: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(resolveSpeechScriptPath(projectDir), 'utf-8')
  } catch {
    return null
  }
}

function normalizeHeadingText(value: string): string {
  return value.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function normalizeSpeechPartHeading(part: string, pageNumber: number, title: string): string {
  const heading = `## Slide ${pageNumber}: ${title || 'Untitled'}`
  const body = part
    .replace(/^#{1,6}\s+[^\r\n]*(?:\r?\n)+/, '')
    .replace(/^\s*---\s*$/gm, '')
    .trim()
  return body ? `${heading}\n\n${body}` : heading
}

function isSpeechSectionForPage(section: string, pageNumber: number, title: string): boolean {
  const heading = normalizeHeadingText(
    section.split(/\r?\n/).find((line) => line.trim().length > 0) || ''
  )
  if (!heading) return false
  if (new RegExp(`(?:第\\s*${pageNumber}\\s*页|slide\\s*${pageNumber}\\b)`, 'i').test(heading)) {
    return true
  }
  const normalizedTitle = title.replace(/\s+/g, ' ').trim().toLowerCase()
  return Boolean(normalizedTitle) && heading.includes(normalizedTitle)
}

function upsertSpeechSection(existingScript: string | null, pageNumber: number, title: string, section: string): string {
  const nextSection = section.trim()
  if (!existingScript?.trim()) return nextSection

  const sections = existingScript
    .split(/\n\s*---\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean)
  const index = sections.findIndex((item) => isSpeechSectionForPage(item, pageNumber, title))
  if (index >= 0) {
    sections[index] = nextSection
  } else {
    sections.push(nextSection)
    sections.sort((a, b) => {
      const getPageNumber = (item: string): number => {
        const heading = normalizeHeadingText(item.split(/\r?\n/)[0] || '')
        const zh = heading.match(/第\s*(\d+)\s*页/)
        const en = heading.match(/slide\s*(\d+)\b/i)
        return Number(zh?.[1] || en?.[1] || Number.MAX_SAFE_INTEGER)
      }
      return getPageNumber(a) - getPageNumber(b)
    })
  }
  return sections.join('\n\n---\n\n')
}

function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html, { scriptingEnabled: false })
  $('script, style').remove()
  return $('body').text().replace(/\s+/g, ' ').trim()
}

function buildLengthInstruction(length: SpeechLength, isZh: boolean): string {
  if (isZh) {
    switch (length) {
      case 'short':
        return '本页演讲稿控制在100-150字以内（约1分钟），只提炼最核心的一两个要点，语言简练有力，不要展开细节。'
      case 'long':
        return '本页演讲稿写400-500字（约3-4分钟），充分展开论述，提供背景、数据、案例或类比，让听众深入理解每个要点。'
      default:
        return '本页演讲稿写200-300字（约2分钟），覆盖主要要点并适度展开，保持节奏流畅。'
    }
  } else {
    switch (length) {
      case 'short':
        return 'Keep this slide to 100–150 words (~1 minute). Distill the one or two most essential points. Be crisp and punchy — no elaboration.'
      case 'long':
        return 'Write 400–500 words (~3–4 minutes). Fully develop the ideas with background context, data, examples, or analogies so the audience deeply understands each point.'
      default:
        return 'Write 200–300 words (~2 minutes). Cover the main points with moderate elaboration and maintain a smooth pace.'
    }
  }
}

function buildStyleInstruction(style: SpeechStyle, isZh: boolean, customStyle?: string): string {
  if (style === 'custom') {
    const fallback = isZh
      ? '语气轻松自然，口语化，像和听众直接对话一样，亲切易懂。'
      : 'Use a relaxed, conversational tone as if speaking directly to the audience. Keep it approachable and natural.'
    return customStyle?.trim() || fallback
  }
  if (isZh) {
    switch (style) {
      case 'formal':
        return [
          '采用正式、严谨的演讲风格，适合商务汇报、学术答辩或政务场合。',
          '语言精准，措辞规范，句式完整，避免口语化、缩写或随意的表达。',
          '每个要点层次分明，逻辑严密，体现专业深度与权威性。',
          '开场可用数据或引言定调，结尾给出明确结论或建议。'
        ].join('')
      case 'storytelling':
        return [
          '采用叙事驱动的演讲风格，用故事、场景或真实案例作为切入点，让听众产生画面感和代入感。',
          '开场设置悬念或情境（谁、在哪、发生了什么），通过情节推进自然引出幻灯片的核心信息。',
          '适当加入细节、对话或情感转折，让内容有温度、有记忆点。',
          '结尾将故事与要点收拢，给听众留下深刻印象。'
        ].join('')
      default:
        return [
          '采用轻松自然的对话风格，像和朋友聊天一样和听众交流，拉近距离感。',
          '多用短句、口语化词汇和第一/二人称（"我们"、"你可能会想……"）。',
          '适当加入反问或小幽默调动气氛，让内容易于接受和记忆。',
          '避免过于书面化，保持真实、有人情味的语调。'
        ].join('')
    }
  } else {
    switch (style) {
      case 'formal':
        return [
          'Use a formal, authoritative tone appropriate for business presentations, academic defenses, or official settings.',
          'Choose precise, professional vocabulary. Write in complete sentences. Avoid contractions, slang, or casual phrasing.',
          'Structure each point with clear logic — state the claim, support it with evidence or reasoning, and draw a conclusion.',
          'Open with a strong framing statement (a statistic, a quote, or a clear thesis) and close with a definitive takeaway or recommendation.'
        ].join(' ')
      case 'storytelling':
        return [
          'Use a narrative-driven style. Open each slide by dropping the audience into a scene, anecdote, or real-world case — set up who, where, and what happened.',
          'Let the story unfold naturally to reveal the slide\'s core insight, rather than stating it upfront.',
          'Include vivid details, dialogue snippets, or an emotional beat to make the content memorable and human.',
          'Close by tying the story back to the key point, leaving the audience with a lasting image or feeling.'
        ].join(' ')
      default:
        return [
          'Use a warm, conversational tone — speak to the audience like a knowledgeable colleague sharing insights, not a lecturer reciting facts.',
          'Prefer short sentences, contractions, and first/second-person language ("we", "you might be thinking…", "here\'s the thing").',
          'Occasionally pose a rhetorical question or light observation to keep the audience engaged.',
          'Keep it genuine and approachable — avoid overly formal or stiff phrasing.'
        ].join(' ')
    }
  }
}

const activeSpeechGenerations = new Set<string>()

export function registerSpeechHandlers(ctx: IpcContext): void {
  ipcMain.handle('speech:generateScript', async (event, payload) => {
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
    if (!sessionId) throw new Error('Session ID is required')

    const scope: 'all' | 'single' = payload?.scope === 'single' ? 'single' : 'all'
    const currentPageId: string =
      typeof payload?.currentPageId === 'string' ? payload.currentPageId.trim() : ''
    const length: SpeechLength =
      payload?.length === 'short' || payload?.length === 'long' ? payload.length : 'medium'
    const style: SpeechStyle =
      payload?.style === 'formal' || payload?.style === 'storytelling' || payload?.style === 'custom'
        ? payload.style
        : 'conversational'
    const customStyle: string =
      style === 'custom' && typeof payload?.customStyle === 'string' ? payload.customStyle : ''

    const locale = await readAppLocale(ctx)
    const isZh = locale === 'zh'

    if (scope === 'single' && !currentPageId) {
      throw new Error(uiText(locale, '单页模式需要提供当前页面 ID', 'currentPageId is required for single-page scope'))
    }

    if (activeSpeechGenerations.has(sessionId)) {
      throw new Error(uiText(locale, '正在生成中，请稍候', 'Generation already in progress'))
    }
    activeSpeechGenerations.add(sessionId)

    try {
      const session = await ctx.db.getSession(sessionId)
      if (!session) {
        throw new Error(uiText(locale, '找不到会话', 'Session not found'))
      }

      const pages = await ctx.db.listSessionPages(sessionId)
      if (pages.length === 0) {
        throw new Error(uiText(locale, '该会话没有幻灯片页面', 'No pages found in this session'))
      }

      const projectDir = await ctx.resolveSessionProjectDir(sessionId)

      const filteredPages =
        scope === 'single' && currentPageId ? pages.filter((p) => p.id === currentPageId) : pages

      if (filteredPages.length === 0) {
        throw new Error(uiText(locale, '找不到指定页面', 'Specified page not found'))
      }

      const slideContents: Array<{ pageNumber: number; title: string; text: string }> = []
      for (const p of filteredPages) {
        if (!p.html_path) continue
        const rawHtmlPath = path.isAbsolute(p.html_path)
          ? p.html_path
          : path.resolve(projectDir, p.html_path)
        let safeHtmlPath: string
        try {
          safeHtmlPath = await ctx.assertPathInAllowedRoots({
            filePath: rawHtmlPath,
            mode: 'read',
            sessionId,
            htmlOnly: true
          })
        } catch {
          log.warn('[speech] skipping page with unsafe htmlPath', { rawHtmlPath, projectDir })
          continue
        }
        try {
          const html = await fs.promises.readFile(safeHtmlPath, 'utf-8')
          const text = extractTextFromHtml(html)
          slideContents.push({
            pageNumber: p.page_number,
            title: p.title || '',
            text: text || uiText(locale, '（本页主要为图片或视觉内容，请结合上下文发挥）', '(This slide is mainly visual; improvise based on context.)')
          })
        } catch (err) {
          log.warn('[speech] failed to read page html', { htmlPath: p.html_path, err })
        }
      }

      if (slideContents.length === 0) {
        throw new Error(uiText(locale, '没有可读取的幻灯片内容', 'No readable slide content found'))
      }

      const modelConfig = await resolveModelConfigForTask(ctx, {
        modelConfigId: payload?.modelConfigId,
        purpose: 'speech:generateScript'
      })
      const timeouts = await resolveGlobalModelTimeouts(ctx)
      const timeoutMs = resolveModelTimeoutMs(timeouts['document'], 'document')
      const model = resolveModel(
        modelConfig.provider,
        modelConfig.apiKey,
        modelConfig.model,
        modelConfig.baseUrl,
        0.7,
        modelConfig.maxTokens,
        ctx.modelRuntime
      )

      const lengthInstruction = buildLengthInstruction(length, isZh)
      const styleInstruction = buildStyleInstruction(style, isZh, customStyle)
      const total = slideContents.length
      const sessionTitle = session.title || session.topic || (isZh ? '未命名' : 'Untitled')

      const scriptPath = resolveSpeechScriptPath(projectDir)
      if (scope === 'all') {
        // Full generation replaces the whole speech artifact.
        await removeSpeechScript(projectDir)
      }

      const systemPrompt = uiText(
        locale,
        `你是一位经验丰富的演讲稿撰写人，擅长将幻灯片内容转化为自然流畅、打动人心的演讲词。

**任务规则：**
- 每次仅为当前一页幻灯片生成演讲稿，不要提前引用后续页面内容。
- 输出以 "## Slide N: {标题}" 开头，正文直接是演讲词，不要加任何说明性注释或括号提示。
- 演讲词是演讲者直接开口说的话，用第一人称，不要写成旁白或摘要。
- 不要逐字复读幻灯片上的文字，而是将关键信息转化为自然的口语表达，做到"讲"而非"念"。

**字数与时长：**
${lengthInstruction}

**演讲风格：**
${styleInstruction}

**页面衔接：**
如提供了上一页的结尾内容，请在开头自然地加入过渡语句，使演讲整体连贯，不显突兀。`,
        `You are an experienced speech writer who transforms slide content into natural, compelling spoken words.

**Rules:**
- Generate speaker notes for the current slide only. Do not reference future slides.
- Begin your response with "## Slide N: {Title}", then deliver the speech directly — no meta-commentary, annotations, or bracketed notes.
- Write in first person as the speaker's actual spoken words, not a summary or narration.
- Do not read the slide verbatim. Translate key information into natural spoken language — the goal is to "tell", not "recite".

**Length & Pacing:**
${lengthInstruction}

**Style:**
${styleInstruction}

**Transitions:**
If the previous slide's ending is provided, open with a smooth transition sentence that connects the two slides naturally.`
      )

      const scriptParts: string[] = []
      let prevEnding = ''

      for (let i = 0; i < slideContents.length; i++) {
        const slide = slideContents[i]
        const current = i + 1
        event.sender.send('speech:progress', { sessionId, current, total })

        const contextPart = prevEnding
          ? uiText(locale, `上一页结尾：${prevEnding}\n\n`, `Previous slide ending: ${prevEnding}\n\n`)
          : ''

        const progressZh = total > 1 ? `【生成进度】${current} / ${total}\n` : ''
        const progressEn = total > 1 ? `[Generation Progress] ${current} / ${total}\n` : ''

        const userPrompt = uiText(
          locale,
          `${contextPart}【演示文稿】${sessionTitle}
${progressZh}【Slide】Slide ${slide.pageNumber}
【本页标题】${slide.title || '（无标题）'}

【幻灯片文字内容】
${slide.text}

请为本页生成演讲稿。`,
          `${contextPart}[Presentation] ${sessionTitle}
${progressEn}[Slide] Slide ${slide.pageNumber}
[Slide Title] ${slide.title || '(no title)'}

[Slide Text Content]
${slide.text}

Please generate the speaker script for this slide.`
        )

        log.info('[speech] generating slide', { sessionId, current, total })

        const response = await model.invoke(
          [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)],
          { signal: AbortSignal.timeout(timeoutMs) }
        )
        const rawPart = extractModelText(response).trim()
        if (!rawPart) {
          throw new Error(uiText(locale, '模型返回为空', 'Model returned empty content'))
        }
        const part = normalizeSpeechPartHeading(rawPart, slide.pageNumber, slide.title)
        scriptParts.push(part)

        prevEnding = part.slice(-100).replace(/\s+/g, ' ').trim()
      }

      const script =
        scope === 'single'
          ? upsertSpeechSection(
              await readSpeechScript(projectDir),
              slideContents[0].pageNumber,
              slideContents[0].title,
              scriptParts[0]
            )
          : scriptParts.join('\n\n---\n\n')
      await ensureSpeechDir(projectDir)
      await fs.promises.writeFile(scriptPath, script, 'utf-8')

      log.info('[speech] script saved', { sessionId, scriptPath })
      return { success: true }
    } finally {
      activeSpeechGenerations.delete(sessionId)
    }
  })

  ipcMain.handle('speech:getScript', async (_event, payload) => {
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
    if (!sessionId) throw new Error('Session ID is required')

    const projectDir = await ctx.resolveSessionProjectDir(sessionId)
    const script = await readSpeechScript(projectDir)
    return { success: true, script }
  })

  ipcMain.handle('speech:openScriptFile', async (_event, payload) => {
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
    if (!sessionId) throw new Error('Session ID is required')

    const projectDir = await ctx.resolveSessionProjectDir(sessionId)
    const scriptPath = resolveSpeechScriptPath(projectDir)
    await fs.promises.access(scriptPath, fs.constants.R_OK)
    shell.showItemInFolder(scriptPath)
    return { success: true, path: scriptPath }
  })

  ipcMain.handle('speech:clearScript', async (_event, payload) => {
    const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId.trim() : ''
    if (!sessionId) throw new Error('Session ID is required')

    const projectDir = await ctx.resolveSessionProjectDir(sessionId)
    await removeSpeechScript(projectDir)
    return { success: true }
  })
}
