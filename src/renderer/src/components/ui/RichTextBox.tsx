import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Italic, Underline } from 'lucide-react'
import {
  createEditor,
  Editor,
  Element as SlateElement,
  Node as SlateNode,
  Range,
  Text,
  Transforms,
  type BaseSelection,
  type Descendant
} from 'slate'
import { withHistory } from 'slate-history'
import {
  Editable,
  ReactEditor,
  Slate,
  useSlate,
  useSlateSelector,
  withReact,
  type RenderElementProps,
  type RenderLeafProps
} from 'slate-react'
import { cn } from '@renderer/lib/utils'

export type RichTextValue = { html: string; text: string }
type Mark = 'bold' | 'italic' | 'underline'

type RichTextNode = {
  type: 'paragraph' | 'span' | 'link'
  style?: string
  className?: string
  blockId?: string
  href?: string
  children: Array<RichTextLeaf | RichTextNode>
}

type RichTextLeaf = {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  fontSize?: string
  style?: string
  className?: string
  blockId?: string
}

declare module 'slate' {
  interface CustomTypes {
    Editor: ReactEditor
    Element: RichTextNode
    Text: RichTextLeaf
  }
}

const commandButtons = [
  { mark: 'bold', label: 'Bold', icon: Bold },
  { mark: 'italic', label: 'Italic', icon: Italic },
  { mark: 'underline', label: 'Underline', icon: Underline }
] as const

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const escapeAttribute = (value: string): string => escapeHtml(value).replace(/'/g, '&#39;')

const parsePixelSize = (value: string | undefined): number | undefined => {
  const size = Number(String(value || '').replace(/px$/i, ''))
  return Number.isFinite(size) && size > 0 ? size : undefined
}

const normalizeFontSize = (value: string | undefined): string | undefined => {
  const size = parsePixelSize(value)
  if (!size) return undefined
  return `${Math.max(16, Math.min(240, Math.round(size * 10) / 10))}px`
}

const normalizeColor = (value: string | undefined): string | undefined => {
  const text = String(value || '').trim()
  if (/^#[0-9a-f]{6}$/i.test(text)) return text
  if (/^rgba?\(/i.test(text)) return text
  return undefined
}

const getColorChannels = (value: string | undefined): [number, number, number] | undefined => {
  const color = String(value || '').trim()
  const hexMatch = color.match(/^#([0-9a-f]{6})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16)
    ]
  }

  const rgbMatch = color.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i)
  if (!rgbMatch) return undefined
  return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])]
}

const getTextPreviewShadow = (color: string | undefined): string | undefined => {
  const channels = getColorChannels(color)
  if (!channels) return undefined
  const [red, green, blue] = channels.map((channel) => Math.max(0, Math.min(255, channel)) / 255)
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  if (luminance < 0.72) return undefined
  return '0 1px 1px rgba(24, 24, 27, 0.9), 0 0 1px rgba(24, 24, 27, 0.72)'
}

const parseStyleAttribute = (style: string | undefined): React.CSSProperties | undefined => {
  if (!style) return undefined
  const parsed: React.CSSProperties = {}
  for (const item of style.split(';')) {
    const [rawKey, ...rawValue] = item.split(':')
    const key = rawKey?.trim()
    const value = rawValue.join(':').trim()
    if (!key || !value) continue
    const camelKey = key.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    ;(parsed as Record<string, string>)[camelKey] = value
  }
  return parsed
}

const getStyleProperty = (style: string | undefined, propertyName: string): string | undefined => {
  if (!style) return undefined
  for (const item of style.split(';')) {
    const [rawKey, ...rawValue] = item.split(':')
    const key = rawKey?.trim().toLowerCase()
    const value = rawValue.join(':').trim()
    if (key === propertyName && value) return value
  }
  return undefined
}

const stripStyleProperties = (style: string | undefined, propertyNames: string[]): string | undefined => {
  if (!style) return undefined
  const excluded = new Set(propertyNames.map((name) => name.toLowerCase()))
  const kept = style
    .split(';')
    .map((item) => item.trim())
    .filter((item) => {
      const separator = item.indexOf(':')
      if (separator < 0) return false
      return !excluded.has(item.slice(0, separator).trim().toLowerCase())
    })
  return kept.length > 0 ? kept.join('; ') : undefined
}

