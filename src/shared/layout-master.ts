import { LAYOUT_INTENTS, normalizeLayoutIntent, type LayoutIntent } from './layout-intent'

export const MASTER_LAYOUTS_FILENAME = 'layouts.json'
export const MASTER_LAYOUTS_RELATIVE_PATH = `master/${MASTER_LAYOUTS_FILENAME}`
export const MASTER_LAYOUTS_VERSION = 1 as const

export const LAYOUT_MASTER_CATEGORIES = [
  'cover',
  'content',
  'comparison',
  'data',
  'narrative',
  'closing'
] as const

export type LayoutMasterCategory = (typeof LAYOUT_MASTER_CATEGORIES)[number]

export type LayoutMasterTemplate = {
  id: string
  intent: LayoutIntent
  category: LayoutMasterCategory
  name: string
  nameZh: string
  description: string
  descriptionZh: string
  preview:
    | 'title-center'
    | 'title-split'
    | 'editorial'
    | 'two-column'
    | 'metric-grid'
    | 'chart-side'
    | 'versus'
    | 'timeline'
    | 'process'
    | 'quote'
    | 'image-focus'
    | 'closing'
  prompt: string
}

export type SessionLayoutLibrary = {
  version: typeof MASTER_LAYOUTS_VERSION
  mappings: Record<LayoutIntent, string>
}

export type SessionLayoutLibraryStatus = {
  library: SessionLayoutLibrary
  exists: boolean
  revision: string
}

