import { describe, expect, it } from 'vitest'
import {
  addMasterGradientStop,
  buildDefaultMasterConfig,
  buildMasterCss,
  normalizeMasterConfig,
  parseMasterCss
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
      bodyFontSize: null
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
      bodyFontSize: null
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
      bodyFontSize: null
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

  it('migrates a non-default legacy page background into an overriding master', () => {
    expect(parseMasterCss(':root { --ppt-page-bg: #f1efea; }')).toMatchObject({
      backgroundColor: '#f1efea',
      backgroundMode: 'override'
    })
  })
})