const stripEditorOnlyStyleProperties = (style: string | undefined): string | undefined =>
  stripStyleProperties(style, ['zoom'])

function getSelectionElementStyle(editor: Editor, propertyName: string): string | undefined {
  if (!editor.selection) return undefined
  const entry = Editor.above(editor, {
    at: editor.selection.anchor,
    match: (node) =>
      SlateElement.isElement(node) && (node.type === 'span' || node.type === 'link') && Boolean(node.style)
  })
  const element = entry?.[0]
  return SlateElement.isElement(element) ? getStyleProperty(element.style, propertyName) : undefined
}

function getSelectionMarks(editor: Editor): Partial<RichTextLeaf> {
  const marks = (Editor.marks(editor) as Partial<RichTextLeaf> | null) || {}
  if (!editor.selection) return marks
  const textEntry = Editor.nodes(editor, {
    at: editor.selection,
    match: Text.isText
  }).next().value as [RichTextLeaf, unknown] | undefined
  const leaf: Partial<RichTextLeaf> = textEntry?.[0] || {}
  return {
    ...marks,
    ...leaf,
    color: marks.color || leaf.color || getSelectionElementStyle(editor, 'color'),
    fontSize: marks.fontSize || leaf.fontSize || getSelectionElementStyle(editor, 'font-size')
  }
}

const leafFromText = (text: string, marks: Partial<RichTextLeaf> = {}): RichTextLeaf => ({
  ...marks,
  text
})

function deserializeNode(node: Node, marks: Partial<RichTextLeaf> = {}): Array<RichTextLeaf | RichTextNode> {
  if (node.nodeType === Node.TEXT_NODE) {
    return [leafFromText(node.textContent || '', marks)]
  }
  if (!(node instanceof HTMLElement)) return []

  const tagName = node.tagName.toLowerCase()
  const nextMarks: Partial<RichTextLeaf> = { ...marks }
  const rawStyle = node.getAttribute('style') || undefined
  const color = getStyleProperty(rawStyle, 'color')
  const fontSize = getStyleProperty(rawStyle, 'font-size')
  const fontWeight = getStyleProperty(rawStyle, 'font-weight')
  if (color) nextMarks.color = color
  if (fontSize) nextMarks.fontSize = fontSize
  if (fontWeight && (fontWeight === 'bold' || Number(fontWeight) >= 600)) nextMarks.bold = true
  if (tagName === 'strong' || tagName === 'b') nextMarks.bold = true
  if (tagName === 'em' || tagName === 'i') nextMarks.italic = true
  if (tagName === 'u') nextMarks.underline = true
  if (tagName === 'br') return [leafFromText('\n', marks)]

  const children = Array.from(node.childNodes).flatMap((child) => deserializeNode(child, nextMarks))
  if (tagName === 'span' || tagName === 'a') {
    const inlineNode: RichTextNode = {
      type: tagName === 'a' ? 'link' : 'span',
      style: stripStyleProperties(rawStyle, ['color', 'font-size', 'font-weight', 'zoom']),
      className: node.getAttribute('class') || undefined,
      blockId: node.getAttribute('data-block-id') || undefined,
      href: tagName === 'a' ? node.getAttribute('href') || undefined : undefined,
      children:
        children.length > 0
          ? (children as Array<RichTextLeaf | RichTextNode>)
          : [leafFromText('', nextMarks)]
    }
    return [inlineNode]
  }

  return children
}

function deserializeHtml(html: string, fallbackText: string): Descendant[] {
  const source = html || escapeHtml(fallbackText)
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${source}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  const children = root
    ? Array.from(root.childNodes).flatMap((node) => deserializeNode(node))
    : [leafFromText(fallbackText)]
  return [
    {
      type: 'paragraph',
      children:
        children.length > 0
          ? (children as Array<RichTextLeaf | RichTextNode>)
          : [leafFromText('')]
    }
  ]
}