const LAYOUT_MASTER_TEMPLATES: LayoutMasterTemplate[] = [
  {
    id: 'cover-statement',
    intent: 'cover',
    category: 'cover',
    name: 'Statement cover',
    nameZh: '主张式封面',
    description: 'A single message with restrained supporting detail.',
    descriptionZh: '单一核心主张，配合克制的辅助信息。',
    preview: 'title-center',
    prompt:
      'Use a single dominant title or claim with generous negative space. Keep supporting information small and grouped; give one visual or decorative anchor a clear secondary role.'
  },
  {
    id: 'cover-split',
    intent: 'cover',
    category: 'cover',
    name: 'Split cover',
    nameZh: '左右分屏封面',
    description: 'A clear title block balanced by one hero visual.',
    descriptionZh: '清晰标题区与单个主视觉平衡构成。',
    preview: 'title-split',
    prompt:
      'Use an asymmetric split composition: title and context occupy one side, while one hero visual or visual field occupies the other. Keep the title block compact and make the split deliberate.'
  },
  {
    id: 'content-editorial',
    intent: 'concept',
    category: 'content',
    name: 'Editorial content',
    nameZh: '编辑式内容页',
    description: 'A title-led narrative with one clear reading path.',
    descriptionZh: '标题主导的叙事内容，阅读路径明确。',
    preview: 'editorial',
    prompt:
      'Use an editorial composition: establish a strong title zone, one primary idea or visual anchor, and a small number of supporting modules. Preserve a clear top-to-bottom or left-to-right reading path.'
  },
  {
    id: 'content-two-column',
    intent: 'concept',
    category: 'content',
    name: 'Two-column narrative',
    nameZh: '双栏叙事页',
    description: 'Two related content groups with intentional imbalance.',
    descriptionZh: '两个相关内容组，以有意的不对称形成层级。',
    preview: 'two-column',
    prompt:
      'Use two related columns with intentional hierarchy rather than equal card stacks. Give one column a primary role and use the other for explanation, evidence, or a supporting visual.'
  },
  {
    id: 'data-metrics',
    intent: 'data-focus',
    category: 'data',
    name: 'Metric focus',
    nameZh: '核心指标页',
    description: 'A key number or chart supported by concise evidence.',
    descriptionZh: '核心数字或图表主导，配合简洁证据。',
    preview: 'metric-grid',
    prompt:
      'Make one metric, trend, or chart the dominant visual anchor. Support it with no more than three concise evidence modules and make numeric hierarchy immediately scannable.'
  },
  {
    id: 'data-chart-side',
    intent: 'data-focus',
    category: 'data',
    name: 'Chart with takeaway',
    nameZh: '图表结论页',
    description: 'A chart-led area paired with a decisive takeaway.',
    descriptionZh: '图表主区域配合明确结论。',
    preview: 'chart-side',
    prompt:
      'Allocate a substantial chart or data visualization area and pair it with one concise takeaway panel. Let the chart carry the evidence and keep surrounding labels restrained.'
  },
  {
    id: 'comparison-versus',
    intent: 'comparison',
    category: 'comparison',
    name: 'Versus comparison',
    nameZh: '正反对比',
    description: 'Two alternatives aligned against shared criteria.',
    descriptionZh: '两个方案围绕共用维度对齐比较。',
    preview: 'versus',
    prompt:
      'Use two clearly separated alternatives aligned against the same comparison criteria. Keep their visual weight balanced, make differences explicit, and reserve a short conclusion area.'
  },
  {
    id: 'comparison-matrix',
    intent: 'comparison',
    category: 'comparison',
    name: 'Comparison matrix',
    nameZh: '矩阵对比',
    description: 'A compact shared-criteria comparison with one recommendation.',
    descriptionZh: '围绕共用维度紧凑比较，并给出一个建议。',
    preview: 'two-column',
    prompt:
      'Use a compact comparison matrix or aligned criterion rows. Surface the most meaningful distinction visually, then close with one recommendation or implication rather than repeating every point.'
  },
  {
    id: 'timeline-progress',
    intent: 'timeline',
    category: 'narrative',
    name: 'Progress timeline',
    nameZh: '进程时间线',
    description: 'A sequence of stages with one highlighted moment.',
    descriptionZh: '阶段推进的时间线，突出一个关键节点。',
    preview: 'timeline',
    prompt:
      'Use a clear chronological progression with a limited number of stages. Emphasize the most important moment or transition and keep supporting detail attached to its stage.'
  },
  {
    id: 'timeline-milestones',
    intent: 'timeline',
    category: 'narrative',
    name: 'Milestone story',
    nameZh: '里程碑叙事',
    description: 'A milestone sequence with a strong present or future state.',
    descriptionZh: '里程碑序列，突出当前或未来状态。',
    preview: 'timeline',
    prompt:
      'Use a milestone sequence that leads clearly to a highlighted current, decision, or future state. Give the highlighted destination more space than the historical steps.'
  },
  {
    id: 'concept-hierarchy',
    intent: 'concept',
    category: 'content',
    name: 'Concept hierarchy',
    nameZh: '概念层级',
    description: 'One central idea and grouped supporting concepts.',
    descriptionZh: '一个中心概念，搭配分组的支撑信息。',
    preview: 'process',
    prompt:
      'Use one central concept or proposition with a small number of grouped supporting concepts. Make the hierarchy visible through scale and proximity, not a dense network of arrows.'
  },
  {
    id: 'process-flow',
    intent: 'process',
    category: 'narrative',
    name: 'Flow process',
    nameZh: '流程机制',
    description: 'A directional flow with visible cause and effect.',
    descriptionZh: '方向明确的流程，清楚表达因果关系。',
    preview: 'process',
    prompt:
      'Use a directional process or mechanism with visible handoffs between steps. Keep each stage concise and make the causal or operational flow legible at a glance.'
  },
  {
    id: 'process-cycle',
    intent: 'process',
    category: 'narrative',
    name: 'Cycle process',
    nameZh: '循环机制',
    description: 'A recurring system with a deliberate feedback loop.',
    descriptionZh: '循环系统，明确表现反馈关系。',
    preview: 'process',
    prompt:
      'Use a compact recurring cycle when the mechanism includes feedback or iteration. Make the loop legible, but keep labels and step count restrained so the process reads in one glance.'
  },
  {
    id: 'summary-takeaway',
    intent: 'summary',
    category: 'closing',
    name: 'Key takeaway',
    nameZh: '结论总结',
    description: 'One conclusion supported by compact proof points.',
    descriptionZh: '一个结论，配合紧凑的支撑证据。',
    preview: 'closing',
    prompt:
      'Lead with one decisive conclusion. Use a compact set of supporting proof points or next actions beneath it, with the conclusion visually stronger than every support module.'
  },
  {
    id: 'summary-evidence',
    intent: 'summary',
    category: 'closing',
    name: 'Evidence recap',
    nameZh: '证据回顾',
    description: 'A concise conclusion supported by a few memorable facts.',
    descriptionZh: '简洁结论配合少量关键事实回顾。',
    preview: 'closing',
    prompt:
      'Use a concise conclusion with two to four memorable proof points. Let evidence appear as a compact recap, leaving enough negative space for the conclusion to remain dominant.'
  },
  {
    id: 'quote-focus',
    intent: 'quote',
    category: 'content',
    name: 'Quote focus',
    nameZh: '引言聚焦',
    description: 'A statement-led composition with minimal context.',
    descriptionZh: '语句主导的构图，只保留最少必要背景。',
    preview: 'quote',
    prompt:
      'Make the statement the visual anchor. Use an expressive type hierarchy and only minimal attribution or supporting context; do not dilute it with ordinary card grids.'
  },
  {
    id: 'quote-side-note',
    intent: 'quote',
    category: 'content',
    name: 'Quote with context',
    nameZh: '引言与注释',
    description: 'A strong statement paired with a compact contextual note.',
    descriptionZh: '重点语句配合紧凑的背景说明。',
    preview: 'quote',
    prompt:
      'Use a large statement zone paired with one compact context, source, or implication note. Maintain the statement as the visual anchor and keep the secondary note clearly subordinate.'
  },
  {
    id: 'image-spotlight',
    intent: 'image-focus',
    category: 'content',
    name: 'Image spotlight',
    nameZh: '视觉聚焦',
    description: 'A dominant visual field with concise supporting copy.',
    descriptionZh: '主视觉区域占主导，文字简洁辅助。',
    preview: 'image-focus',
    prompt:
      'Give one image, product visual, or illustrated field dominant space. Keep text to a concise title and short supporting copy, positioned to complement rather than compete with the visual.'
  },
  {
    id: 'image-caption',
    intent: 'image-focus',
    category: 'content',
    name: 'Visual caption',
    nameZh: '图片注释页',
    description: 'A visual field supported by a structured caption block.',
    descriptionZh: '视觉主区域配合有层级的说明文字。',
    preview: 'image-focus',
    prompt:
      'Use a dominant visual field with a structured caption or annotation block. The supporting text should interpret the visual, not compete with it or turn into a generic card grid.'
  }
]

