import { escapeHtmlText } from './utils'

export const ART_TEXT_TEMPLATES = [
  { id: 'gradient-shine', label: '01 流光溢彩', defaultText: 'LIGHT FLOW' },
  { id: 'neon-glow', label: '02 赛博霓虹', defaultText: 'NEON CYBER' },
  { id: 'shadow-3d', label: '03 硬核3D', defaultText: '3D DEPTH' },
  { id: 'wave-text', label: '04 波浪律动', defaultText: 'WAVE 动感' },
  { id: 'stroke-text', label: '05 科技描边', defaultText: 'HOLLOW OUT' },
  { id: 'typewriter', label: '06 经典打字机', defaultText: 'Typing...' },
  { id: 'glitch', label: '07 故障干扰', defaultText: 'GLITCH FX' },
  { id: 'fire-text', label: '08 烈焰灼烧', defaultText: 'BLAZING HOT' },
  { id: 'glass-text', label: '09 毛玻璃高级感', defaultText: 'Frosted Glass' },
  { id: 'rotate-3d', label: '10 立体旋转', defaultText: '3D ROTATE' },
  { id: 'rainbow', label: '11 彩虹变色龙', defaultText: 'RAINBOW' },
  { id: 'liquid', label: '12 液态幻彩', defaultText: 'LIQUID ART' },
  { id: 'bounce-text', label: '13 弹性跳跃', defaultText: 'BOUNCE!' },
  { id: 'float-shadow', label: '14 悬浮梦境', defaultText: 'FLOAT SOFTLY' },
  { id: 'metal-text', label: '15 金属质感', defaultText: 'METAL BRUSH' }
] as const

export type ArtTextTemplateId = (typeof ART_TEXT_TEMPLATES)[number]['id']

type ArtTextTemplate = (typeof ART_TEXT_TEMPLATES)[number]

export type ArtTextLayout = {
  blockId: string
  left: number
  top: number
  width: number
  minHeight: number
  zIndex: number
  text?: string
}

const templateById = new Map<ArtTextTemplateId, ArtTextTemplate>(
  ART_TEXT_TEMPLATES.map((template) => [template.id, template])
)

export function isArtTextTemplateId(value: string | undefined): value is ArtTextTemplateId {
  return Boolean(value && templateById.has(value as ArtTextTemplateId))
}

export function getArtTextTemplateLabel(value: string | undefined): string {
  return isArtTextTemplateId(value) ? templateById.get(value)?.label || '' : ''
}

function escapeCssAttribute(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .replace(/</g, '\\3C ')
    .replace(/>/g, '\\3E ')
}

function styleAttr(styles: string[]): string {
  return escapeHtmlText(styles.join('; '))
}

function buildBaseStyle(layout: ArtTextLayout): string {
  return styleAttr([
    'position:absolute',
    `left:${layout.left}px`,
    `top:${layout.top}px`,
    `width:${layout.width}px`,
    `min-height:${layout.minHeight}px`,
    'margin:0',
    'padding:0',
    `z-index:${layout.zIndex}`,
    'box-sizing:border-box',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'overflow:visible',
    'text-align:center',
    'line-height:1.15',
    'letter-spacing:0',
    'white-space:normal',
    'overflow-wrap:anywhere',
    'font-family:inherit',
    'font-size:54px',
    'font-weight:800',
    'color:#18181b'
  ])
}

function buildWaveText(text: string): string {
  const chars = Array.from(text)
  return chars
    .map((char, index) => {
      if (char === ' ') return '<span class="ppt-art-wave-space">&nbsp;</span>'
      return `<span class="ppt-art-wave-char" style="animation-delay:${index * 0.08}s">${escapeHtmlText(char)}</span>`
    })
    .join('')
}

function escapeStyleText(value: string): string {
  return value.replace(/<\/style/gi, '<\\/style')
}

function buildTextNode(template: ArtTextTemplate, text: string): string {
  const safeText = escapeHtmlText(text)

  if (template.id === 'wave-text') {
    return `<span class="ppt-art-text ppt-art-wave-line">${buildWaveText(text)}</span>`
  }

  if (template.id === 'typewriter') {
    return `<span class="ppt-art-typewriter-wrapper"><span class="ppt-art-text">${safeText}</span></span>`
  }

  if (template.id === 'glitch') {
    return `<span class="ppt-art-text" data-text="${safeText}">${safeText}</span>`
  }

  return `<span class="ppt-art-text">${safeText}</span>`
}

export function buildArtTextInnerHtml(templateId: ArtTextTemplateId, text: string): string {
  const template = templateById.get(templateId) || ART_TEXT_TEMPLATES[0]
  return buildTextNode(template, text || template.defaultText)
}

