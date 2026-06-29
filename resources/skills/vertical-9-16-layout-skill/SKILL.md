---
name: vertical-9-16-layout-skill
description: Must be read before creating, relaying out, or repairing 9:16 vertical Oh My PPT pages. Defines vertical-story composition, height budgeting, scan order, and anti-horizontal-PPT rules for 900x1600 canvases.
---

# Vertical 9:16 Layout Skill

This skill is the layout source of truth for `vertical-9-16` pages, usually 900x1600.

Do not use 16:9 PPT skeletons here. A 9:16 page is a vertical story canvas: it needs a clear top hook, a middle value zone, and a bottom conclusion or support area.

## Use this skill when

- The selected slide size is `vertical-9-16`
- The prompt says the canvas is 900x1600 or 9:16
- Creating, relaying out, or repairing a vertical story/page/poster slide

## Composition

1. Top hook/title: 15-25% of height.
2. Main visual/value zone: 45-60% of height.
3. Bottom takeaway/support: 15-25% of height.

Good structures:

- stacked story sections
- vertical timeline
- hero claim plus support cards
- one chart plus interpretation below
- numbered step stack
- before/after vertical pair

Avoid:

- wide 3-column dashboards
- horizontal timelines
- dense comparison tables
- bottom-only card rows copied from PPT
- tiny typography used to force a horizontal layout to fit

## Rules

- Use the full vertical canvas; do not leave the bottom half decorative and empty.
- Prefer one dominant focal object, then 2-4 supporting modules.
- Body text stays at least 18px; headings stay at least 24px.
- Use current canvas dimensions from the prompt, never 1600x900 defaults.
- Charts should be compact and vertically readable. Use the chart skill for API details and explicit chart frame height.
- If content is dense, summarize and group into rows or cards. Do not shrink text below the floor.

## Repair checklist

- If the page looks like a squeezed landscape slide, rebuild it as a vertical stack.
- If the lower canvas is empty, move takeaway/support content there.
- If a chart/table is unreadable, convert to a hero metric, rank list, compact bars, or grouped rows.