const DEFAULT_LAYOUT_MAPPINGS: Record<LayoutIntent, string> = {
  cover: 'cover-statement',
  'data-focus': 'data-metrics',
  comparison: 'comparison-versus',
  timeline: 'timeline-progress',
  concept: 'content-editorial',
  process: 'process-flow',
  summary: 'summary-takeaway',
  quote: 'quote-focus',
  'image-focus': 'image-spotlight'
}

const TEMPLATE_BY_ID = new Map(LAYOUT_MASTER_TEMPLATES.map((template) => [template.id, template]))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const getLayoutMasterTemplates = (): LayoutMasterTemplate[] =>
  LAYOUT_MASTER_TEMPLATES.map((template) => ({ ...template }))

export const getDefaultLayoutMasterMappings = (): Record<LayoutIntent, string> => ({
  ...DEFAULT_LAYOUT_MAPPINGS
})

export const getLayoutMasterTemplate = (value: unknown): LayoutMasterTemplate | null => {
  const id = typeof value === 'string' ? value.trim() : ''
  const template = TEMPLATE_BY_ID.get(id)
  return template ? { ...template } : null
}

export const buildDefaultSessionLayoutLibrary = (): SessionLayoutLibrary => ({
  version: MASTER_LAYOUTS_VERSION,
  mappings: getDefaultLayoutMasterMappings()
})

export const normalizeSessionLayoutLibrary = (value: unknown): SessionLayoutLibrary => {
  const input = isRecord(value) ? value : {}
  const rawMappings = isRecord(input.mappings) ? input.mappings : {}
  const mappings = getDefaultLayoutMasterMappings()
  for (const intent of LAYOUT_INTENTS) {
    const candidate = rawMappings[intent]
    const template = getLayoutMasterTemplate(candidate)
    if (template && template.intent === intent) mappings[intent] = template.id
  }
  return { version: MASTER_LAYOUTS_VERSION, mappings }
}

export const isValidSessionLayoutLibrary = (value: unknown): value is SessionLayoutLibrary => {
  if (!isRecord(value) || value.version !== MASTER_LAYOUTS_VERSION) return false
  const mappings = value.mappings
  if (!isRecord(mappings)) return false
  return LAYOUT_INTENTS.every((intent) => {
    const template = getLayoutMasterTemplate(mappings[intent])
    return template?.intent === intent
  })
}

export const resolveLayoutMasterTemplate = (
  library: unknown,
  intent: LayoutIntent | undefined
): LayoutMasterTemplate => {
  const normalizedIntent = normalizeLayoutIntent(intent)
  const normalizedLibrary = normalizeSessionLayoutLibrary(library)
  return (
    getLayoutMasterTemplate(normalizedLibrary.mappings[normalizedIntent]) ||
    getLayoutMasterTemplate(DEFAULT_LAYOUT_MAPPINGS[normalizedIntent]) ||
    getLayoutMasterTemplates()[0]
  )
}

export const formatLayoutMasterPrompt = (template: LayoutMasterTemplate): string =>
  [
    `Selected layout master: ${template.name} (${template.id}).`,
    `Composition contract: ${template.prompt}`,
    'Treat this as a flexible information architecture, not a pixel-for-pixel template. Keep the current style contract authoritative for visual language, and vary imagery, decoration, emphasis, and local composition to fit the content.'
  ].join('\n')