function buildTemplateCss(templateId: ArtTextTemplateId, blockId: string): string {
  const scope = `[data-block-id="${escapeCssAttribute(blockId)}"]`
  const base = `
${scope} .ppt-art-text {
  display: inline-block;
  max-width: 100%;
  box-sizing: border-box;
}
${scope} .ppt-art-wave-line {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
${scope} .ppt-art-wave-char,
${scope} .ppt-art-wave-space {
  display: inline-block;
  font-size: inherit;
  font-weight: inherit;
}
`

  switch (templateId) {
    case 'gradient-shine':
      return `${base}
${scope} .ppt-art-text {
  background: linear-gradient(135deg, #ffd89b, #c7e9fb, #f6d5f7, #a0e9ff);
  background-size: 300% 300%;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation: pptArtFlowGradient 6s ease infinite;
}
@keyframes pptArtFlowGradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
`
    case 'neon-glow':
      return `${base}
${scope} .ppt-art-text {
  color: #0ff;
  text-shadow: 0 0 5px #0ff, 0 0 10px #0ff, 0 0 20px #0ff, 0 0 40px #00aaff;
  animation: pptArtNeonPulse 1.2s ease-in-out infinite alternate;
}
@keyframes pptArtNeonPulse {
  0% { text-shadow: 0 0 2px #0ff, 0 0 5px #0ff, 0 0 10px #0aa; opacity: 0.9; }
  100% { text-shadow: 0 0 8px #0ff, 0 0 20px #0ff, 0 0 35px #0cf; opacity: 1; }
}
`
    case 'shadow-3d':
      return `${base}
${scope} .ppt-art-text {
  color: #f3b33d;
  text-shadow: 1px 1px 0 #7a4c1a, 2px 2px 0 #6b4215, 3px 3px 0 #5a3710, 4px 4px 0 #482d0c, 5px 5px 0 #362208, 6px 6px 0 #241705;
}
`
    case 'wave-text':
      return `${base}
${scope} .ppt-art-text {
  color: #18181b;
  text-shadow: 0 2px 8px rgba(52, 64, 44, 0.18);
}
${scope} .ppt-art-wave-char {
  animation: pptArtWaveFloat 1.4s infinite ease-in-out;
}
@keyframes pptArtWaveFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
`
    case 'stroke-text':
      return `${base}
${scope} .ppt-art-text {
  color: transparent;
  -webkit-text-stroke: 2px #00e0ff;
  text-stroke: 2px #00e0ff;
  text-shadow: 0 0 12px rgba(0, 255, 255, 0.3);
}
`
    case 'typewriter':
      return `${base}
${scope} .ppt-art-typewriter-wrapper {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
}
${scope} .ppt-art-text {
  overflow: hidden;
  white-space: nowrap;
  border-right: 3px solid #f0f;
  color: #18181b;
  text-shadow: 0 2px 8px rgba(52, 64, 44, 0.18);
  animation: pptArtTyping 3s steps(20, end) infinite, pptArtBlinkCursor 0.75s step-end infinite;
}
@keyframes pptArtTyping {
  0% { width: 0; }
  40% { width: 100%; }
  80% { width: 100%; }
  100% { width: 0; }
}
@keyframes pptArtBlinkCursor {
  0%, 100% { border-color: #f0f; }
  50% { border-color: transparent; }
}
`
    case 'glitch':
      return `${base}
${scope} .ppt-art-text {
  position: relative;
  color: #1f2633;
  text-shadow: 0.05em 0 0 rgba(255, 0, 0, 0.75), -0.05em -0.025em 0 rgba(0, 180, 255, 0.75), 0 2px 8px rgba(31, 38, 51, 0.18);
  animation: pptArtGlitchShake 0.3s infinite;
}
${scope} .ppt-art-text::before,
${scope} .ppt-art-text::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: transparent;
}
${scope} .ppt-art-text::before {
  left: 2px;
  text-shadow: -2px 0 red;
  clip: rect(24px, 550px, 44px, 0);
  animation: pptArtGlitchClip 3s infinite linear alternate-reverse;
}
${scope} .ppt-art-text::after {
  left: -2px;
  text-shadow: -2px 0 blue;
  clip: rect(85px, 550px, 140px, 0);
  animation: pptArtGlitchClip 2.5s infinite linear alternate-reverse;
}
@keyframes pptArtGlitchShake {
  0% { transform: translate(0); }
  20% { transform: translate(-1px, 1px); }
  40% { transform: translate(-1px, -1px); }
  60% { transform: translate(1px, 1px); }
  80% { transform: translate(1px, -1px); }
  100% { transform: translate(0); }
}
@keyframes pptArtGlitchClip {
  0% { clip: rect(31px, 9999px, 44px, 0); }
  50% { clip: rect(78px, 9999px, 112px, 0); }
  100% { clip: rect(12px, 9999px, 70px, 0); }
}
`
    case 'fire-text':
      return `${base}
${scope} .ppt-art-text {
  background-image: linear-gradient(0deg, #ff4d00, #ff9900, #ffcc00);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  text-shadow: 0 0 10px #ff7b00, 0 0 20px #ff4400;
  animation: pptArtFireFlicker 0.2s infinite alternate;
}
@keyframes pptArtFireFlicker {
  0% { opacity: 0.95; text-shadow: 0 0 8px #ff5500; }
  100% { opacity: 1; text-shadow: 0 0 15px #ffaa33, 0 0 5px #ff3300; }
}
`
    case 'glass-text':
      return `${base}
${scope} .ppt-art-text {
  background: rgba(31, 38, 51, 0.54);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 10px 20px;
  border-radius: 60px;
  color: #fff3cf;
  font-weight: 700;
  box-shadow: 0 6px 22px rgba(31, 38, 51, 0.22);
  border: 1px solid rgba(31, 38, 51, 0.18);
}
`
    case 'rotate-3d':
      return `${base}
${scope} {
  perspective: 800px;
}
${scope} .ppt-art-text {
  transform-style: preserve-3d;
  animation: pptArtRotateText 5s infinite linear;
  color: #fe9c8f;
  text-shadow: 0 2px 8px rgba(31, 38, 51, 0.18);
}
@keyframes pptArtRotateText {
  0% { transform: rotateY(0deg); }
  100% { transform: rotateY(360deg); }
}
`
    case 'rainbow':
      return `${base}
${scope} .ppt-art-text {
  animation: pptArtRainbowColor 2s linear infinite;
}
@keyframes pptArtRainbowColor {
  0% { color: #ff0000; }
  17% { color: #ff9900; }
  33% { color: #ffff00; }
  50% { color: #00ff00; }
  67% { color: #0099ff; }
  83% { color: #8b00ff; }
  100% { color: #ff0000; }
}
`
    case 'liquid':
      return `${base}
${scope} .ppt-art-text {
  background: linear-gradient(45deg, #ff6bcb, #ffb86c, #2ed8ff, #ff6bcb);
  background-size: 400% 400%;
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  animation: pptArtLiquidMove 5s ease infinite;
}
@keyframes pptArtLiquidMove {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
`
    case 'bounce-text':
      return `${base}
${scope} .ppt-art-text {
  animation: pptArtTextBounce 1.2s ease infinite;
  transform-origin: center;
  color: #18181b;
  text-shadow: 0 2px 8px rgba(52, 64, 44, 0.18);
}
@keyframes pptArtTextBounce {
  0%, 100% { transform: scale(1); letter-spacing: 0; }
  50% { transform: scale(1.08); letter-spacing: 4px; color: #b8860b; }
}
`
    case 'float-shadow':
      return `${base}
${scope} .ppt-art-text {
  color: #18181b;
  animation: pptArtFloatUp 2.6s infinite alternate;
  text-shadow: 0 10px 15px rgba(52, 64, 44, 0.22);
}
@keyframes pptArtFloatUp {
  0% { transform: translateY(0); text-shadow: 0 5px 12px rgba(52, 64, 44, 0.18); }
  100% { transform: translateY(-8px); text-shadow: 0 20px 25px rgba(52, 64, 44, 0.34); }
}
`
    case 'metal-text':
      return `${base}
${scope} .ppt-art-text {
  background: linear-gradient(135deg, #e8e8e8 0%, #a0a0b0 40%, #f5f5ff 50%, #b0b0c0 80%, #dfdfdf 100%);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  filter: drop-shadow(0 1px 1px rgba(31, 38, 51, 0.42)) drop-shadow(0 3px 7px rgba(31, 38, 51, 0.18));
}
`
    default:
      return base
  }
}

export function buildArtTextHtmlFragment(
  templateId: ArtTextTemplateId,
  layout: ArtTextLayout
): string {
  const template = templateById.get(templateId) || ART_TEXT_TEMPLATES[0]
  const text = layout.text || template.defaultText
  const baseStyle = buildBaseStyle(layout)
  const css = escapeStyleText(buildTemplateCss(template.id, layout.blockId).trim())
  const content = buildArtTextInnerHtml(template.id, text)

  return [
    `<style data-ppt-art-text-style="${escapeHtmlText(layout.blockId)}">${css}</style>`,
    `<div data-block-id="${escapeHtmlText(layout.blockId)}" data-ppt-art-text="${template.id}" style="${baseStyle};">${content}</div>`
  ].join('')
}
