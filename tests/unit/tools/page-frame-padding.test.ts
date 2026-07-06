import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const projectRoot = path.resolve(__dirname, '../../..')
const pageWriterSource = readFileSync(
  path.join(projectRoot, 'src/main/tools/page-writer.ts'),
  'utf-8'
)
const templateSource = readFileSync(
  path.join(projectRoot, 'src/main/ipc/engine/template.ts'),
  'utf-8'
)
const indexRuntimeSource = readFileSync(
  path.join(projectRoot, 'resources/index-runtime.js'),
  'utf-8'
)
const previewIframeSource = readFileSync(
  path.join(projectRoot, 'src/renderer/src/components/preview/PreviewIframe.tsx'),
  'utf-8'
)
const generationThumbnailSource = readFileSync(
  path.join(projectRoot, 'src/renderer/src/components/session-generating/GenerationThumbnail.tsx'),
  'utf-8'
)
const pageThumbnailSource = readFileSync(
  path.join(projectRoot, 'src/renderer/src/components/session-detail/sidebar/PageThumbnail.tsx'),
  'utf-8'
)
const browseViewSource = readFileSync(
  path.join(projectRoot, 'src/renderer/src/components/session-detail/browse/BrowseView.tsx'),
  'utf-8'
)
const generationPreviewGridSource = readFileSync(
  path.join(projectRoot, 'src/renderer/src/components/session-generating/GenerationPreviewGrid.tsx'),
  'utf-8'
)

describe('page runtime frame padding', () => {
  it('does not add default padding to the page root', () => {
    expect(pageWriterSource).toContain('.ppt-page-root.p-2,')
    expect(pageWriterSource).toContain('padding: 0;')
    expect(pageWriterSource).not.toContain('padding: 0.5rem')
    expect(pageWriterSource).not.toContain('padding: 2rem')
    expect(pageWriterSource).not.toContain('padding: 3rem')
  })

  it('creates scaffold pages without padding utility classes on the root frame', () => {
    expect(templateSource).toContain(
      '<main class="ppt-page-root" data-ppt-guard-root="1" data-ppt-slide-size-id='
    )
    expect(templateSource).not.toContain('ppt-page-root p-2')
    expect(pageWriterSource).toContain(
      '<main class="ppt-page-root" data-ppt-guard-root="1" data-ppt-slide-size-id='
    )
    expect(pageWriterSource).not.toContain('ppt-page-root p-2')
  })

  it('keeps preview scaling letterboxed to match the session canvas', () => {
    expect(indexRuntimeSource).toContain(
      'Math.min(rect.width / slideWidth, rect.height / slideHeight)'
    )
    expect(indexRuntimeSource).not.toContain(
      'Math.max(rect.width / slideWidth, rect.height / slideHeight)'
    )
    expect(indexRuntimeSource).toContain(
      'Math.max(0, (rect.width - slideWidth * scale) / 2)'
    )

    expect(previewIframeSource).toContain(
      'Math.min(width / slideSize.width, height / slideSize.height)'
    )
    expect(previewIframeSource).not.toContain(
      'Math.max(width / slideSize.width, height / slideSize.height)'
    )
    expect(previewIframeSource).toContain(
      'Math.max(0, (width - slideSize.width * nextScale) / 2)'
    )
  })

  it('keeps generation thumbnail card surfaces aligned with their grid cell', () => {
    expect(generationPreviewGridSource).toContain('className="min-w-0 w-full"')
    expect(generationThumbnailSource).toContain('flex w-full min-w-0 flex-col')
    expect(generationThumbnailSource).toContain('p-1.5')
    expect(generationThumbnailSource).toContain('h-[180px] w-full min-w-0 shrink-0')
    expect(generationThumbnailSource).not.toContain('rounded-[0.9rem]')
    expect(generationThumbnailSource).toContain(
      "slideSize.width >= slideSize.height"
    )
    expect(generationThumbnailSource).toContain("height: '100%'")
    expect(generationThumbnailSource).toContain("contain: 'paint'")
    expect(generationThumbnailSource).toContain('flex w-full min-w-0 items-center')
  })

  it('keeps list thumbnails in fixed-height viewports with centered slide canvases', () => {
    expect(pageThumbnailSource).toContain('h-[138px] w-full items-center justify-center')
    expect(browseViewSource).toContain('h-[220px] w-full items-center justify-center')
    for (const source of [generationThumbnailSource, pageThumbnailSource, browseViewSource]) {
      expect(source).toContain("slideSize.width >= slideSize.height")
      expect(source).toContain("width: '100%'")
      expect(source).toContain("height: '100%'")
      expect(source).not.toContain('aspectRatio: `${slideSize.width}/${slideSize.height}`, contain')
    }
  })

  it('uses black letterbox bars in presentation mode', () => {
    expect(templateSource).toContain('body.present { background: #000000; }')
    expect(templateSource).toContain('body.present .ppt-preview-viewport { border-radius: 0; background: #000000; }')
    expect(indexRuntimeSource).toContain('function ensurePresentBackgroundStyles()')
    expect(indexRuntimeSource).toContain('body.present { background: #000000 !important; }')
  })
})
