import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const readSource = (filePath: string): string => fs.readFileSync(path.resolve(filePath), 'utf8')

describe('slide master runtime contract', () => {
  it('tracks the master directory and waits for it before every browser capture path', () => {
    const historySource = readSource('src/main/history/git-history-service.ts')
    const exportScript = readSource('src/main/io/html-pptx/browser-scripts.ts')
    const videoExporter = readSource('src/main/io/html-video/exporter.ts')
    const pageExport = readSource('src/main/ipc/runtime/page-export.ts')
    const pptxRenderer = readSource('src/main/io/html-pptx/renderer.ts')
    const thumbnails = readSource('src/main/io/thumbnails/html-thumbnail-service.ts')

    expect(historySource).toContain("rel === 'master/master.css'")
    expect(historySource).toContain("rel === 'master/master.html'")
    expect(historySource).toContain("rel === 'master/layouts.json'")
    expect(exportScript).toContain('link[data-ppt-master="1"]')
    expect(exportScript).toContain('母版样式表加载失败')
    expect(exportScript).toContain('_pptMasterExport')
    expect(exportScript).toContain("get('_pptMasterExpected') === '1'")
    expect(exportScript).toContain("get('_pptMasterElementsExpected') === '1'")
    expect(exportScript).toContain('assertMasterElementsReady')
    expect(exportScript).toContain('window.PPT?.whenReadyForPrint')
    expect(videoExporter).toContain('link[data-ppt-master="1"]')
    expect(videoExporter).toContain('母版样式表加载失败')
    expect(videoExporter).toContain('_pptMasterExport')
    expect(videoExporter).toContain("get('_pptMasterExpected') === '1'")
    expect(videoExporter).toContain("get('_pptMasterElementsExpected') === '1'")
    expect(videoExporter).toContain('assertMasterElementsReady')
    expect(videoExporter).toContain('window.PPT?.whenReadyForPrint')
    expect(pageExport).toContain("'_pptMasterExpected'")
    expect(pageExport).toContain("'_pptMasterElementsExpected'")
    expect(pptxRenderer).toContain("'_pptMasterExpected'")
    expect(pptxRenderer).toContain("'_pptMasterElementsExpected'")
    expect(thumbnails).toContain("'_pptMasterExpected'")
    expect(thumbnails).toContain("'_pptMasterElementsExpected'")
  })

  it('injects global elements as a fixed root layer and tracks the work for print export', () => {
    const runtime = readSource('resources/ppt-runtime.js')

    expect(runtime).toContain('loadMasterElementsWhenReady')
    expect(runtime).toContain('./master/master.html')
    expect(runtime).toContain('data-ppt-master-elements-layer')
    expect(runtime).toContain('data-ppt-master-off')
    expect(runtime).toContain('trackPrintTask(masterElementsTask)')
    expect(runtime).toContain('assertMasterElementsReady')
    expect(runtime).toContain('母版全局元素加载失败')
  })

  it('exposes an ignore-cache preview refresh and places the control in workspace tabs', () => {
    const previewSource = readSource('src/renderer/src/components/preview/PreviewIframe.tsx')
    const runtimeStoreSource = readSource('src/renderer/src/store/sessionDetailRuntimeStore.ts')
    const tabsSource = readSource(
      'src/renderer/src/components/session-detail/workspace/toolbar/WorkspaceTabs.tsx'
    )

    expect(previewSource).toContain('reloadIgnoringCache')
    expect(runtimeStoreSource).toContain('reloadCurrentPreviewIgnoringCache')
    expect(tabsSource).toContain('<MasterWorkbenchPanel />')
  })

  it('keeps master creation out of shared edit and retry context', () => {
    const generationContext = readSource('src/main/generation/context.ts')

    expect(generationContext).not.toContain('createSessionMasterIfMissing')
  })

  it('prevents stale master form data and guaranteed failed saves', () => {
    const panelSource = readSource(
      'src/renderer/src/components/session-detail/workspace/workbench/MasterWorkbenchPanel.tsx'
    )

    expect(panelSource).toContain('masterLoadRequestRef')
    expect(panelSource).toContain('currentSessionIdRef')
    expect(panelSource).toContain('status?.missingPageCount')
  })
})