function serializeLeaf(leaf: RichTextLeaf): string {
  let html = escapeHtml(leaf.text)
  if (leaf.underline) html = `<u>${html}</u>`
  if (leaf.italic) html = `<em>${html}</em>`
  if (leaf.bold) html = `<strong>${html}</strong>`

  const attrs: string[] = []
  const style = [
    stripEditorOnlyStyleProperties(leaf.style),
    leaf.color ? `color: ${leaf.color}` : '',
    leaf.fontSize ? `font-size: ${leaf.fontSize}` : ''
  ]
    .filter(Boolean)
    .join('; ')
  if (style) attrs.push(`style="${escapeAttribute(style)}"`)
  if (leaf.className) attrs.push(`class="${escapeAttribute(leaf.className)}"`)
  if (leaf.blockId) attrs.push(`data-block-id="${escapeAttribute(leaf.blockId)}"`)
  return attrs.length > 0 ? `<span ${attrs.join(' ')}>${html}</span>` : html
}

function serializeNode(node: Descendant): string {
  if (Text.isText(node)) return serializeLeaf(node)
  const children = node.children.map((child) => serializeNode(child)).join('')
  if (node.type === 'span') {
    const attrs: string[] = []
    const style = stripEditorOnlyStyleProperties(node.style)
    if (style) attrs.push(`style="${escapeAttribute(style)}"`)
    if (node.className) attrs.push(`class="${escapeAttribute(node.className)}"`)
    if (node.blockId) attrs.push(`data-block-id="${escapeAttribute(node.blockId)}"`)
    return `<span${attrs.length ? ` ${attrs.join(' ')}` : ''}>${children}</span>`
  }
  if (node.type === 'link') {
    const attrs = node.href ? ` href="${escapeAttribute(node.href)}"` : ''
    return `<a${attrs}>${children}</a>`
  }
  return children
}

const serializeValue = (value: Descendant[]): RichTextValue => ({
  html: value.map((node) => serializeNode(node)).join(''),
  text: value.map((node) => SlateNode.string(node)).join('')
})

export function applyColorMark(
  editor: Editor,
  color: string,
  cachedSelection?: BaseSelection
): RichTextValue | null {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return null

  let selection = cachedSelection
  if (!selection || Range.isCollapsed(selection)) selection = editor.selection
  if (!selection || Range.isCollapsed(selection)) selection = Editor.range(editor, [])
  if (Range.isCollapsed(selection)) return null

  Transforms.select(editor, selection)
  Editor.addMark(editor, 'color', color)
  return serializeValue(editor.children)
}

function getNodeMaxFontSize(node: Descendant | RichTextNode | RichTextLeaf): number {
  if (Text.isText(node)) return parsePixelSize(node.fontSize) || 0
  const ownSize = parsePixelSize(getStyleProperty(node.style, 'font-size')) || 0
  return node.children.reduce(
    (maxSize, child) => Math.max(maxSize, getNodeMaxFontSize(child)),
    ownSize
  )
}

function getEditorZoom(value: Descendant[], defaultFontSize: string | undefined): number {
  const defaultSize = parsePixelSize(defaultFontSize) || 0
  const maxSize = value.reduce(
    (largestSize, node) => Math.max(largestSize, getNodeMaxFontSize(node)),
    defaultSize
  )
  if (maxSize <= 36) return 1
  return Math.max(0.25, Math.min(1, Math.round((36 / maxSize) * 100) / 100))
}

function withInlineRichText(editor: ReactEditor): ReactEditor {
  const { isInline } = editor
  editor.isInline = (element) =>
    SlateElement.isElement(element) && (element.type === 'span' || element.type === 'link')
      ? true
      : isInline(element)
  return editor
}

function isMarkActive(editor: Editor, mark: Mark): boolean {
  const marks = getSelectionMarks(editor) as Partial<Record<Mark, boolean>>
  return marks?.[mark] === true
}

function toggleMark(editor: Editor, mark: Mark): void {
  ReactEditor.focus(editor)
  if (isMarkActive(editor, mark)) Editor.removeMark(editor, mark)
  else Editor.addMark(editor, mark, true)
}

function setColorMark(
  editor: Editor,
  color: string,
  cachedSelection?: BaseSelection
): RichTextValue | null {
  const nextValue = applyColorMark(editor, color, cachedSelection)
  if (!nextValue) return null
  ReactEditor.focus(editor)
  return nextValue
}

