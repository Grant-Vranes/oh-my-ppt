import { formatLayoutIntentPrompt } from '@shared/layout-intent'
import type { DesignContract, SessionDeckGenerationContext } from '../tools/types'
import {
  CHART_SKILL_NAME,
  DATA_ANIM_SKILL_NAME,
  LAYOUT_SKILL_NAME,
  SOURCE_READING_SKILL_NAME,
  formatSkillUsageRequirement,
} from '../skills/skill-contract'

export const PAGE_SEMANTIC_STRUCTURE = [
  '## 页面语义结构',
  `- The layout source of truth is the skill ${LAYOUT_SKILL_NAME}. Before creating a slide, choosing a composition, or repairing overflow/collision: ${formatSkillUsageRequirement(LAYOUT_SKILL_NAME)}`,
  '- 写每页 HTML 前，先像设计师想三件事：① 这页的**焦点**是什么（观众先看哪）？② 其余元素怎么摆才**平衡**（视觉重量不偏一边、不堆一角）？③ 每处留白是**刻意的 framing 还是不小心的空缺**——不小心的空缺就重排。想清楚再写。',
  '- If the task is a tiny text/style edit that does not affect layout, do not read the full layout reference.',
  '- 直接输出完整创意页面片段；系统会自动包裹 section[data-page-scaffold]、main[data-role="content"] 和标准 page frame。',
  '- 如果页面有明确标题，可以给第一个标题元素添加 data-role="title"；没有传统标题时不要为了校验硬造标题。',
  '- 主动添加 data-block-id 时保持页面内唯一（kebab-case：metric-1、summary、chart-main）；未添加时系统会自动补齐。'
].join('\n')

export const CONTENT_LANGUAGE_RULES = [
  '## Content language',
  '- The language of these instructions is not the output language. Do not imitate the prompt language.',
  '- If the user explicitly requests a language, use that language.',
  "- Otherwise, use the dominant language of the user's latest request and provided source materials.",
  '- If source materials are primarily English, write slide titles, body text, outlines, and user-facing summaries in English. Do not translate them into Chinese.',
  '- If source materials are primarily Chinese, write slide titles, body text, outlines, and user-facing summaries in Chinese.',
  '- For mixed-language materials, prefer the latest user instruction language.',
  '- Preserve proper nouns, brand names, technical terms, quoted source text, and metrics when appropriate.'
].join('\n')

export const SOURCE_UNSUPPORTED_CLAIMS =
  'exact facts, metrics, dates, system names, status claims, examples, risks, decisions, or conclusions'

export const SOURCE_MATERIAL_PLANNING_RULES = [
  '## Source-grounded planning rules',
  '- Apply these rules only when source documents, parsed reference-document outlines, or source-material briefs are present.',
  '- Treat source materials as the primary content authority. Stay source-grounded and avoid creative drift.',
  `- Every source-backed slide title and key point must be traceable to the user requirements or source materials. Do not invent ${SOURCE_UNSUPPORTED_CLAIMS} not present in the source.`,
  '- Preserve source order, hierarchy, terminology, and stated conclusions unless the user explicitly asks for a different structure.',
  '- Dense source tables/lists are evidence, not a slide checklist. Plan them as focused PPT pages: one main message per page, grouped support, and a clear reading path; split into multiple slides when one page would become a data dump.',
  '- If the source material does not naturally fill the target slide count, split source-backed sections into finer-grained slides and deepen each slide from the available material: background/context already implied by the source, comparison dimensions, cause/effect, mechanism, implications, "so what", evidence groupings, or visual explanation modules.',
  '- Do not add generic agenda, data overview, synthesis, next steps, outlook, background, summary, or transition slides unless the user request or source material explicitly contains them.'
].join('\n')

export const SOURCE_DOCUMENT_LOCATE_THEN_READ_RULE = [
  `- Before using source documents: ${formatSkillUsageRequirement(SOURCE_READING_SKILL_NAME)}`,
  '- No retrieved snippets matched. Locate relevant source passages before writing; do not write the slide from the outline alone. Then expand thin pages with analysis derived from the source — grounding forbids invented facts, not analytical structure.'
].join('\n')

export const SOURCE_DOCUMENT_READ_STRATEGY = [
  `- Before using source documents: ${formatSkillUsageRequirement(SOURCE_READING_SKILL_NAME)}`,
  '- Treat retrieved snippets as an index into the source, not as final evidence. Grounding forbids inventing facts the source lacks — not the analytical expansion (comparison, implications, so-what) that fills a thin page from inspected material.'
].join('\n')

