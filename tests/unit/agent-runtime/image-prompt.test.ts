import { describe, expect, it } from 'vitest'
import { buildImagePromptGenerationMessages } from '../../../src/main/agent-runtime/prompt'

const messageText = (message: { content: unknown }): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content)

describe('image prompt composer', () => {
  it('loads the Chinese static instructions from the raw Markdown template', () => {
    const [system, user] = buildImagePromptGenerationMessages({
      locale: 'zh',
      userPrompt: '晨雾中的湖畔小屋',
      pageTitle: '晨间复盘',
      pageOutline: '用平静氛围引出一天的重点',
      pageHtml: '<main class="ppt-page-content">{{preserve-me}}</main>'
    })

    expect(messageText(system)).toContain('PPT 生图描述改写助手')
    expect(messageText(system)).toContain('避免任何可读文字、标题、logo、水印')
    expect(messageText(system)).not.toMatch(/\{\{[^}]+\}\}/)
    expect(messageText(user)).toContain('【页面标题】\n晨间复盘')
    expect(messageText(user)).toContain('【用户想生成的画面】\n晨雾中的湖畔小屋')
    expect(messageText(user)).toContain('{{preserve-me}}')
  })

  it('keeps the English request shape and fallback wording stable', () => {
    const [system, user] = buildImagePromptGenerationMessages({
      locale: 'en',
      userPrompt: '',
      pageTitle: '',
      pageOutline: '',
      pageHtml: '<section>slide</section>'
    })

    expect(messageText(system)).toContain('Do not summarize the style.')
    expect(messageText(user)).toContain('[Slide title]\n(untitled)')
    expect(messageText(user)).toContain('[Slide outline]\n(no outline)')
    expect(messageText(user)).toContain(
      '(User did not provide one. Infer a visual subject from the current slide.)'
    )
  })
})
