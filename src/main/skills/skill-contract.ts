import { requireSlideSize, type SlideSizePreset } from '@shared/slide-size'

export const PRODUCT_SKILLS_ROUTE = '/.ohmyppt-skills/'
export const SYSTEM_SKILLS_SOURCE_PATH = '/system/'

export const LAYOUT_SKILL_NAME = 'oh-my-ppt-layout'
export const VERTICAL_9_16_LAYOUT_SKILL_NAME = 'vertical-9-16-layout-skill'
export const STANDARD_4_3_LAYOUT_SKILL_NAME = 'standard-4-3-layout-skill'
export const SQUARE_1_1_LAYOUT_SKILL_NAME = 'square-1-1-layout-skill'
export const VERTICAL_3_4_LAYOUT_SKILL_NAME = 'vertical-3-4-layout-skill'
export const RED_LAYOUT_SKILL_NAME = 'red-layout-skill'
export const DATA_ANIM_SKILL_NAME = 'oh-my-ppt-data-anim'
export const CHART_SKILL_NAME = 'oh-my-ppt-chart'
export const SOURCE_READING_SKILL_NAME = 'oh-my-ppt-source-reading'

export const REQUIRED_PRODUCT_SKILL_NAMES = [
  LAYOUT_SKILL_NAME,
  VERTICAL_9_16_LAYOUT_SKILL_NAME,
  STANDARD_4_3_LAYOUT_SKILL_NAME,
  SQUARE_1_1_LAYOUT_SKILL_NAME,
  VERTICAL_3_4_LAYOUT_SKILL_NAME,
  RED_LAYOUT_SKILL_NAME,
  DATA_ANIM_SKILL_NAME,
  CHART_SKILL_NAME,
  SOURCE_READING_SKILL_NAME,
] as const

export type RequiredProductSkillName = (typeof REQUIRED_PRODUCT_SKILL_NAMES)[number]

export function formatSkillUsageRequirement(skillName: RequiredProductSkillName): string {
  return `Use the DeepAgents Skills System entry for ${skillName}; read that skill's SKILL.md before applying this capability.`
}

export function resolveLayoutSkillName(input: SlideSizePreset): RequiredProductSkillName {
  const slideSize = requireSlideSize(input)
  switch (slideSize.id) {
    case 'wide-16-9':
      return LAYOUT_SKILL_NAME
    case 'vertical-9-16':
      return VERTICAL_9_16_LAYOUT_SKILL_NAME
    case 'standard-4-3':
      return STANDARD_4_3_LAYOUT_SKILL_NAME
    case 'square-1-1':
      return SQUARE_1_1_LAYOUT_SKILL_NAME
    case 'vertical-3-4':
      return VERTICAL_3_4_LAYOUT_SKILL_NAME
    case 'xiaohongshu-note':
      return RED_LAYOUT_SKILL_NAME
  }
}

export function getRequiredProductSkillNamesForSlideSize(
  input: SlideSizePreset
): readonly RequiredProductSkillName[] {
  return [
    resolveLayoutSkillName(input),
    DATA_ANIM_SKILL_NAME,
    CHART_SKILL_NAME,
    SOURCE_READING_SKILL_NAME,
  ]
}
