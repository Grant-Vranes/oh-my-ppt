import { CONTENT_LANGUAGE_RULES, SOURCE_MATERIAL_PLANNING_RULES } from './shared'
import type { AvailableFont } from '../../../presentation/fonts/font-registry'
import { requireSlideSize, type SlideSizePreset } from '@shared/slide-size'
import { createPromptCatalog } from '../catalog'

import planningSystemTemplate from '../templates/planning/system.md?raw'
import designContractSystemTemplate from '../templates/planning/design-contract-system.md?raw'

type PlanningSystemTemplateVars = {
  system: {
    contentLanguageRules: string
    sourceMaterialPlanningRules: string
    totalPages: number
  }
}

const planningPromptCatalog = createPromptCatalog<PlanningSystemTemplateVars>({
  system: planningSystemTemplate.trimEnd()
})

type DesignContractSystemTemplateVars = {
  system: {
    availableFonts: string
    fontInstruction: string
    languageHint: string
    slideHeight: number
    slideSizeId: string
    slideWidth: number
    styleSkill: string
  }
}

const designContractPromptCatalog = createPromptCatalog<DesignContractSystemTemplateVars>({
  system: designContractSystemTemplate.trimEnd()
})

export function buildPlanningSystemPrompt(totalPages: number = 0): string {
  return planningPromptCatalog.render('system', {
    contentLanguageRules: CONTENT_LANGUAGE_RULES,
    sourceMaterialPlanningRules: SOURCE_MATERIAL_PLANNING_RULES,
    totalPages
  })
}

export function buildDesignContractSystemPrompt(args: {
  styleSkill?: string | null
  availableFonts?: AvailableFont[]
  requestedFontPair?: { titleFont: string; bodyFont: string } | null
  languageHint?: string | null
  slideSize: SlideSizePreset
}): string {
  const styleSkill = args.styleSkill
  const availableFonts = args.availableFonts || []
  const requestedFontPair = args.requestedFontPair || null
  const slideSize = requireSlideSize(args.slideSize)
  const fontInstruction = requestedFontPair
    ? [
        '- titleFont and bodyFont are fixed by the user selection. Copy them exactly:',
        `  - titleFont: ${requestedFontPair.titleFont}`,
        `  - bodyFont: ${requestedFontPair.bodyFont}`
      ].join('\n')
    : [
        '- titleFont: choose one exact family from availableFonts whose role includes "title".',
        '- bodyFont: choose one exact family from availableFonts whose role includes "body".',
        '- Both titleFont and bodyFont must support the main writing system implied by languageHint.',
        '- If using a display/handwriting font for titleFont, choose a highly readable bodyFont.'
      ].join('\n')
  return designContractPromptCatalog.render('system', {
    availableFonts: JSON.stringify(availableFonts),
    fontInstruction,
    languageHint: args.languageHint || 'unknown',
    slideHeight: slideSize.height,
    slideSizeId: slideSize.id,
    slideWidth: slideSize.width,
    styleSkill: styleSkill || '(No style preset specified. Choose a coherent restrained visual direction.)'
  })
}
