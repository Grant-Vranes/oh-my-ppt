/**
 * @vitest-environment happy-dom
 */
import { createEditor } from 'slate'
import { describe, expect, it } from 'vitest'
import { applyColorMark } from '../../../src/renderer/src/components/ui/RichTextBox'

function createRichTextEditor(text: string) {
  const editor = createEditor()
  editor.children = [{ type: 'paragraph', children: [{ text }] }]
  editor.selection = null
  return editor
}

describe('applyColorMark', () => {
  it('restores an expanded selection cached before the color input receives focus', () => {
    const editor = createRichTextEditor('Hello')
    const value = applyColorMark(editor, '#ff0000', {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 4 }
    })

    expect(value).toEqual({
      html: 'H<span style="color: #ff0000">ell</span>o',
      text: 'Hello'
    })
  })

  it('applies color to the full text when the native picker has cleared the selection', () => {
    const editor = createRichTextEditor('Hello')

    expect(applyColorMark(editor, '#00aa00')).toEqual({
      html: '<span style="color: #00aa00">Hello</span>',
      text: 'Hello'
    })
  })

  it('ignores invalid color values without changing the editor content', () => {
    const editor = createRichTextEditor('Hello')

    expect(applyColorMark(editor, 'not-a-color')).toBeNull()
    expect(editor.children).toEqual([{ type: 'paragraph', children: [{ text: 'Hello' }] }])
  })
})