export const SOURCE_DOCUMENT_FACT_RULE = [
  `- Do not invent ${SOURCE_UNSUPPORTED_CLAIMS} not present in the source document.`
].join('\n')

export const SOURCE_GROUNDED_EXPANSION_RULES = [
  '- When source documents are present, expansion must be source-grounded: use the inspected material as the authority for enrichment and summarization.',
  '- First judge whether the inspected reference material is already enough for a readable slide. If it is enough, do not enrich or add support modules; edit, group, and choose the clearest PPT expression.',
  '- If the reference material for a slide is truly thin, you should actively enrich the slide from the material instead of leaving it sparse.',
  '- Expand by adding source-grounded analysis structure: context implied by the source, comparison dimensions, cause/effect, mechanism, implications, "so what", evidence grouping, annotations, or concise explanatory modules.',
  '- If the inspected source material is already dense, source-grounded does not mean exhaustive: summarize, group, and choose the clearest PPT expression instead of reproducing every row, metric, or bullet as visible modules.',
  '- This is expansion of reasoning and presentation structure, not invention of new evidence: do not fabricate unsupported exact facts, metrics, dates, cases, quotes, source names, risks, decisions, or conclusions.'
].join('\n')

export const SLIDE_THESIS_RULES = [
  '## 像设计师一样想这页（写 HTML 前先想清楚）',
  '- **3 秒主旨**：PPT 是演讲辅助，不是文档浏览。写页面前先定一句观众 3 秒内能抓住的话；标题、主图表、关键数字和结论都围绕这句话服务。',
  '- **一个焦点**：这页让观众先看什么、记住哪一句？围绕唯一焦点组织，其余是它的支撑——靠大小 / 位置 / 颜色分出层级，不要所有模块等权平铺。内容点与源文档是焦点的证据，按焦点取舍而非逐条上屏。',
  '- **过密先自我总结**：如果素材 / 当前页内容一眼看会超过 1600×900 或形成高密度信息墙，写 HTML 前必须先在心里总结成"一句主旨 + 2–4 个支撑组 / 证据轨"；只把总结后的结构上屏，细枝末节合并为注释、标签、脚注或讲稿感的隐含信息，不能逐条搬运。',
  '- **构图平衡**：元素的视觉重量（大 / 深 / 彩色 = 重，小 / 浅 = 轻）在画布上分布平衡，不偏一边、不堆一角。平衡 ≠ 塞满——一个焦点配大块刻意留白，同样平衡。',
  '- **留白是设计，不是待填的空**：每处留白要么是刻意的 framing / 呼吸，要么就重排消除；绝不留"不小心的、看着失衡的大空缺"。',
  '- **量的多少不是问题，平衡才是**：内容少就收敛成一个低密度 hero / 大图表 / 时间线 / 结构图焦点，让少量信息有承重主体；内容多就先总结、分组、压缩、留呼吸感。别在"塞满"和"留空"里二选一——目标是协调。'
].join('\n')

export const CONTENT_EXPANSION_RULES = [
  '## 扩展规则（薄则补论证结构，不是补事实）',
  '- **补结构 ≠ 编造事实**：内容少时，从现有标题 / 要点推导解释、影响、对比、机制、基于已有要点的 "so what" 表达、视觉结构，把页面做成完整论证——这是允许且鼓励的。禁止的是另一件事：不要捏造源里没有的具体数字、日期、案例、引用、人名、来源或新结论。两件事必须分开：别因为怕编造，就连合理的结构推导也不做。',
  '- 先判断是否真的不足：已有完整表格、多指标对比、图表 + 读图结论、或 4 条以上可用事实时，视为内容够了就不扩展——不要再新增卡片、注释区或第二套总结，只取舍、分组、压缩。',
  '- 不扩展时也不能小卡片堆顶部留空底：用低密度 hero / 大图表 / 时间线 / 结构图撑住页面。',
  '- 扩展后收在一页 1600×900 内：能少量讲清就不再加，需要更多支撑就合并重复、把次要细节压成标签/注释，保持呼吸感。'
].join('\n')

export const STABLE_HTML_FRAGMENT_PROTOCOL = [
  '## HTML 片段协议',
  '- 只输出正文片段（一个 `<div>` 根节点）；section[data-page-scaffold]、main[data-role="content"]、data-block-id、page frame 由工具自动补，不要手写。',
  '- 片段里不要出现 `<!doctype>/<html>/<head>/<body>`、`<script src=>`、CDN/远程资源，以及系统骨架类 .ppt-page-root/.ppt-page-content/.ppt-page-fit-scope/data-ppt-guard-root（class、CSS、注释里都算）。',
  '- 结构扁平：用 Tailwind 类替代多层 wrapper，目标 3 层、不超 4 层。',
  '- 标签全部成对闭合、末尾完整——这是最常见的失败，写完自检每个 <div>/<section>/<ul>/<li>/<table>。'
].join('\n')

