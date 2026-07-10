// Icon path data sourced from lucide-react v0.574.0 (ISC).
// We inline the SVG node tuples so inserted icons render without the React runtime.

export type IconNodeTuple =
  | ['path', { d: string }]
  | ['circle', { cx: number; cy: number; r: number }]
  | ['ellipse', { cx: number; cy: number; rx: number; ry: number }]
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
    id: 'plus',
    label: 'Plus',
    nodes: [
      ['path', { d: 'M5 12h14' }],
      ['path', { d: 'M12 5v14' }]
    ]
  },
  {
    id: 'minus',
    label: 'Minus',
    nodes: [['path', { d: 'M5 12h14' }]]
  },
  {
    id: 'arrow-left',
    label: 'Arrow left',
    nodes: [
      ['path', { d: 'm12 19-7-7 7-7' }],
      ['path', { d: 'M19 12H5' }]
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
    id: 'arrow-up',
    label: 'Arrow up',
    nodes: [
      ['path', { d: 'm5 12 7-7 7 7' }],
      ['path', { d: 'M12 19V5' }]
    ]
  },
  {
    id: 'arrow-down',
    label: 'Arrow down',
    nodes: [
      ['path', { d: 'M12 5v14' }],
      ['path', { d: 'm19 12-7 7-7-7' }]
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
    id: 'chevron-left',
    label: 'Chevron left',
    nodes: [['path', { d: 'm15 18-6-6 6-6' }]]
  },
  {
    id: 'chevron-right',
    label: 'Chevron right',
    nodes: [['path', { d: 'm9 18 6-6-6-6' }]]
  },
  {
    id: 'chevron-up',
    label: 'Chevron up',
    nodes: [['path', { d: 'm18 15-6-6-6 6' }]]
  },
  {
    id: 'chevron-down',
    label: 'Chevron down',
    nodes: [['path', { d: 'm6 9 6 6 6-6' }]]
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
    id: 'circle-help',
    label: 'Help',
    nodes: [
      ['circle', { cx: 12, cy: 12, r: 10 }],
      ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }],
      ['path', { d: 'M12 17h.01' }]
    ]
  },
  {
    id: 'info',
    label: 'Info',
    nodes: [
      ['circle', { cx: 12, cy: 12, r: 10 }],
      ['path', { d: 'M12 16v-4' }],
      ['path', { d: 'M12 8h.01' }]
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
    id: 'clock',
    label: 'Clock',
    nodes: [
      ['circle', { cx: 12, cy: 12, r: 10 }],
      ['path', { d: 'M12 6v6l4 2' }]
    ]
  },
  {
    id: 'calendar',
    label: 'Calendar',
    nodes: [
      ['path', { d: 'M8 2v4' }],
      ['path', { d: 'M16 2v4' }],
      ['rect', { x: 3, y: 4, width: 18, height: 18, rx: 2 }],
      ['path', { d: 'M3 10h18' }]
    ]
  },
  {
    id: 'mail',
    label: 'Mail',
    nodes: [
      ['rect', { x: 2, y: 4, width: 20, height: 16, rx: 2 }],
      ['path', { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }]
    ]
  },
  {
    id: 'phone',
    label: 'Phone',
    nodes: [
      ['path', { d: 'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384' }]
    ]
  },
  {
    id: 'map-pin',
    label: 'Map pin',
    nodes: [
      ['path', { d: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0' }],
      ['circle', { cx: 12, cy: 10, r: 3 }]
    ]
  },
  {
    id: 'search',
    label: 'Search',
    nodes: [
      ['path', { d: 'm21 21-4.34-4.34' }],
      ['circle', { cx: 11, cy: 11, r: 8 }]
    ]
  },
  {
    id: 'link',
    label: 'Link',
    nodes: [
      ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
      ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }]
    ]
  },
  {
    id: 'download',
    label: 'Download',
    nodes: [
      ['path', { d: 'M12 15V3' }],
      ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
      ['path', { d: 'm7 10 5 5 5-5' }]
    ]
  },
  {
    id: 'upload',
    label: 'Upload',
    nodes: [
      ['path', { d: 'M12 3v12' }],
      ['path', { d: 'm17 8-5-5-5 5' }],
      ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }]
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
    id: 'chart-pie',
    label: 'Pie chart',
    nodes: [
      ['path', { d: 'M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951C12.449 1.996 12 2.449 12 3v8a1 1 0 0 0 1 1z' }],
      ['path', { d: 'M21.21 15.89A10 10 0 1 1 8 2.83' }]
    ]
  },
  {
    id: 'trending-up',
    label: 'Trending up',
    nodes: [
      ['path', { d: 'M16 7h6v6' }],
      ['path', { d: 'm22 7-8.5 8.5-5-5L2 17' }]
    ]
  },
  {
    id: 'database',
    label: 'Database',
    nodes: [
      ['ellipse', { cx: 12, cy: 5, rx: 9, ry: 3 }],
      ['path', { d: 'M3 5v14a9 3 0 0 0 18 0V5' }],
      ['path', { d: 'M3 12a9 3 0 0 0 18 0' }]
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
    id: 'folder',
    label: 'Folder',
    nodes: [
      ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z' }]
    ]
  },
  {
    id: 'book-open',
    label: 'Book open',
    nodes: [
      ['path', { d: 'M12 7v14' }],
      ['path', { d: 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' }]
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
    id: 'user-check',
    label: 'User check',
    nodes: [
      ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
      ['circle', { cx: 9, cy: 7, r: 4 }],
      ['path', { d: 'm16 11 2 2 4-4' }]
    ]
  },
  {
    id: 'shield-check',
    label: 'Shield check',
    nodes: [
      ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.68-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
      ['path', { d: 'm9 12 2 2 4-4' }]
    ]
  },
  {
    id: 'lock',
    label: 'Lock',
    nodes: [
      ['rect', { x: 3, y: 11, width: 18, height: 11, rx: 2 }],
      ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]
    ]
  },
  {
    id: 'globe',
    label: 'Globe',
    nodes: [
      ['circle', { cx: 12, cy: 12, r: 10 }],
      ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
      ['path', { d: 'M2 12h20' }]
    ]
  },
  {
    id: 'flag',
    label: 'Flag',
    nodes: [
      ['path', { d: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c4 0 5 2 8 2 1.3 0 2.3-.3 3-.7a1 1 0 0 1 1 0V15a1 1 0 0 1-.4.8A6 6 0 0 1 16 17c-4 0-5-2-8-2a6 6 0 0 0-4 1.3' }]
    ]
  },
  {
    id: 'trophy',
    label: 'Trophy',
    nodes: [
      ['path', { d: 'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21h10a5 5 0 0 0-2.024-3.018A2 2 0 0 1 14 16.286V14.66' }],
      ['path', { d: 'M18 9h1.5a1.5 1.5 0 0 0 0-3H18' }],
      ['path', { d: 'M6 9H4.5a1.5 1.5 0 0 1 0-3H6' }],
      ['path', { d: 'M6 2h12v7a6 6 0 0 1-12 0z' }]
    ]
  },
  {
    id: 'rocket',
    label: 'Rocket',
    nodes: [
      ['path', { d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z' }],
      ['path', { d: 'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z' }],
      ['path', { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0' }],
      ['path', { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' }]
    ]
  },
  {
    id: 'zap',
    label: 'Zap',
    nodes: [['path', { d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46L12 9h8a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46L12 14z' }]]
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