function getCurrentFontSize(editor: Editor, defaultFontSize?: string): number {
  if (editor.selection && !Range.isCollapsed(editor.selection)) {
    const selectedSizes = new Set<number>()
    for (const [node, path] of Editor.nodes(editor, {
      at: editor.selection,
      match: Text.isText
    })) {
      const leaf = node as RichTextLeaf
      const parentEntry = Editor.parent(editor, path)
      const parent = parentEntry[0]
      const parentSize = SlateElement.isElement(parent)
        ? getStyleProperty(parent.style, 'font-size')
        : undefined
      const size = parsePixelSize(leaf.fontSize || parentSize || defaultFontSize)
      if (size) selectedSizes.add(Math.round(size * 10) / 10)
      if (selectedSizes.size > 1) return 16
    }
    const selectedSize = Array.from(selectedSizes)[0]
    return selectedSize ? Math.max(16, selectedSize) : 16
  }
  const marks = getSelectionMarks(editor)
  const size = Number(String(marks?.fontSize || '').replace(/px$/i, ''))
  if (Number.isFinite(size)) return size
  const fallback = Number(String(defaultFontSize || '').replace(/px$/i, ''))
  return Number.isFinite(fallback) && fallback > 0 ? Math.max(16, fallback) : 16
}

function getCurrentColor(editor: Editor, defaultColor?: string): string {
  const marks = getSelectionMarks(editor)
  return normalizeColor(marks.color) || normalizeColor(defaultColor) || '#18181b'
}

function setFontSizeMark(editor: Editor, value: number, selection?: BaseSelection): void {
  const size = Number(value)
  if (!Number.isFinite(size)) return
  const clamped = Math.max(16, Math.min(160, Math.round(size * 10) / 10))
  if (selection) Transforms.select(editor, selection)
  ReactEditor.focus(editor)
  Editor.addMark(editor, 'fontSize', `${clamped}px`)
}

function ColorMarkButton({
  defaultColor,
  onCommit
}: {
  defaultColor?: string
  onCommit?: (value: RichTextValue) => void
}): React.JSX.Element {
  const editor = useSlate()
  const selectionRef = useRef<BaseSelection>(null)
  const color = useSlateSelector((selectorEditor) => getCurrentColor(selectorEditor, defaultColor))
  const captureSelection = (): void => {
    if (editor.selection && Range.isExpanded(editor.selection)) {
      selectionRef.current = editor.selection
    }
  }
  return (
    <label
      className="relative inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-[#e4e4e7] bg-white/60 transition-colors hover:bg-[#f4f4f5]"
      title="Text color"
      onMouseDown={captureSelection}
      onFocus={captureSelection}
    >
      <span
        className="h-3.5 w-3.5 rounded-full border border-black/10"
        style={{ backgroundColor: color }}
      />
      <input
        type="color"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#18181b'}
        onChange={(event) => {
          const nextValue = setColorMark(editor, event.target.value, selectionRef.current)
          if (nextValue) onCommit?.(nextValue)
        }}
      />
    </label>
  )
}

function FontSizeMarkInput({ defaultFontSize }: { defaultFontSize?: string }): React.JSX.Element {
  const editor = useSlate()
  const selectionRef = useRef<BaseSelection>(null)
  const value = useSlateSelector((selectorEditor) =>
    getCurrentFontSize(selectorEditor, defaultFontSize)
  )
  const captureSelection = (): void => {
    if (editor.selection && Range.isExpanded(editor.selection)) {
      selectionRef.current = editor.selection
    }
  }
  return (
    <input
      type="number"
      min={16}
      max={100}
      value={String(Math.max(16, Math.min(100, Math.round(value))))}
      title="Font size"
      onMouseDown={captureSelection}
      onFocus={captureSelection}
      onChange={(event) => setFontSizeMark(editor, Number(event.target.value), selectionRef.current)}
      className="h-6 w-[58px] rounded-md border border-[#e4e4e7] bg-white/70 px-1 text-[11px] text-[#18181b] outline-none focus:border-[#ea580c]"
    />
  )
}