export const CANVAS_CONSTRAINTS = [
  '## 画布与技法（16:9 / 1600×900）',
  `- 版式细节（密度、pattern、高度预算、防重叠）在 skill ${LAYOUT_SKILL_NAME}，写前先读：${formatSkillUsageRequirement(LAYOUT_SKILL_NAME)}`,
  '- 根容器不带默认 padding，用 Tailwind grid/flex；背景可铺满 1600×900，正文四边留 24-40px。',
  '- 已有内容在画布上占稳、对齐、按构图需要合理伸展，让版面协调——目标是平衡，不是把每寸塞满。`flex flex-col h-full` + `justify-between`/`justify-evenly`/`flex-1`、图表 `h-[Npx]`、卡片 `h-full` 是可选技法，按构图取用、不是默认处方；不为填满而新增卡片/注释/第二行模块，顶部和底部不留意外大空带，也不超出 900px。',
  '- 密度由内容决定：氛围/叙事页低密度，多数页中密度，表格/多指标对比才高密度；内容够了就不扩展，只压缩、归并、换表达。',
  '- 内容过多先总结再布局：如果标题 + 图表/表格/列表/卡片会超出 900px 或显得过密，必须先重写信息架构（主旨、分组、优先级、紧凑表达）再写 HTML；不要靠缩小字号、增加卡片、堆更多行或把所有事实等权上屏来硬塞。',
  '- 图表高度：注释里写 `@ppt-chart-height=N`，且 N 与 class 的 `h-[Npx]` 一致（写 560 就配 h-[560px]）。',
  '- 字号：正文最小 text-base(16px)，标题最大 text-5xl(48px)；空间紧时调密度与层级，用 grid/flex 解决，不用 100vw/100vh/w-screen/h-screen/iframe。'
].join('\n')

export const LAYOUT_COLLISION_RULES = [
  '## 布局防重叠',
  `- Full collision guide is in the skill ${LAYOUT_SKILL_NAME}. ${formatSkillUsageRequirement(LAYOUT_SKILL_NAME)}`,
  '- 正文内容用 grid/flex 正常文档流。absolute/fixed 仅用于背景装饰、连接线。正文卡片不得用 absolute/fixed。'
].join('\n')

export const LAYOUT_DELIVERY_GUARD = [
  '## 交付前版面检查（防半屏内容 / 大空场）',
  '- 形服务于魂：先确认页面有一个 3 秒可读的主旨，再检查这个主旨有没有对应的承重结构（大图表、hero 数字、矩阵、时间线、对比区或结论区）。只有文案存在、结构不承重，也算没完成。',
  '- 非 cover / quote / divider / 纯氛围页，正文不能全部停在上半屏：如果标题 + 主要模块只占画布上半部，下面只有 footer/source 或大片空底，这是结构失败，必须重选 pattern 或重新分配中部/下部 zone。',
  '- 低密度可以留白，但留白必须围绕一个足够大的焦点形成 framing；不要把几个小卡片、小图表排在顶部，然后把下半屏留成未设计的空白。',
  '- 视觉重心可以略高于几何中心，让投影/大屏观看更舒服；这不是把正文堆到上方。主体应落在上中部并向中部/下部形成完整结构。',
  '- 不要用一个 `flex-1` 巨大空卡片假装填充。卡片内部如果只有一小段文字，卡片应收缩；剩余空间交给主图表、时间线、矩阵、hero 数字、证据组或有效注释。',
  '- 主图表页不能让主 chart 只有 220–280px 且没有其他主视觉承重；如果 chart 是主要证据，优先给 380–560px 的主图区，或改成 chart-annotated / trend-exhibit / full-height two-zone。',
  '- 写入前做一次 mental bounding-box check：忽略背景装饰和 footer/source 后，主要内容应在画布中形成清楚的上/中/下或左/右结构；若可见主体低于约 60% 高度且没有强 hero 焦点，先重排再写。'
].join('\n')

