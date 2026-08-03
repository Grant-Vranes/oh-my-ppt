import { describe, expect, it } from 'vitest'
import {
  addMasterGradientStop,
  buildDefaultMasterConfig,
  buildMasterCss,
  buildMasterElementsHtml,
  normalizeMasterConfig,
  normalizeMasterElementsConfig,
  parseMasterCss,
  parseMasterElementsHtml
} from '../../../src/shared/master'
import { createDefaultMasterGradient } from '../../../src/shared/master'

describe('slide master config', () => {
  it('keeps the default master visually inert except for the existing white canvas', () => {
    const config = buildDefaultMasterConfig()
    const css = buildMasterCss(config)

    expect(config).toEqual({
      backgroundColor: '#ffffff',
      backgroundMode: 'inherit',
      backgroundStyle: 'solid',
      backgroundGradient: createDefaultMasterGradient(),
      backgroundImage: null,
      titleFontPreset: 'inherit',
      bodyFontPreset: 'inherit',
      titleFontFamily: null,
      bodyFontFamily: null,
      titleFontSize: null,
      bodyFontSize: null,
      elements: {
        logoImage: null,
        footerText: '',
        watermarkText: '',
        showLogo: false,
        showFooter: false,
        showPageNumber: false,
        showWatermark: false,
        footerFontSize: 16,
        pageNumberFontSize: 16,
        footerColor: '#334155',
        pageNumberColor: '#334155',
        watermarkRotation: -24,
        watermarkSizeAuto: true,
        logoPosition: { x: 5, y: 5 },
        footerPosition: { x: 5, y: 91 },
        pageNumberPosition: { x: 90, y: 91 },
        watermarkPosition: { x: 30, y: 42 },
        logoSize: { width: 16, height: 10 },
        footerSize: { width: 56, height: 5 },
        pageNumberSize: { width: 6, height: 5 },
        watermarkSize: { width: 40, height: 16 }
      }
    })
    expect(css).toContain('--ppt-page-bg: #ffffff;')
    expect(css).not.toContain('--ppt-master-slide-background')
    expect(css).not.toContain('--ppt-master-title-font')
    expect(css).not.toContain('--ppt-master-body-font')
  })

  it('round trips every supported structured value', () => {
    const config = {
      backgroundColor: '#1A2b3C',
      backgroundMode: 'override' as const,
      backgroundStyle: 'gradient' as const,
      backgroundGradient: {
        type: 'linear' as const,
        angle: 210,
        stops: [
          { color: '#1a2b3c', position: 0 },
          { color: '#e0f2fe', position: 100 }
        ]
      },
      titleFontPreset: 'serif' as const,
      bodyFontPreset: 'mono' as const,
      titleFontFamily: null,
      bodyFontFamily: null,
      titleFontSize: null,
      bodyFontSize: null,
      elements: {
        logoImage: null,
        footerText: '',
        watermarkText: '',
        showLogo: false,
        showFooter: false,
        showPageNumber: false,
        showWatermark: false,
        footerFontSize: 16,
        pageNumberFontSize: 16,
        footerColor: '#334155',
        pageNumberColor: '#334155',
        watermarkRotation: -24,
        watermarkSizeAuto: true,
        logoPosition: { x: 5, y: 5 },
        footerPosition: { x: 5, y: 91 },
        pageNumberPosition: { x: 90, y: 91 },
        watermarkPosition: { x: 30, y: 42 },
        logoSize: { width: 16, height: 10 },
        footerSize: { width: 56, height: 5 },
        pageNumberSize: { width: 6, height: 5 },
        watermarkSize: { width: 40, height: 16 }
      }
    }

    expect(parseMasterCss(buildMasterCss(config))).toEqual({
      backgroundColor: '#1a2b3c',
      backgroundMode: 'override',
      backgroundStyle: 'gradient',
      backgroundGradient: {
        type: 'linear',
        angle: 210,
        stops: [
          { color: '#1a2b3c', position: 0 },
          { color: '#e0f2fe', position: 100 }
        ]
      },
      backgroundImage: null,
      titleFontPreset: 'serif',
      bodyFontPreset: 'mono',
      titleFontFamily: null,
      bodyFontFamily: null,
      titleFontSize: null,
      bodyFontSize: null,
      elements: {
        logoImage: null,
        footerText: '',
        watermarkText: '',
        showLogo: false,
        showFooter: false,
        showPageNumber: false,
        showWatermark: false,
        footerFontSize: 16,
        pageNumberFontSize: 16,
        footerColor: '#334155',
        pageNumberColor: '#334155',
        watermarkRotation: -24,
        watermarkSizeAuto: true,
        logoPosition: { x: 5, y: 5 },
        footerPosition: { x: 5, y: 91 },
        pageNumberPosition: { x: 90, y: 91 },
        watermarkPosition: { x: 30, y: 42 },
        logoSize: { width: 16, height: 10 },
        footerSize: { width: 56, height: 5 },
        pageNumberSize: { width: 6, height: 5 },
        watermarkSize: { width: 40, height: 16 }
      }
    })
  })

  it('drops unsafe colors, arbitrary font families, and malformed CSS back to safe defaults', () => {
    expect(
      normalizeMasterConfig({
        backgroundColor: 'linear-gradient(red, blue)',
        backgroundMode: 'always',
        backgroundStyle: 'conic',
        backgroundGradient: { type: 'conic', stops: [] },
        titleFontPreset: 'rounded',
        bodyFontPreset: 'Comic Sans MS'
      })
    ).toEqual(buildDefaultMasterConfig())
    expect(parseMasterCss('body { color: red; }')).toEqual(buildDefaultMasterConfig())
  })

  it('migrates legacy global-element anchors and keeps elements inside the canvas', () => {
    expect(
      normalizeMasterElementsConfig({
        logoImage: null,
        footerText: 'Acme',
        watermarkText: '',
        showPageNumber: true,
        logoPosition: { x: 130.789, y: -3 }
      })
    ).toMatchObject({
      showLogo: false,
      showFooter: true,
      showPageNumber: true,
      showWatermark: false,
      logoPosition: { x: 84, y: 0 },
      footerPosition: { x: 5, y: 91 },
      pageNumberPosition: { x: 90, y: 91 },
      watermarkPosition: { x: 30, y: 42 },
      logoSize: { width: 16, height: 10 },
      footerSize: { width: 56, height: 5 },
      pageNumberSize: { width: 6, height: 5 },
      watermarkSize: { width: 40, height: 16 }
    })
  })

  it('defaults every global element to hidden and bounds persisted element dimensions', () => {
    expect(normalizeMasterElementsConfig({})).toMatchObject({
      showLogo: false,
      showFooter: false,
      showPageNumber: false,
      showWatermark: false
    })
    expect(
      normalizeMasterElementsConfig({
        showPageNumber: true,
        logoSize: { width: 130, height: -3 },
        logoPosition: { x: 99, y: 99 }
      })
    ).toMatchObject({
      logoSize: { width: 100, height: 1 },
      logoPosition: { x: 0, y: 99 }
    })
  })

  it('always builds the fixed global-elements layer after legacy visibility settings are normalized', () => {
    const html = buildMasterElementsHtml({
      enabled: false,
      logoImage: null,
      footerText: '',
      watermarkText: '',
      showPageNumber: true
    })

    expect(html).toContain('data-ppt-master-elements-layer="1"')
    expect(html).toContain('z-index:2147483647 !important')
    expect(parseMasterElementsHtml(html)).not.toHaveProperty('enabled')
  })

  it('does not generate hidden global-element nodes', () => {
    const html = buildMasterElementsHtml({
      logoImage: './images/brand.png',
      footerText: 'Acme',
      watermarkText: 'INTERNAL',
      showLogo: false,
      showFooter: false,
      showPageNumber: false,
      showWatermark: false
    })

    expect(html).not.toMatch(/<img\b[^>]*data-ppt-master-logo-image/)
    expect(html).not.toMatch(/<div\b[^>]*data-ppt-master-footer/)
    expect(html).not.toMatch(/<div\b[^>]*data-ppt-master-page-number/)
    expect(html).not.toMatch(/<div\b[^>]*data-ppt-master-watermark/)
  })

  it('overrides the generated page content root and the existing page font variables', () => {
    const css = buildMasterCss({
      backgroundColor: '#112233',
      backgroundMode: 'override',
      backgroundStyle: 'solid',
      backgroundGradient: createDefaultMasterGradient(),
      titleFontPreset: 'serif',
      bodyFontPreset: 'sans'
    })

    expect(css).toContain('--ppt-master-slide-background: #112233;')
    expect(css).toContain('--ppt-title-font: ui-serif, Georgia')
    expect(css).toContain('--ppt-body-font: system-ui, -apple-system')
    expect(css).toContain('.ppt-page-content > [data-page-scaffold="1"] > [data-role="content"]')
    expect(css).toContain('background: var(--ppt-master-slide-background) !important;')
  })

  it('serializes explicit font families and independent title and body size overrides', () => {
    const css = buildMasterCss(
      {
        backgroundColor: '#ffffff',
        backgroundMode: 'inherit',
        backgroundStyle: 'solid',
        backgroundGradient: createDefaultMasterGradient(),
        titleFontPreset: 'inherit',
        bodyFontPreset: 'inherit',
        titleFontFamily: 'Noto Sans SC',
        bodyFontFamily: 'Merriweather',
        titleFontSize: 56,
        bodyFontSize: 22
      },
      '@font-face{font-family:"Noto Sans SC";src:url("./assets/fonts/google-fonts/NotoSansSC/test.woff2")}'
    )

    expect(css).toContain('@font-face{font-family:"Noto Sans SC";')
    expect(css).toContain('--ppt-master-title-font: "Noto Sans SC";')
    expect(css).toContain('--ppt-master-body-font: "Merriweather";')
    expect(css).toContain('--ppt-master-title-font-size: 56px;')
    expect(css).toContain('--ppt-master-body-font-size: 22px;')
    expect(css).toContain('font-size: var(--ppt-master-title-font-size) !important;')
    expect(css).toContain('font-size: var(--ppt-master-body-font-size) !important;')
    expect(parseMasterCss(css)).toMatchObject({
      titleFontFamily: 'Noto Sans SC',
      bodyFontFamily: 'Merriweather',
      titleFontSize: 56,
      bodyFontSize: 22
    })
  })

  it('serializes a structured gradient through the SDK and reads it back without accepting raw CSS', () => {
    const css = buildMasterCss({
      backgroundColor: '#112233',
      backgroundMode: 'override',
      backgroundStyle: 'gradient',
      backgroundGradient: {
        type: 'radial',
        angle: 45,
        stops: [
          { color: '#fef3c7', position: 0 },
          { color: '#d97706', position: 72 },
          { color: '#7c2d12', position: 100 }
        ]
      },
      titleFontPreset: 'inherit',
      bodyFontPreset: 'inherit'
    })

    expect(css).toContain('--ppt-master-background-style: gradient;')
    expect(css).toContain(
      '--ppt-master-slide-background: radial-gradient(circle at center, #fef3c7 0%, #d97706 72%, #7c2d12 100%);'
    )
    expect(parseMasterCss(css)).toMatchObject({
      backgroundMode: 'override',
      backgroundStyle: 'gradient',
      backgroundGradient: {
        type: 'radial',
        stops: [
          { color: '#fef3c7', position: 0 },
          { color: '#d97706', position: 72 },
          { color: '#7c2d12', position: 100 }
        ]
      }
    })
  })

  it('serializes a session image background with cover positioning and reads it back', () => {
    const css = buildMasterCss({
      backgroundColor: '#ffffff',
      backgroundMode: 'override',
      backgroundStyle: 'image',
      backgroundGradient: createDefaultMasterGradient(),
      backgroundImage: './images/master-background.png',
      titleFontPreset: 'inherit',
      bodyFontPreset: 'inherit',
      titleFontFamily: null,
      bodyFontFamily: null,
      titleFontSize: null,
      bodyFontSize: null
    })

    expect(css).toContain('--ppt-master-background-style: image;')
    expect(css).toContain('--ppt-master-background-image: url("./images/master-background.png");')
    expect(css).toContain(
      '--ppt-master-slide-background: url("./images/master-background.png") center center / cover no-repeat;'
    )
    expect(parseMasterCss(css)).toMatchObject({
      backgroundMode: 'override',
      backgroundStyle: 'image',
      backgroundImage: './images/master-background.png'
    })
  })

  it('drops unsafe image references instead of serializing a page-external URL', () => {
    expect(
      normalizeMasterConfig({
        ...buildDefaultMasterConfig(),
        backgroundMode: 'override',
        backgroundStyle: 'image',
        backgroundImage: '../outside.png'
      })
    ).toMatchObject({ backgroundStyle: 'solid', backgroundImage: null })
    expect(
      normalizeMasterConfig({
        ...buildDefaultMasterConfig(),
        backgroundMode: 'override',
        backgroundStyle: 'image',
        backgroundImage: 'https://example.com/background.png'
      })
    ).toMatchObject({ backgroundStyle: 'solid', backgroundImage: null })
  })

  it('inserts a stop at the requested position with an interpolated color', () => {
    expect(
      addMasterGradientStop(
        {
          type: 'linear',
          angle: 90,
          stops: [
            { color: '#ff0000', position: 0 },
            { color: '#0000ff', position: 100 }
          ]
        },
        25
      )
    ).toMatchObject({
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#bf0040', position: 25 },
        { color: '#0000ff', position: 100 }
      ]
    })
  })

  it('parses a non-default page background as an overriding master', () => {
    expect(parseMasterCss(':root { --ppt-page-bg: #f1efea; }')).toMatchObject({
      backgroundColor: '#f1efea',
      backgroundMode: 'override'
    })
  })

  it('builds an inert, structured global-elements fragment without accepting raw HTML', () => {
    const html = buildMasterElementsHtml({
      logoImage: './images/brand.png',
      footerText: '<b>Acme</b> 2026',
      watermarkText: 'INTERNAL',
      showLogo: true,
      showFooter: true,
      showPageNumber: true,
      showWatermark: true,
      footerFontSize: 18,
      pageNumberFontSize: 14,
      footerColor: '#0f766e',
      pageNumberColor: '#7c2d12',
      watermarkRotation: 28,
      watermarkSizeAuto: true,
      logoPosition: { x: 12.5, y: 9 },
      footerPosition: { x: 8, y: 89 },
      pageNumberPosition: { x: 90, y: 89 },
      watermarkPosition: { x: 30, y: 42 },
      logoSize: { width: 20, height: 12 },
      footerSize: { width: 56, height: 5 },
      pageNumberSize: { width: 6, height: 5 },
      watermarkSize: { width: 40, height: 16 }
    })

    expect(html).toContain('data-ppt-master-elements="1"')
    expect(html).toContain('data-ppt-master-elements-layer="1"')
    expect(html).toContain('data-ppt-master-page-number="1"')
    expect(html).toContain('style="left:12.5%;top:9%;width:20%;height:12%;"')
    expect(html).toContain('font-size:18px;color:#0f766e;')
    expect(html).toContain('font-size:14px;color:#7c2d12;')
    expect(html).toContain('data-ppt-master-watermark-height="16"')
    expect(html).toContain('transform:rotate(28deg);')
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt; 2026')
    expect(parseMasterElementsHtml(html)).toEqual({
      logoImage: './images/brand.png',
      footerText: '<b>Acme</b> 2026',
      watermarkText: 'INTERNAL',
      showLogo: true,
      showFooter: true,
      showPageNumber: true,
      showWatermark: true,
      footerFontSize: 18,
      pageNumberFontSize: 14,
      footerColor: '#0f766e',
      pageNumberColor: '#7c2d12',
      watermarkRotation: 28,
      watermarkSizeAuto: true,
      logoPosition: { x: 12.5, y: 9 },
      footerPosition: { x: 8, y: 89 },
      pageNumberPosition: { x: 90, y: 89 },
      watermarkPosition: { x: 30, y: 42 },
      logoSize: { width: 20, height: 12 },
      footerSize: { width: 56, height: 5 },
      pageNumberSize: { width: 6, height: 5 },
      watermarkSize: { width: 40, height: 16 }
    })
  })
})