function ToolbarButton({ mark, label, icon: Icon }: (typeof commandButtons)[number]): React.JSX.Element {
  const editor = useSlate()
  const active = isMarkActive(editor, mark)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(event) => {
        event.preventDefault()
        toggleMark(editor, mark)
      }}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-md text-[#52525b] transition-colors hover:bg-[#f4f4f5] hover:text-[#18181b]',
        active && 'bg-[#fff7ed] text-[#ea580c]'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

export function RichTextBox({
  value,
  fallbackText = '',
  defaultColor,
  defaultFontSize,
  previewScale,
  onChange,
  onCommit,
  className
}: {
  value: string
  fallbackText?: string
  defaultColor?: string
  defaultFontSize?: string
  previewScale?: number
  onChange: (value: RichTextValue) => void
  onCommit?: (value: RichTextValue) => void
  className?: string
}): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [revision, setRevision] = useState(0)
  const [initialValue, setInitialValue] = useState<Descendant[]>(() =>
    deserializeHtml(value, fallbackText)
  )
  const [focused, setFocused] = useState(false)
  const editorColor = normalizeColor(defaultColor)
  const editorFontSize = normalizeFontSize(defaultFontSize)
  const safePreviewScale =
    Number.isFinite(previewScale) && previewScale && previewScale > 0
      ? Math.max(0.1, Math.min(1, previewScale))
      : undefined
  const editorZoom = safePreviewScale ?? getEditorZoom(initialValue, editorFontSize)
  const editor = useMemo(
    () => withInlineRichText(withHistory(withReact(createEditor()))),
    [revision]
  )

  useEffect(() => {
    if (focused) return
    setInitialValue(deserializeHtml(value, fallbackText))
    setRevision((current) => current + 1)
  }, [fallbackText, focused, value])

  const renderElement = useCallback((props: RenderElementProps) => {
    const element = props.element
    if (element.type === 'span') {
      return (
        <span
          {...props.attributes}
          style={parseStyleAttribute(element.style)}
          data-block-id={element.blockId}
          className={element.className}
        >
          {props.children}
        </span>
      )
    }
    if (element.type === 'link') {
      return (
        <a {...props.attributes} href={element.href}>
          {props.children}
        </a>
      )
    }
    return <div {...props.attributes}>{props.children}</div>
  }, [])

  const renderLeaf = useCallback((props: RenderLeafProps) => {
    let children = props.children
    if (props.leaf.bold) children = <strong>{children}</strong>
    if (props.leaf.italic) children = <em>{children}</em>
    if (props.leaf.underline) children = <u>{children}</u>
    return (
      <span
        {...props.attributes}
        style={{
          color: props.leaf.color,
          fontSize: props.leaf.fontSize,
          textShadow: props.leaf.color ? getTextPreviewShadow(props.leaf.color) || 'none' : undefined
        }}
      >
        {children}
      </span>
    )
  }, [])

  const handleRootBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && rootRef.current?.contains(nextTarget)) {
      return
    }
    setFocused(false)
    onCommit?.(serializeValue(editor.children))
  }

  return (
    <div
      ref={rootRef}
      onFocus={() => setFocused(true)}
      onBlur={handleRootBlur}
      className="overflow-hidden rounded-[1rem] border border-[#e4e4e7] bg-[#ffffff] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <Slate
        key={revision}
        editor={editor}
        initialValue={initialValue}
        onChange={(nextValue) => onChange(serializeValue(nextValue))}
      >
        <div className="flex h-8 items-center gap-1 border-b border-[#e4e4e7] bg-[#fafafa] px-2">
          {commandButtons.map((button) => (
            <ToolbarButton key={button.mark} {...button} />
          ))}
          <ColorMarkButton defaultColor={defaultColor} onCommit={onCommit} />
          <FontSizeMarkInput defaultFontSize={defaultFontSize} />
        </div>
        <Editable
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          style={{
            color: editorColor,
            fontSize: editorFontSize,
            lineHeight: 'normal',
            whiteSpace: 'pre',
            zoom: editorZoom,
            caretColor: '#18181b',
            textShadow: getTextPreviewShadow(editorColor)
          }}
          className={cn(
            'min-h-[120px] overflow-auto px-3 py-2 outline-none selection:bg-[#fff7ed] selection:text-[#18181b] focus-visible:bg-white/40 [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline',
            className
          )}
        />
      </Slate>
    </div>
  )
}
