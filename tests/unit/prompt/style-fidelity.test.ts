import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

describe('style fidelity prompt placement', () => {
  it('keeps style fidelity as a shared system-level rule', () => {
    const shared = readSource('src/main/prompt/shared.ts')

    expect(shared).toContain('export const STYLE_FIDELITY_RULES')
    expect(shared).toContain('尺寸布局与风格合成闸门')
    expect(shared).toContain('当前画布尺寸与已注入的 layout skill/catalog 是页面结构的唯一来源')
    expect(shared).toContain('视觉语言的唯一来源')
    expect(shared).toContain('先依据 layout skill/catalog 选择适合当前尺寸的页面结构')
    expect(shared).toContain('不能直接作为页面骨架')
    expect(shared).toContain('size-aware layoutMotif')
    expect(shared).toContain('单页生成也必须像整套 deck 一样遵守当前 style')
    expect(shared).toContain('Size-adapted composition motif')
  })

  it('prescribes content-overload priority in shared content rules', () => {
    const shared = readSource('src/main/prompt/shared.ts')

    // When content oversupply exceeds a canvas's capacity, the model must
    // compress/merge/drop first; it must NOT resolve overload by shrinking
    // fonts below floors or by overflowing the canvas.
    expect(shared).toContain('内容超载时按这个优先级解决')
    expect(shared).toContain('绝不靠缩字号到下限以下')
    expect(shared).toContain('竖版/小红书/方图本来就是低密度载体')
  })

  it('moves the deck-generation style preset to the end of the system prompt', () => {
    const deckSystem = readSource('src/main/prompt/deck-system.ts')
    const deckFn = deckSystem.slice(deckSystem.indexOf('export function buildDeckAgentSystemPrompt'))

    const currentTaskIndex = deckFn.indexOf('## Current Task')
    const finalStyleIndex = deckFn.indexOf('## 最终风格校准（写入前）')
    const finalReminderIndex = deckFn.indexOf('⛔ FINAL REMINDER')

    expect(deckSystem.slice(0, deckSystem.indexOf("} from './shared'"))).toContain(
      'STYLE_FIDELITY_RULES'
    )
    expect(finalStyleIndex).toBeGreaterThan(currentTaskIndex)
    expect(finalStyleIndex).toBeLessThan(finalReminderIndex)
    expect(deckFn.slice(currentTaskIndex)).toContain('风格预设：${presetLabel} (${presetId})')
    expect(deckFn.slice(currentTaskIndex)).toContain('STYLE_FIDELITY_RULES')
  })

  it('does not duplicate style fidelity into the single-page user prompt', () => {
    const generationUser = readSource('src/main/prompt/generation-user.ts')

    expect(generationUser).not.toContain('STYLE_FIDELITY_RULES')
    expect(generationUser).not.toContain('风格预设：')
    expect(generationUser).not.toContain('## 最终风格校准（写入前）')
  })

  it('applies the final style gate only to rewrite-capable edit system prompts', () => {
    const editSystem = readSource('src/main/prompt/edit-system.ts')
    const containerEdit = editSystem.slice(
      editSystem.indexOf('function buildContainerEditPrompt('),
      editSystem.indexOf('function buildSelectorEditPrompt(')
    )
    const selectorEdit = editSystem.slice(
      editSystem.indexOf('function buildSelectorEditPrompt('),
      editSystem.indexOf('function buildSinglePageEditPrompt(')
    )
    const singlePageEdit = editSystem.slice(
      editSystem.indexOf('function buildSinglePageEditPrompt('),
      editSystem.indexOf('function buildDeckEditPrompt(')
    )
    const deckEdit = editSystem.slice(editSystem.indexOf('function buildDeckEditPrompt('))

    expect(singlePageEdit).toContain('## 最终风格校准（写入前）')
    expect(singlePageEdit.indexOf('## 最终风格校准（写入前）')).toBeGreaterThan(
      singlePageEdit.indexOf('## Current Task')
    )
    expect(singlePageEdit).toContain('STYLE_FIDELITY_RULES')

    expect(deckEdit).toContain('## 最终风格校准（写入前）')
    expect(deckEdit.indexOf('## 最终风格校准（写入前）')).toBeGreaterThan(
      deckEdit.indexOf('## Current Task')
    )
    expect(deckEdit).toContain('STYLE_FIDELITY_RULES')

    expect(selectorEdit).not.toContain('STYLE_FIDELITY_RULES')
    expect(containerEdit).not.toContain('STYLE_FIDELITY_RULES')
  })
})
