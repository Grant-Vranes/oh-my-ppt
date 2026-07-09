// Icon path data sourced from lucide-react v0.574.0 (ISC).
// We inline the SVG node tuples so inserted icons render without the React runtime.

export type IconNodeTuple =
  | ['path', { d: string }]
  | ['circle', { cx: number; cy: number; r: number }]
  | ['line', { x1: number; x2: number; y1: number; y2: number }]
  | ['rect', { x: number; y: number; width: number; height: number; rx?: number; ry?: number }]

export type IconDefinition =
  | {
      id: string
      label: string
      variant?: 'stroke'
      nodes: IconNodeTuple[]
    }
  | {
      id: string
      label: string
      variant: 'badge'
      badgeNumber: number
    }

/** All registry icons share lucide's 24x24 viewBox. */
export const ICON_VIEWBOX = 24

const STROKE_ICONS: IconDefinition[] = [
  {
    id: 'sparkles',
    label: 'Sparkles',
    nodes: [
      ['path', { d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z' }],
      ['path', { d: 'M20 2v4' }],
      ['path', { d: 'M22 4h-4' }],
      ['circle', { cx: 4, cy: 20, r: 2 }]
    ]
  },
  {
    id: 'star',
    label: 'Star',
    nodes: [
      ['path', { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' }]
    ]
  },
  {
    id: 'heart',
    label: 'Heart',
    nodes: [
      ['path', { d: 'M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5' }]
    ]
  },
  {
    id: 'check',
    label: 'Check',
    nodes: [['path', { d: 'M20 6 9 17l-5-5' }]]
  },
  {
    id: 'x',
    label: 'Close',
    nodes: [
      ['path', { d: 'M18 6 6 18' }],
      ['path', { d: 'm6 6 12 12' }]
    ]
  },
  {
    id: 'arrow-right',
    label: 'Arrow right',
    nodes: [
      ['path', { d: 'M5 12h14' }],
      ['path', { d: 'm12 5 7 7-7 7' }]
    ]
  },
  {
    id: 'arrow-up-right',
    label: 'Arrow up right',
    nodes: [
      ['path', { d: 'M7 7h10v10' }],
      ['path', { d: 'M7 17 17 7' }]
    ]
  },
  {
    id: 'circle-alert',
    label: 'Alert',
    nodes: [
      ['circle', { cx: 12, cy: 12, r: 10 }],
      ['line', { x1: 12, x2: 12, y1: 8, y2: 12 }],
      ['line', { x1: 12, x2: 12.01, y1: 16, y2: 16 }]
    ]
  },
  {
    id: 'lightbulb',
    label: 'Lightbulb',
    nodes: [
      ['path', { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' }],
      ['path', { d: 'M9 18h6' }],
      ['path', { d: 'M10 22h4' }]
    ]
  },
  {
    id: 'target',
    label: 'Target',
    nodes: [
      ['circle', { cx: 12, cy: 12, r: 10 }],
      ['circle', { cx: 12, cy: 12, r: 6 }],
      ['circle', { cx: 12, cy: 12, r: 2 }]
    ]
  },
  {
    id: 'chart-column',
    label: 'Chart',
    nodes: [
      ['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }],
      ['path', { d: 'M18 17V9' }],
      ['path', { d: 'M13 17V5' }],
      ['path', { d: 'M8 17v-3' }]
    ]
  },
  {
    id: 'image',
    label: 'Image',
    nodes: [
      ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2, ry: 2 }],
      ['circle', { cx: 9, cy: 9, r: 2 }],
      ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }]
    ]
  },
  {
    id: 'video',
    label: 'Video',
    nodes: [
      ['path', { d: 'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5' }],
      ['rect', { x: 2, y: 6, width: 14, height: 12, rx: 2 }]
    ]
  },
  {
    id: 'file-text',
    label: 'File',
    nodes: [
      ['path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' }],
      ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
      ['path', { d: 'M10 9H8' }],
      ['path', { d: 'M16 13H8' }],
      ['path', { d: 'M16 17H8' }]
    ]
  },
  {
    id: 'users',
    label: 'Users',
    nodes: [
      ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
      ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
      ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
      ['circle', { cx: 9, cy: 7, r: 4 }]
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    nodes: [
      ['path', { d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915' }],
      ['circle', { cx: 12, cy: 12, r: 3 }]
    ]
  }
]

/** Numbered solid badges 1-9, common for step / process slides. */
const NUMBER_BADGES: IconDefinition[] = Array.from({ length: 9 }, (_, i) => ({
  id: `number-${i + 1}`,
  label: `Number ${i + 1}`,
  variant: 'badge' as const,
  badgeNumber: i + 1
}))

export const ICON_LIST: IconDefinition[] = [...STROKE_ICONS, ...NUMBER_BADGES]

const ICON_REGISTRY: Record<string, IconDefinition> = Object.fromEntries(
  ICON_LIST.map((icon) => [icon.id, icon])
)

export function getIconDefinition(iconId: string): IconDefinition | undefined {
  return ICON_REGISTRY[iconId]
}

export function isRegisteredIconId(iconId: string): boolean {
  return Boolean(ICON_REGISTRY[iconId])
}

/** Outer <svg> attributes for the given icon variant. */
export function iconOuterSvgAttrs(def: IconDefinition): string {
  if (def.variant === 'badge') {
    // Badge: outer svg is just a coordinate frame; the inner circle uses currentColor fill.
    return 'fill="none"'
  }
  return 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
}

/** Serialize an icon's inner SVG markup. Shared by the builder and the picker preview. */
export function serializeIconInner(def: IconDefinition): string {
  if (def.variant === 'badge') {
    const n = def.badgeNumber
    return `<circle cx="12" cy="12" r="10" fill="currentColor" /><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" stroke="none" font-family="inherit">${n}</text>`
  }
  return def.nodes
    .map(([tag, attrs]) => {
      const parts = Object.entries(attrs).map(([key, value]) => `${key}="${value}"`)
      return `<${tag} ${parts.join(' ')} />`
    })
    .join('')
}
