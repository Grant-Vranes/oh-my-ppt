import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createPromptCatalog } from '../catalog'

import systemEnTemplate from '../templates/image-prompt/system-en.md?raw'
import systemZhTemplate from '../templates/image-prompt/system-zh.md?raw'

type ImagePromptTemplateVars = {
  'system-en': {}
  'system-zh': {}
}

const imagePromptCatalog = createPromptCatalog<ImagePromptTemplateVars>({
  'system-en': systemEnTemplate.trimEnd(),
  'system-zh': systemZhTemplate.trimEnd()
})

export type ImagePromptGenerationArgs = {
  locale: 'zh' | 'en'
  userPrompt: string
  pageTitle: string
  pageOutline: string
  pageHtml: string
}

/** Static model instructions stay in Markdown; request-specific content is composed here. */
export const buildImagePromptGenerationMessages = (
  args: ImagePromptGenerationArgs
): [SystemMessage, HumanMessage] => {
  const isZh = args.locale.startsWith('zh')
  const systemPrompt = imagePromptCatalog.render(isZh ? 'system-zh' : 'system-en', {})
  const userPrompt = isZh
    ? `【页面标题】
${args.pageTitle || '（无标题）'}

【页面大纲】
${args.pageOutline || '（无大纲）'}

【用户想生成的画面】
${args.userPrompt || '（用户未填写，请根据当前页推断配图主题）'}

【当前页 HTML/CSS，供分析视觉风格】
${args.pageHtml}

请输出一条最终配图描述。它应该能直接填入生图模型，而不是风格总结。`
    : `[Slide title]
${args.pageTitle || '(untitled)'}

[Slide outline]
${args.pageOutline || '(no outline)'}

[User desired image]
${args.userPrompt || '(User did not provide one. Infer a visual subject from the current slide.)'}

[Current slide HTML/CSS for visual style analysis]
${args.pageHtml}

Output one final visual description that can be pasted directly into an image model. Do not summarize the style.`

  return [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)]
}
