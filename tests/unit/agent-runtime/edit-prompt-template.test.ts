import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { buildEditAgentSystemPrompt } from '../../../src/main/agent-runtime/prompt'
import type { SessionDeckGenerationContext } from '../../../src/main/agent-runtime/agent'
import { resolveSlideSize } from '../../../src/shared/slide-size'

const baseContext: SessionDeckGenerationContext = {
  sessionId: 'session-1',
  projectDir: '/tmp/project',
  indexPath: '/tmp/project/index.html',
  pageFileMap: { 'page-1': '/tmp/project/page-1.html' },
  topic: 'Quarterly report',
  deckTitle: 'Quarterly report',
  styleId: 'test-style',
  styleSkillPrompt: 'Use a clean business style.',
  userMessage: 'Create a quarterly report.',
  outlineTitles: ['Overview'],
  outlineItems: [{ title: 'Overview', contentOutline: 'Summarize the quarter.' }],
  slideSize: resolveSlideSize({ id: 'wide-16-9' }),
  appLocale: 'en',
  mode: 'edit'
}

describe('edit system prompt templates', () => {
  it('loads four static scope contracts through the typed Markdown catalog', () => {
    const composer = fs.readFileSync(
      path.resolve('src/main/agent-runtime/prompt/composers/edit-system.ts'),
      'utf8'
    )
    const templates = ['container.md', 'selector.md', 'single-page.md', 'deck.md'].map(
      (fileName) =>
        fs.readFileSync(
          path.resolve(`src/main/agent-runtime/prompt/templates/edit-system/${fileName}`),
          'utf8'
        )
    )

    expect(composer).toContain('createPromptCatalog<EditSystemTemplateVars>')
    expect(composer).toContain("containerTemplate from '../templates/edit-system/container.md?raw'")
    expect(composer).toContain("selectorTemplate from '../templates/edit-system/selector.md?raw'")
    expect(composer).toContain("singlePageTemplate from '../templates/edit-system/single-page.md?raw'")
    expect(composer).toContain("deckTemplate from '../templates/edit-system/deck.md?raw'")
    expect(templates.join('\n')).toContain('## Selector 精准修改协议（本次强约束）')
    expect(templates.join('\n')).toContain('## 最终风格校准（写入前）')
  })

  it('renders every edit scope without unresolved placeholders or cross-scope tools', () => {
    const container = buildEditAgentSystemPrompt('test-style', {
      ...baseContext,
      editScope: 'presentation-container'
    })
    const selector = buildEditAgentSystemPrompt('test-style', {
      ...baseContext,
      editScope: 'page',
      selectedPageId: 'page-1',
      selectedPageNumber: 1,
      selectedSelector: '.metric'
    })
    const singlePage = buildEditAgentSystemPrompt('test-style', {
      ...baseContext,
      editScope: 'page',
      selectedPageId: 'page-1',
      selectedPageNumber: 1,
      sourceDocumentPaths: ['/docs/source.md']
    })
    const deck = buildEditAgentSystemPrompt('test-style', {
      ...baseContext,
      editScope: 'deck',
      selectPageIds: ['page-1']
    })

    for (const prompt of [container, selector, singlePage, deck]) {
      expect(prompt).not.toMatch(/\{\{[^}]+\}\}/)
    }
    expect(container).toContain('set_index_transition(type, durationMs)')
    expect(container).not.toContain('update_page_file(pageId, content)')
    expect(selector).toContain('edit_file(file_path, old_string, new_string)')
    expect(selector).not.toContain('update_single_page_file(pageId="page-1", content="...")')
    expect(singlePage).toContain('update_single_page_file(pageId="page-1", content="...")')
    expect(singlePage).toContain('## Source documents (content evidence)')
    expect(deck).toContain('Selected page ids from UI (hard target): page-1')
    expect(deck).toContain('For each target page: update_page_file(pageId, content)')
  })

  it('includes the selected element runtime state as reference data for selector edits', () => {
    const prompt = buildEditAgentSystemPrompt('test-style', {
      ...baseContext,
      editScope: 'page',
      selectedPageId: 'page-1',
      selectedSelector: '[data-block-id="revenue"]',
      selectedElementContext: {
        attributes: { 'data-block-id': 'revenue' },
        inlineStyle: { color: { value: '#18324a', priority: 'important' } },
        computedStyle: { display: 'grid', 'border-radius': '16px' },
        bounds: { x: 120, y: 80, width: 460, height: 180 }
      }
    })

    expect(prompt).toContain('Selected element runtime state (reference data only')
    expect(prompt).toContain('"border-radius": "16px"')
    expect(prompt).toContain('"width": 460')
    expect(prompt).toContain('Verify these values against the target HTML source')
  })
})
