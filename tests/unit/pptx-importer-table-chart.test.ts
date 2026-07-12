import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it, vi } from 'vitest'
import { zipSync } from 'fflate'
import { __pptxImporterTestUtils } from '../../src/main/utils/pptx-importer'
import { parsePptxXmlDeckMetadata } from '../../src/main/utils/pptx-xml-shape-metadata'
import {
  parsePptxOoxmlCustomGeometry,
  renderPptxOoxmlCustomGeometryPath
} from '../../src/main/utils/pptx-ooxml-path-renderer'

vi.mock('../../src/main/ipc/engine/template', () => ({
  buildPageScaffoldHtml: () => '',
  buildProjectIndexHtml: () => ''
}))

const baseBlockArgs = {
  scaleX: 2,
  scaleY: 2,
  textScale: 2,
  zIndex: 3,
  offsetX: 0,
  offsetY: 0
}

describe('pptx importer table and chart blocks', () => {
  it('renders PPTX freeform paths as SVG instead of their bounding rectangles', async () => {
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-logo',
      imagesDir: '/tmp',
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 10,
        top: 20,
        width: 120,
        height: 60,
        path: 'M 0,0 L 160,0 L 80,80 z',
        fill: { type: 'color', value: '#FEFEFE' },
        borderColor: '#0079BA',
        borderWidth: 0.75,
        isFlipH: false,
        isFlipV: false
      }
    })

    expect(html).toContain('data-pptx-kind="vector-shape"')
    expect(html).toContain('<svg viewBox="0.0000 0.0000 160.0000 80.0000"')
    expect(html).toContain('<path d="M 0,0 L 160,0 L 80,80 z"')
    expect(html).toContain('fill="#FEFEFE"')
    expect(html).toContain('stroke="#0079BA"')
    expect(html).not.toContain('background:#FEFEFE')
  })

  it('uses each freeform path coordinate bounds instead of assuming a fixed point scale', async () => {
    expect(
      __pptxImporterTestUtils.getSvgPathBounds(
        'M 10,20 L 15,20 L 15,25 L 10,25 z'
      )
    ).toEqual({ minX: 10, minY: 20, width: 5, height: 5 })

    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-small-domain',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 100,
        top: 200,
        width: 246.7151,
        height: 16.695,
        path: 'M 0,0 L 33.25,0 L 33.25,2.25 L 0,2.25 z',
        fill: { type: 'color', value: '#FEFEFE' }
      }
    })

    expect(html).toContain('viewBox="0.0000 0.0000 33.2500 2.2500"')
    expect(html).toContain('width:493.4px')
    expect(html).toContain('height:33.4px')
  })

  it('keeps PPTX circle arc paths square instead of widening the SVG viewBox', async () => {
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-circle',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 259.2,
        top: 249.15,
        width: 52.9835,
        height: 52.9835,
        path:
          'M 0,26.49175 A 26.49175,26.49175 0 1,0 52.9835,26.49175 A 26.49175,26.49175 0 1,0 0,26.49175 Z',
        fill: { type: 'color', value: '#335CA7' }
      }
    })

    const bounds = __pptxImporterTestUtils.getSvgPathBounds(
      'M 0,26.49175 A 26.49175,26.49175 0 1,0 52.9835,26.49175 A 26.49175,26.49175 0 1,0 0,26.49175 Z'
    )
    expect(bounds?.minX).toBeCloseTo(0, 4)
    expect(bounds?.minY).toBeCloseTo(0, 4)
    expect(bounds?.width).toBeCloseTo(52.9835, 4)
    expect(bounds?.height).toBeCloseTo(52.9835, 4)
    expect(html).toContain('<svg viewBox="0.0000 0.0000 52.9835 52.9835"')
  })

  it('preserves the PPTX local shape canvas for partial arc paths', async () => {
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-partial-arc',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 314.04,
        top: 132.06,
        width: 331.9778,
        height: 331,
        path:
          'M170.806215483432,0.06971264550048772 A165.9889,165.5 0 0,1 306.2220623719563,76.95293186587223',
        fill: { type: 'color', value: '#335CA7' }
      }
    })

    expect(
      __pptxImporterTestUtils.getSvgPathBounds(
        'M170.806215483432,0.06971264550048772 A165.9889,165.5 0 0,1 306.2220623719563,76.95293186587223'
      )?.width
    ).toBeCloseTo(135.4158, 4)
    expect(html).toContain('<svg viewBox="0.0000 0.0000 331.9778 331.0000"')
  })

  it('preserves local canvas for PPTX arc paths that start near the origin', async () => {
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-origin-arc',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 353.6202,
        top: 205.3954,
        width: 252.7595,
        height: 252.7595,
        path:
          'M0.3479460565247905,116.65662826897912 A126.37975,126 0 0,1 127.40676928034438,0.0041605421807560106',
        fill: { type: 'color', value: '#335CA7' }
      },
      xmlShape: {
        id: '61',
        name: '弧形 60',
        preset: 'arc',
        lineColor: '#6E94D4',
        lineWidth: 1.75,
        tailEnd: 'arrow'
      }
    })

    expect(html).toContain('<svg viewBox="0.0000 0.0000 252.7595 252.7595"')
    expect(html).toContain('fill="none"')
    expect(html).toContain('stroke="#6E94D4"')
    expect(html).toContain('marker-end="url(#pptx-shape-origin-arc-tail-arrow)"')
  })

  it('preserves local canvas for PPTX preset trapezoids with paths outside their bounds', async () => {
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-bottom-trapezoid',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 0,
        top: 820.6,
        width: 960,
        height: 47.6604,
        path: 'M 1870.1186 0 L 0 47.6604 L 960 47.6604 L -910.1186 0 Z',
        fill: { type: 'color', value: '#536F9F' }
      },
      xmlShape: {
        id: '1044',
        name: '梯形 1043',
        preset: 'trapezoid',
        fillColor: '#536F9F'
      }
    })

    expect(html).toContain('<svg viewBox="0.0000 0.0000 960.0000 47.6604"')
    expect(html).not.toContain('viewBox="-910.1186')
  })

  it('preserves local canvas for PPTX custom geometry shapes', async () => {
    const customGeometry = parsePptxOoxmlCustomGeometry(`
      <a:custGeom xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:pathLst>
          <a:path w="1000" h="500">
            <a:moveTo><a:pt x="100" y="0"/></a:moveTo>
            <a:cubicBezTo><a:pt x="300" y="0"/><a:pt x="500" y="100"/><a:pt x="700" y="250"/></a:cubicBezTo>
            <a:lnTo><a:pt x="1000" y="500"/></a:lnTo>
            <a:close/>
          </a:path>
        </a:pathLst>
      </a:custGeom>
    `)
    expect(customGeometry).toBeTruthy()
    expect(renderPptxOoxmlCustomGeometryPath(customGeometry!, 200, 100)).toBe(
      'M 20 0 C 60 0 100 20 140 50 L 200 100 Z'
    )

    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-custom-petal',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 318,
        top: 137.2,
        width: 200,
        height: 100,
        path: 'M0,0 L1,0 L1,1 Z',
        fill: { type: 'color', value: '#305598' }
      },
      xmlShape: {
        id: '2',
        name: '任意多边形: 形状 1',
        preset: '',
        isCustomGeometry: true,
        customGeometry,
        fillColor: '#305598'
      }
    })

    expect(html).toContain('<svg viewBox="0.0000 0.0000 200.0000 100.0000"')
    expect(html).toContain('<path d="M 20 0 C 60 0 100 20 140 50 L 200 100 Z"')
    expect(html).not.toContain('<path d="M0,0 L1,0 L1,1 Z"')
  })

  it('uses real bounds for PPTX custom geometry paths that exceed their local canvas', async () => {
    const customGeometry = parsePptxOoxmlCustomGeometry(`
      <a:custGeom xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:pathLst>
          <a:path w="100" h="100">
            <a:moveTo><a:pt x="-10" y="-5"/></a:moveTo>
            <a:lnTo><a:pt x="110" y="-5"/></a:lnTo>
            <a:lnTo><a:pt x="110" y="105"/></a:lnTo>
            <a:close/>
          </a:path>
        </a:pathLst>
      </a:custGeom>
    `)

    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-custom-outside-canvas',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        path: 'M0,0 L1,0 L1,1 Z',
        fill: { type: 'color', value: '#305598' }
      },
      xmlShape: {
        id: '12',
        name: '任意多边形: 形状 11',
        preset: '',
        isCustomGeometry: true,
        customGeometry,
        fillColor: '#305598'
      }
    })

    expect(html).toContain('<svg viewBox="-10.0000 -5.0000 120.0000 110.0000"')
    expect(html).not.toContain('<svg viewBox="0.0000 0.0000 100.0000 100.0000"')
  })

  it('keeps text-bearing PPTX ellipses as vector shapes', async () => {
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-number-circle',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 20.9,
        top: 148.2,
        width: 20.7,
        height: 20.7,
        path: 'M 0,10.35 A 10.35,10.35 0 1,0 20.7,10.35 A 10.35,10.35 0 1,0 0,10.35 Z',
        fill: { type: 'color', value: '#FFFFFF' },
        content:
          '<p style="text-align:center;line-height:1;margin-top:0;margin-bottom:0"><span style="color:#305598;font-size:18pt">1</span></p>'
      },
      xmlShape: {
        id: '52',
        name: '椭圆 51',
        preset: 'ellipse',
        fillColor: '#FFFFFF',
        textAnchor: 'ctr'
      }
    })

    expect(html).toContain('data-pptx-kind="vector-shape"')
    expect(html).toContain('<svg viewBox="0.0000 0.0000 20.7000 20.7000"')
    expect(html).toContain('fill="#FFFFFF"')
    expect(html).toContain('justify-content:center')
    expect(html).toContain('>1</span>')
    expect(html).not.toContain('background:#FFFFFF')
  })

  it('uses PPTX XML frame and preset geometry when imported ellipse dimensions are wrong', async () => {
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-xml-circle',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 10,
        top: 20,
        width: 30,
        height: 20,
        path: 'M 0,10 A 15,10 0 1,0 30,10 A 15,10 0 1,0 0,10 Z',
        fill: { type: 'color', value: '#305598' }
      },
      xmlShape: {
        id: '90',
        name: '椭圆 89',
        preset: 'ellipse',
        left: 100,
        top: 120,
        width: 20,
        height: 20,
        fillColor: '#305598'
      }
    })

    expect(html).toContain('left:200.0px')
    expect(html).toContain('top:240.0px')
    expect(html).toContain('width:40.0px')
    expect(html).toContain('height:40.0px')
    expect(html).toContain('<svg viewBox="0.0000 0.0000 20.0000 20.0000"')
    expect(html).toContain('<path d="M 0 10 A 10 10 0 1 0 20 10 A 10 10 0 1 0 0 10 Z"')
    expect(html).not.toContain('A 15,10')
  })

  it('renders PPTX roundRect presets from XML adjustment values instead of imported oval paths', async () => {
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-xml-pill',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 0,
        top: 0,
        width: 100,
        height: 30,
        path: 'M0,15 Q0,30 50,30 Q100,30 100,15 Q100,0 50,0 Q0,0 0,15 z',
        fill: { type: 'color', value: '#305598' },
        content:
          '<p style="text-align:center;line-height:1;margin-top:0;margin-bottom:0"><span style="font-size:12pt">超额完成</span></p>'
      },
      xmlShape: {
        id: '50',
        name: '矩形: 圆角 49',
        preset: 'roundRect',
        width: 100,
        height: 30,
        adjustments: { adj: 50000 },
        fillColor: '#305598',
        textAnchor: 'ctr',
        textInsets: { top: 2, right: 4, bottom: 2, left: 4 }
      }
    })

    expect(html).toContain('<svg viewBox="0.0000 0.0000 100.0000 30.0000"')
    expect(html).toContain(
      '<path d="M 15 0 L 85 0 A 15 15 0 0 1 100 15 L 100 15 A 15 15 0 0 1 85 30 L 15 30 A 15 15 0 0 1 0 15 L 0 15 A 15 15 0 0 1 15 0 Z"'
    )
    expect(html).not.toContain('Q0,30 50,30')
    expect(html).toContain('padding:4.0px 8.0px 4.0px 8.0px')
    expect(html).toContain('justify-content:center')
  })

  it('centers imported text vertically when PPTX bodyPr requests center anchoring', async () => {
    const html = await __pptxImporterTestUtils.buildTextBlock({
      ...baseBlockArgs,
      blockId: 'text-pill',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 10,
        top: 20,
        width: 120,
        height: 30,
        content:
          '<p style="text-align:center;line-height:1;margin-top:0;margin-bottom:0"><span style="font-size:12pt">净利+12%</span></p>'
      },
      xmlShape: {
        id: '64',
        name: '圆角矩形 63',
        preset: 'roundRect',
        textAnchor: 'ctr'
      }
    })

    expect(html).toContain('display:flex')
    expect(html).toContain('flex-direction:column')
    expect(html).toContain('justify-content:center')
  })

  it('preserves PPTX shape shadow on visible text blocks', async () => {
    const html = await __pptxImporterTestUtils.buildTextBlock({
      ...baseBlockArgs,
      blockId: 'text-gradient-shadow',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 10,
        top: 20,
        width: 120,
        height: 40,
        fill: {
          type: 'gradient',
          value: {
            path: 'line',
            rot: 45,
            colors: [
              { pos: '0%', color: '#3B8BD9' },
              { pos: '100%', color: '#054A7A' }
            ]
          }
        },
        shadow: { h: 2, v: 3, blur: 4, color: '#00000066' },
        content:
          '<p style="text-align:center;line-height:1;margin-top:0;margin-bottom:0"><span style="font-size:12pt">年度总结</span></p>'
      }
    })

    expect(html).toContain('linear-gradient')
    expect(html).toContain('box-shadow:4.0px 6.0px 8.0px #00000066')
  })

  it('centers single-line spAutoFit title text without explicit bodyPr anchoring', async () => {
    const html = await __pptxImporterTestUtils.buildTextBlock({
      ...baseBlockArgs,
      blockId: 'text-autofit-title',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 62.0563,
        top: 72.565,
        width: 228.3396,
        height: 29.0813,
        autoFit: { type: 'shape' },
        content:
          '<p style="text-align:center;line-height:1;margin-top:0;margin-bottom:0"><span style="font-size:18pt">超额达标+结构优化</span></p>'
      },
      xmlShape: {
        id: '',
        name: '文本框 31',
        preset: 'rect'
      }
    })

    expect(html).toContain('box-sizing:border-box')
    expect(html).toContain('display:flex')
    expect(html).toContain('flex-direction:column')
    expect(html).toContain('justify-content:center')
  })

  it('centers compact left-aligned spAutoFit text while preserving horizontal alignment', async () => {
    const html = await __pptxImporterTestUtils.buildTextBlock({
      ...baseBlockArgs,
      blockId: 'text-autofit-left-title',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 330.656,
        top: 152.074,
        width: 111.478,
        height: 21.811,
        autoFit: { type: 'shape' },
        content:
          '<p style="text-align:left;line-height:1;margin-top:0;margin-bottom:0"><span style="font-size:12pt;font-weight:700">理论运用到工作中</span></p>'
      },
      xmlShape: {
        id: '',
        name: '文本框 33',
        preset: 'rect'
      }
    })

    expect(html).toContain('display:flex')
    expect(html).toContain('flex-direction:column')
    expect(html).toContain('justify-content:center')
    expect(html).toContain('text-align:left')
  })

  it('centers compact two-line spAutoFit labels without centering tall body text', async () => {
    const labelHtml = await __pptxImporterTestUtils.buildTextBlock({
      ...baseBlockArgs,
      blockId: 'text-autofit-two-line-label',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 316,
        top: 305,
        width: 42,
        height: 38,
        autoFit: { type: 'shape' },
        content:
          '<p style="text-align:center;line-height:1.2;margin-top:0;margin-bottom:0"><span style="font-size:11pt">经验</span></p><p style="text-align:center;line-height:1.2;margin-top:0;margin-bottom:0"><span style="font-size:11pt">不足</span></p>'
      },
      xmlShape: {
        id: '',
        name: '文本框 24',
        preset: 'rect'
      }
    })
    const bodyHtml = await __pptxImporterTestUtils.buildTextBlock({
      ...baseBlockArgs,
      blockId: 'text-autofit-body',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 300,
        top: 174,
        width: 198,
        height: 70,
        autoFit: { type: 'shape' },
        content:
          '<p style="text-align:justify;line-height:1.2;margin-top:0;margin-bottom:0"><span style="font-size:11pt">在以后的工作中，我将要求自己继续参加各种与工作相关的培训班，让知识更加丰富</span></p>'
      },
      xmlShape: {
        id: '',
        name: '文本框 18',
        preset: 'rect'
      }
    })

    expect(labelHtml).toContain('display:flex')
    expect(labelHtml).toContain('justify-content:center')
    expect(bodyHtml).not.toContain('display:flex')
  })

  it('keeps PPTX paragraph margins so imported text stays positioned', () => {
    const html = __pptxImporterTestUtils.sanitizeContentHtml(
      '<p style="text-align:center;line-height:0.9;margin-top:10pt;margin-bottom:0pt"><span style="font-size:18pt">K</span></p>',
      1.6667
    )

    expect(html).toContain('margin-top:16.7px')
    expect(html).toContain('margin-bottom:0')
    expect(html).toContain('font-size:30.0px')
  })

  it('reads PPTX XML shape preset and theme colors for complex shape fallback', () => {
    const encode = (value: string): Uint8Array => new TextEncoder().encode(value)
    const pptx = zipSync({
      'ppt/theme/theme1.xml': encode(`
        <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:themeElements>
            <a:clrScheme name="Office">
              <a:accent1><a:srgbClr val="335CA7"/></a:accent1>
              <a:accent2><a:srgbClr val="6E94D4"/></a:accent2>
              <a:accent4><a:srgbClr val="75BD42"/></a:accent4>
              <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
            </a:clrScheme>
          </a:themeElements>
        </a:theme>
      `),
      'ppt/theme/theme3.xml': encode(`
        <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:themeElements>
            <a:clrScheme name="SlideTheme">
              <a:accent1><a:srgbClr val="305598"/></a:accent1>
              <a:accent2><a:srgbClr val="4474C5"/></a:accent2>
              <a:accent4><a:srgbClr val="99B0E3"/></a:accent4>
              <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
            </a:clrScheme>
          </a:themeElements>
        </a:theme>
      `),
      'ppt/slides/_rels/slide2.xml.rels': encode(`
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout3.xml"/>
        </Relationships>
      `),
      'ppt/slideLayouts/_rels/slideLayout3.xml.rels': encode(`
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster3.xml"/>
        </Relationships>
      `),
      'ppt/slideMasters/_rels/slideMaster3.xml.rels': encode(`
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme3.xml"/>
        </Relationships>
      `),
      'ppt/slides/slide2.xml': encode(`
        <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <p:cSld>
            <p:spTree>
              <p:sp>
                <p:nvSpPr>
                  <p:cNvPr id="57" name="空心弧 56"/>
                </p:nvSpPr>
                <p:spPr>
                  <a:xfrm flipV="1" rot="7200000"><a:off x="12700" y="25400"/><a:ext cx="254000" cy="508000"/></a:xfrm>
                  <a:prstGeom prst="blockArc"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>
                  <a:solidFill><a:schemeClr val="accent1"/></a:solidFill>
                  <a:ln w="22225"><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></a:ln>
                </p:spPr>
                <p:txBody><a:bodyPr anchor="ctr" tIns="12700" rIns="25400" bIns="38100" lIns="50800"/></p:txBody>
              </p:sp>
              <p:sp>
                <p:nvSpPr>
                  <p:cNvPr id="58" name="浅色圆 57"/>
                </p:nvSpPr>
                <p:spPr>
                  <a:prstGeom prst="ellipse"/>
                  <a:solidFill>
                    <a:schemeClr val="accent4"><a:lumMod val="20000"/><a:lumOff val="80000"/></a:schemeClr>
                  </a:solidFill>
                  <a:ln><a:noFill/></a:ln>
                </p:spPr>
              </p:sp>
            </p:spTree>
          </p:cSld>
        </p:sld>
      `)
    })

    const metadata = parsePptxXmlDeckMetadata(Buffer.from(pptx))
    const shape = metadata.slides.get(2)?.byName.get('空心弧 56')

    expect(shape?.preset).toBe('blockArc')
    expect(shape?.fillColor).toBe('#305598')
    expect(shape?.lineColor).toBe('#4474C5')
    expect(shape?.lineWidth).toBeCloseTo(1.75)
    expect(shape?.flipV).toBe(true)
    expect(shape?.textAnchor).toBe('ctr')
    expect(shape?.left).toBeCloseTo(1)
    expect(shape?.top).toBeCloseTo(2)
    expect(shape?.width).toBeCloseTo(20)
    expect(shape?.height).toBeCloseTo(40)
    expect(shape?.rotate).toBeCloseTo(120)
    expect(shape?.adjustments?.adj).toBe(50000)
    expect(shape?.textInsets?.top).toBeCloseTo(1)
    expect(shape?.textInsets?.right).toBeCloseTo(2)
    expect(shape?.textInsets?.bottom).toBeCloseTo(3)
    expect(shape?.textInsets?.left).toBeCloseTo(4)
    expect(metadata.slides.get(2)?.byName.get('浅色圆 57')?.fillColor).toBe('#EBEFF9')
  })

  it('preserves gradient, pattern, dashed border, and shadow on vector shapes', async () => {
    const gradientHtml = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-gradient',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        path: 'M 0,0 L 133,0 L 133,67 L 0,67 z',
        fill: {
          type: 'gradient',
          value: {
            path: 'line',
            rot: 45,
            colors: [
              { pos: '0%', color: '#0079BA' },
              { pos: '100%', color: '#FFFFFF' }
            ]
          }
        },
        borderColor: '#112233',
        borderWidth: 1,
        borderType: 'dashed',
        shadow: { h: 2, v: 3, blur: 4, color: '#00000066' }
      }
    })

    expect(gradientHtml).toContain('<linearGradient')
    expect(gradientHtml).toContain('gradientTransform="rotate(45.00 0.5 0.5)"')
    expect(gradientHtml).toContain('fill="url(#pptx-shape-gradient-gradient) #0079BA"')
    expect(gradientHtml).toContain('stroke-dasharray=')
    expect(gradientHtml).toContain('<feDropShadow')

    const patternHtml = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-pattern',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        path: 'M 0,0 L 133,0 L 133,67 L 0,67 z',
        fill: {
          type: 'pattern',
          value: {
            type: 'cross',
            foregroundColor: '#0079BA',
            backgroundColor: '#FFFFFF'
          }
        }
      }
    })

    expect(patternHtml).toContain('<pattern')
    expect(patternHtml).toContain('fill="url(#pptx-shape-pattern-pattern) #FFFFFF"')
  })

  it('normalizes OOXML gradient stops and ignores invisible borders', async () => {
    const cssGradientHtml = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-css-gradient',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        fill: {
          type: 'gradient',
          value: {
            path: 'line',
            rot: 0,
            colors: [
              { pos: '0', color: '#0079BA' },
              { pos: '97000', color: '#FFFFFF' },
              { pos: '100000', color: '#00000000' }
            ]
          }
        },
        borderColor: 'transparent',
        borderWidth: 4,
        borderType: 'dashed'
      }
    })

    expect(cssGradientHtml).toContain(
      'background:linear-gradient(135deg, #0079BA 0%, #FFFFFF 97%, #00000000 100%)'
    )
    expect(cssGradientHtml).not.toContain('100000')
    expect(cssGradientHtml).not.toContain('border:')

    const svgGradientHtml = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-svg-gradient',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        path: 'M 0,0 L 100,0 L 100,50 L 0,50 z',
        fill: {
          type: 'gradient',
          value: {
            path: 'line',
            rot: 0,
            colors: [
              { pos: '0', color: '#0079BA' },
              { pos: '100000', color: '#FFFFFF' }
            ]
          }
        },
        borderColor: 'transparent',
        borderWidth: 1,
        borderStrokeDasharray: '6 4'
      }
    })

    expect(svgGradientHtml).toContain('<stop offset="0%" stop-color="#0079BA"')
    expect(svgGradientHtml).toContain('<stop offset="100%" stop-color="#FFFFFF"')
    expect(svgGradientHtml).toContain('fill="url(#pptx-shape-svg-gradient-gradient) #0079BA"')
    expect(svgGradientHtml).toContain('stroke="none"')
    expect(svgGradientHtml).not.toContain('stroke-dasharray=')
  })

  it('uses parser OOXML only for geometry metadata without overriding parser colors', async () => {
    const xmlShape = __pptxImporterTestUtils.xmlShapeFromParserOoxml({
      name: '主题形状',
      ooxml: {
        preset: 'roundRect',
        textAnchor: 'ctr',
        textInsets: { top: 3, right: 4, bottom: 5, left: 6 },
        lineTailEnd: 'triangle'
      }
    })
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'shape-parser-ooxml-color',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      xmlShape,
      element: {
        left: 0,
        top: 0,
        width: 100,
        height: 50,
        fill: { type: 'color', value: '#305598' },
        borderColor: '#4474C5',
        borderWidth: 1,
        content: '<p>OK</p>'
      }
    })

    expect(xmlShape).toMatchObject({
      preset: 'roundRect',
      textAnchor: 'ctr',
      textInsets: { top: 3, right: 4, bottom: 5, left: 6 },
      tailEnd: 'triangle'
    })
    expect(xmlShape?.fillColor).toBeUndefined()
    expect(xmlShape?.lineColor).toBeUndefined()
    expect(html).toContain('fill="#305598"')
    expect(html).toContain('stroke="#4474C5"')
    expect(html).toContain('justify-content:center')
    expect(html).toContain('padding:6.0px 8.0px 10.0px 12.0px')
  })

  it('renders degenerate text-bearing shapes as text blocks', async () => {
    const html = await __pptxImporterTestUtils.buildShapeBlock({
      ...baseBlockArgs,
      blockId: 'text-degenerate-shape',
      imagesDir: os.tmpdir(),
      registry: { index: 0, byKey: new Map() },
      element: {
        left: 10,
        top: 20,
        width: 120,
        height: 30,
        path: 'M 0,0 L 120,0 Z',
        fill: { type: 'color', value: 'transparent' },
        borderColor: 'transparent',
        borderWidth: 0,
        content: '<p><span style="font-size:12pt">标题</span></p>'
      }
    })

    expect(html).toContain('<section data-block-id="text-degenerate-shape"')
    expect(html).toContain('>标题</span>')
    expect(html).not.toContain('data-pptx-kind="vector-shape"')
  })

  it('clips PPTX image fills to their vector paths', async () => {
    const imagesDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pptx-vector-fill-'))
    try {
      const html = await __pptxImporterTestUtils.buildShapeBlock({
        ...baseBlockArgs,
        blockId: 'shape-image',
        imagesDir,
        registry: { index: 0, byKey: new Map() },
        element: {
          left: 0,
          top: 0,
          width: 100,
          height: 50,
          path: 'M 0,0 L 133,0 L 66,67 z',
          fill: {
            type: 'image',
            value: {
              ref: 'pixel',
              base64:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              blob: '',
              opacity: 0.8
            }
          }
        }
      })

      expect(html).toContain('<clipPath')
      expect(html).toContain('<image href="./images/imported-0001.png"')
      expect(html).toContain('clip-path="url(#pptx-shape-image-clip)"')
      expect(await fs.promises.stat(path.join(imagesDir, 'imported-0001.png'))).toBeTruthy()
    } finally {
      await fs.promises.rm(imagesDir, { recursive: true, force: true })
    }
  })

  it('drops imported font declarations while preserving text styles', () => {
    const html = __pptxImporterTestUtils.sanitizeContentHtml(
      '<p><span style="font-family:方正大标宋简体;font-size:18pt;color:#ffffff">标题</span></p>',
      1
    )

    expect(html).toContain('font-size:18.0px')
    expect(html).toContain('color:#ffffff')
    expect(html).not.toContain('font-family')
  })

  it('converts imported Wingdings private-use glyphs to Unicode symbols', () => {
    const html = __pptxImporterTestUtils.sanitizeContentHtml(
      '<p><span style="font-family:微软雅黑 Light">副标题\uf0c4</span></p>',
      1
    )

    expect(html).toContain('副标题➜')
    expect(html).not.toContain('font-family')
    expect(html).not.toContain('\uf0c4')
  })

  it('fits 4:3 slides into the 16:9 canvas without stretching', () => {
    const fit = __pptxImporterTestUtils.resolveSlideFit({ width: 720, height: 540 })

    expect(fit.scale).toBeCloseTo(900 / 540)
    expect(fit.offsetX).toBeCloseTo(200)
    expect(fit.offsetY).toBeCloseTo(0)
  })

  it('preserves table dimensions, borders, merged cells, and stable cell ids', () => {
    const html = __pptxImporterTestUtils.buildTableBlock({
      ...baseBlockArgs,
      blockId: 'table-1',
      element: {
        left: 10,
        top: 20,
        width: 300,
        height: 120,
        colWidths: [80, 120],
        rowHeights: [24, 32],
        borders: {
          top: { borderColor: '#111111', borderWidth: 1, borderType: 'solid' }
        },
        data: [
          [
            {
              text: '<p style="font-weight:700">Header</p>',
              colSpan: 2,
              fillColor: '#eeeeee',
              fontColor: '#222222',
              borders: {
                bottom: { borderColor: '#333333', borderWidth: 2, borderType: 'dashed' }
              },
              vAlign: 'mid'
            },
            { text: 'merged continuation', hMerge: 1 }
          ],
          [{ text: 'A' }, { text: 'B', vAlign: 'down' }]
        ]
      }
    })

    expect(html).toContain('data-pptx-kind="table"')
    expect(html).toContain('data-pptx-import-mode="editable"')
    expect(html).toContain('background:transparent')
    expect(html).toContain('<col style="width:160.0px;" />')
    expect(html).toContain('<tr style="height:48.0px;">')
    expect(html).toContain('data-cell-id="r1-c1" colspan="2"')
    expect(html).toContain('border-bottom:4.0px dashed #333333')
    expect(html).toContain('vertical-align:middle')
    expect(html).toContain('vertical-align:bottom')
    expect(html).not.toContain('merged continuation')
  })

  it('preserves table placeholder spacing from form templates', () => {
    const html = __pptxImporterTestUtils.buildTableBlock({
      ...baseBlockArgs,
      blockId: 'table-form',
      element: {
        left: 0,
        top: 0,
        width: 240,
        height: 40,
        colWidths: [120, 120],
        rowHeights: [24],
        data: [
          [
            {
              text: '<p style="text-align:center"><span style="font-size:11pt;font-family:微软雅黑;font-weight:bold">完成（&nbsp;&nbsp;&nbsp;）&nbsp;</span></p>',
              vAlign: 'mid'
            },
            {
              text: '<p style="text-align:left"><span style="font-size:18pt;font-family:Aptos">&nbsp;</span></p>',
              vAlign: 'up'
            }
          ]
        ]
      }
    })

    expect(html).toContain('white-space:pre-wrap')
    expect(html).toContain('完成（&nbsp;&nbsp;&nbsp;）&nbsp;')
    expect(html).toContain('font-size:13.8px')
    expect(html).not.toContain('font-family')
    expect(html).toContain('&nbsp;</span>')
  })

  it('keeps empty table placeholders on a white surface', () => {
    const html = __pptxImporterTestUtils.buildTableBlock({
      ...baseBlockArgs,
      blockId: 'table-placeholder',
      element: {
        left: 0,
        top: 0,
        width: 240,
        height: 80,
        data: []
      }
    })

    expect(html).toContain('data-pptx-import-mode="placeholder"')
    expect(html).toContain('background:#fff')
    expect(html).toContain('表格已作为占位导入')
  })

  it('marks supported charts editable and simplifies area charts to filled lines', () => {
    const html = __pptxImporterTestUtils.buildChartBlock({
      element: {
        type: 'chart',
        chartType: 'areaChart',
        left: 0,
        top: 0,
        width: 320,
        height: 180,
        order: 1,
        colors: ['#1f77b4'],
        data: [
          {
            key: 'Revenue',
            values: [
              { x: 'Q1', y: 10 },
              { x: 'Q2', y: 16 }
            ],
            xlabels: {}
          }
        ]
      },
      blockId: 'chart-1',
      pageId: 'page-1',
      chartIndex: 1,
      scaleX: 1,
      scaleY: 1,
      zIndex: 2,
      offsetX: 0,
      offsetY: 0
    })

    expect(html).toContain('data-pptx-kind="chart"')
    expect(html).toContain('data-pptx-import-mode="editable"')
    expect(html).toContain('data-pptx-chart-type="areaChart"')
    expect(html).toContain('"type":"line"')
    expect(html).toContain('"fill":true')
  })

  it('converts paired x and y chart arrays into editable scatter charts', () => {
    const html = __pptxImporterTestUtils.buildChartBlock({
      element: {
        type: 'chart',
        chartType: 'scatterChart',
        left: 0,
        top: 0,
        width: 320,
        height: 180,
        order: 1,
        colors: ['#305598'],
        data: [
          [0, 1],
          [3584, 7825]
        ]
      } as never,
      blockId: 'chart-scatter',
      pageId: 'page-1',
      chartIndex: 2,
      scaleX: 1,
      scaleY: 1,
      zIndex: 2,
      offsetX: 0,
      offsetY: 0
    })

    expect(html).toContain('data-pptx-import-mode="editable"')
    expect(html).toContain('data-pptx-chart-type="scatterChart"')
    expect(html).toContain('"type":"scatter"')
    expect(html).toContain('"data":[{"x":0,"y":3584},{"x":1,"y":7825}]')
    expect(html).toContain('"showLine":true')
  })

  it('sorts imported elements by layer source and parser z-index metadata', () => {
    const master = {
      type: 'shape',
      order: 99,
      zIndex: 99,
      layer: { source: 'master', depth: 0, path: [99], zIndex: 99 }
    }
    const layout = {
      type: 'shape',
      order: 1,
      zIndex: 1,
      layer: { source: 'layout', depth: 0, path: [1], zIndex: 1 }
    }
    const slideBack = {
      type: 'shape',
      order: 50,
      zIndex: 2,
      layer: { source: 'slide', depth: 0, path: [2], zIndex: 2 }
    }
    const slideFront = {
      type: 'shape',
      order: 2,
      zIndex: 50,
      layer: { source: 'slide', depth: 0, path: [50], zIndex: 50 }
    }

    const sorted = [slideFront, master, slideBack, layout].sort(
      __pptxImporterTestUtils.compareElementsForRender
    )

    expect(sorted).toEqual([master, layout, slideBack, slideFront])
  })

  it('normalizes oversized nested group children into the group frame', () => {
    const flattened = __pptxImporterTestUtils.flattenElements([
      {
        type: 'group',
        left: 10,
        top: 20,
        width: 50,
        height: 40,
        elements: [
          {
            type: 'group',
            left: 0,
            top: 0,
            width: 100,
            height: 80,
            elements: [
              {
                type: 'shape',
                name: 'nested-card',
                left: 0,
                top: 0,
                width: 200,
                height: 160
              }
            ]
          }
        ]
      }
    ] as never)

    expect(flattened).toHaveLength(1)
    expect(flattened[0]).toMatchObject({
      left: 10,
      top: 20,
      width: 50,
      height: 40
    })
  })

  it('marks unsupported chart data as a placeholder with warnings', () => {
    const warnings: Array<{ pageNumber?: number; message: string }> = []
    const html = __pptxImporterTestUtils.buildChartBlock({
      element: {
        type: 'chart',
        chartType: 'stockChart',
        left: 0,
        top: 0,
        width: 320,
        height: 180,
        order: 1,
        colors: ['#1f77b4'],
        data: [
          [1, 2],
          [3, 4]
        ]
      } as never,
      blockId: 'chart-2',
      pageId: 'page-1',
      chartIndex: 2,
      scaleX: 1,
      scaleY: 1,
      zIndex: 2,
      offsetX: 0,
      offsetY: 0,
      pageNumber: 4,
      warnings
    })

    expect(html).toContain('data-pptx-import-mode="placeholder"')
    expect(html).toContain('data-pptx-chart-type="stockChart"')
    expect(warnings).toEqual([
      {
        pageNumber: 4,
        message: '图表 chart-2（stockChart）暂不支持结构化导入，已作为占位导入'
      }
    ])
  })
})