export const FRONTEND_CAPABILITIES = [
  '## Runtime capability contract',
  'Available in every /<pageId>.html:',
  '- Tailwind CSS, anime.js, Chart.js, ppt-runtime.js, and KaTeX are already loaded from local assets.',
  '- Do not add CDN links, remote scripts, duplicate runtime tags, or iframe content.',
  '',
  'Fonts:',
  '- Use var(--ppt-title-font) for titles and var(--ppt-body-font) for body text.',
  '- Do not declare @font-face or import external font/icon libraries.',
  '',
  'Charts:',
  `- Chart details are in the skill ${CHART_SKILL_NAME}. ${formatSkillUsageRequirement(CHART_SKILL_NAME)}`,
  '- Wrap in document.addEventListener("DOMContentLoaded", function() { PPT.createChart(...) }). Do not use ppt-ready/ppt-rendered or other custom events.',
  '',
  'Animations:',
  `- Animation rules are in the skill ${DATA_ANIM_SKILL_NAME}. ${formatSkillUsageRequirement(DATA_ANIM_SKILL_NAME)}`,
  '',
  'Validation:',
  '- Use \\( \\) or $$ $$ for math; do not use single-dollar inline math.'
].join('\n')

export const CONTENT_WRITING_RULES = [
  '## 内容与视觉',
  '- 用真实文案与数据填模块；少用 emoji/贴纸装饰。',
  '- 布局靠 grid/flex 文档流：items-center/justify-* 的父节点配 flex 或 grid，正文卡片留在文档流里，absolute/fixed 只给背景装饰与连接线。',
  '- 装饰块保持扁平（单层绝对定位 div / 几个并列 div / 一个 SVG）。',
  '- 模块占稳各自位置、彼此对齐，形成均衡版面与干净间距——不堆在顶部，也不塞到溢出。'
].join('\n')

export const STYLE_FIDELITY_RULES = [
  '## 风格一致性闸门',
  '- 当前风格规则是视觉语言的唯一来源：颜色、字体气质、圆角/线条/阴影、背景、装饰符号、图表质感都必须从当前 style 与 design contract 派生。',
  '- layout skill/catalog 只决定结构、阅读路径和高度预算，不提供新的视觉风格；不要因为选择了某个 layout pattern 就改成另一套审美。',
  '- 单页生成也必须像整套 deck 一样遵守当前 style。可以变化构图和节奏，但不能自创无关配色、组件语言、插画/装饰风格或字体气质。',
  '- 写入前做一次 style check：如果把当前 style 名字遮住，页面仍应能从配色、形状、字体和装饰语言上看出属于同一套演示。'
].join('\n')

export function resolveContextStylePrompt(context: SessionDeckGenerationContext): {
  presetLabel: string
  presetId: string
  stylePrompt: string
} {
  const presetLabel = context.styleName?.trim() || context.styleKey?.trim() || context.styleId || 'Session style'
  const presetId = context.styleKey?.trim() || context.styleId || 'session-style'
  const stylePrompt = context.styleSkillPrompt?.trim()
  if (!stylePrompt) {
    throw new Error('Session style snapshot is missing styleSkillPrompt.')
  }
  return {
    presetLabel,
    presetId,
    stylePrompt
  }
}

export function buildOutlinePageList(context: SessionDeckGenerationContext): string {
  return context.outlineItems
    .map((item, i) => {
      const layoutIntent = item.layoutIntent
        ? `\n   ${formatLayoutIntentPrompt(item.layoutIntent).replace(/\n/g, '\n   ')}`
        : ''
      return `${i + 1}. ${item.title}\n   Content points: ${item.contentOutline}${layoutIntent}`
    })
    .join('\n')
}

export function formatDesignContract(contract?: DesignContract): string {
  if (!contract) return 'Not provided. Keep pages visually consistent according to the style rules.'
  const lines = [
    '- Treat this as a flexible visual contract, not a fixed template. Preserve coherence while varying composition, density, and emphasis per slide.',
    `- Visual theme: ${contract.theme}`,
    `- Canvas background: ${contract.background}`,
    `- Palette: ${contract.palette.join(', ')}`,
    `- Title style: ${contract.titleStyle}`,
    `- Layout motif: ${contract.layoutMotif}`,
    '- Use the layout motif as the deck-level layout language. Keep pages varied within this motif instead of repeating one template.',
    `- Chart style: ${contract.chartStyle}`,
    `- Shape language: ${contract.shapeLanguage}`
  ]
  lines.push(
    `- Title font: ${contract.titleFont} (use var(--ppt-title-font) for titles)`,
    `- Body font: ${contract.bodyFont} (use var(--ppt-body-font) for body)`
  )
  return lines.join('\n')
}
