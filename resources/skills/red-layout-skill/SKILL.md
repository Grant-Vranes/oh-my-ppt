---
name: red-layout-skill
description: Must be read before creating, relaying out, or repairing Xiaohongshu/red-note canvas pages. Defines social-note layout, cover-like hierarchy, vertical information flow, hook/body/takeaway composition, and anti-PPT rules.
---

# Red Layout Skill

This skill is the layout source of truth for **Xiaohongshu/red-note pages**.

Do not use 16:9 PPT layout patterns here. A red-note canvas is closer to a social image note: it needs a strong hook, readable vertical rhythm, screenshot/card/poster feel, and fast scanning in a feed.

## When to use

- The selected slide size is `xiaohongshu-note`
- The canvas is 1242×1660 or otherwise explicitly Xiaohongshu/red-note
- Creating, relaying out, or repairing a red-note style HTML page

## When not to use

- 16:9 PPT slides — use `oh-my-ppt-layout`
- 9:16 vertical canvases — use `vertical-9-16-layout-skill`
- 4:3 standard canvases — use `standard-4-3-layout-skill`
- 1:1 square canvases — use `square-1-1-layout-skill`
- 3:4 vertical poster canvases — use `vertical-3-4-layout-skill`
- Tiny text/style edits that do not affect layout

## 1. Red-note reading path

Every page should read like a feed card:

1. **Hook** — the first 1–2 seconds: title, claim, question, number, or visual anchor.
2. **Value body** — the useful content: list, framework, steps, comparison, data takeaway, or story.
3. **Takeaway** — final memory: conclusion, action, summary line, or compact bottom note.

The hook is not a PPT slide title. It should be visually dominant and feed-readable.

## 2. Structure patterns

Pick one structure before writing HTML:

- **Cover hook** — large headline + subtitle/context + one visual anchor.
- **Checklist note** — 3–6 compact points with short labels and one-line explanations.
- **Before/after stack** — two vertical zones, each with the same fields for fair comparison.
- **Step-by-step card** — numbered vertical sequence with 3–5 steps.
- **Data takeaway note** — one hero metric/chart + short interpretation, not a dense dashboard.
- **Myth/fact or Q/A** — repeated compact rows that scan quickly.
- **Mini framework** — central concept plus 3–5 surrounding facets, arranged vertically or as a compact grid.

Avoid PPT patterns that depend on wide horizontal space: three-column dashboards, long horizontal timelines, bottom card rows under a chart, and dense matrix slides.

## 3. Canvas and spacing

- Use the current red-note canvas dimensions from the prompt, commonly 1242×1660.
- Full-bleed backgrounds are allowed, but content needs generous safe margins.
- Prefer vertical stack, poster composition, and section bands.
- Body content must fit without scrolling.
- Use grid/flex flow for text-bearing modules. Absolute positioning is for background accents only.
- Keep a clear hierarchy: hook > main value > support > bottom note.
- The lower area should carry a takeaway or useful support; do not leave it as accidental empty background.

## 4. Density and typography

- A red-note page can be denser than a PPT cover, but it must still scan quickly.
- Use short lines. Split long paragraphs into bullets, rows, or labeled chunks.
- Body/ordinary labels/card descriptions remain at least `text-lg` (18px); headings at least `text-2xl` (24px); auxiliary text at least 12px.
- Do not shrink text to fit a PPT-like table. Change the structure instead.
- Keep visible facts grounded in the source; do not invent social-proof numbers, quotes, cases, or claims.

## 5. Charts and data

- One main chart or one hero metric is usually enough.
- Use the chart skill for Chart.js details and calculate height from the current canvas height.
- Charts need a visible interpretation sentence. A chart-only red-note page feels unfinished.
- Avoid wide legends and many categories. Use compact bars, mini trend, rank list, or a hero number + explanation.

## 6. Failure signs

- The page reads like a 16:9 PPT slide squeezed into a vertical poster.
- The title is small and formal instead of hook-like.
- There are three or more equal-width columns.
- A dense table or dashboard forces tiny text.
- Content is top-heavy and the bottom is just decorative background.
- The page lacks a final takeaway or value statement.

## 7. Repair strategy

1. Rewrite the top as a feed-readable hook.
2. Choose one red-note structure from §2.
3. Convert dense content into labeled chunks, short bullets, compact rows, or one hero data object.
4. Add a bottom takeaway if the page ends without a memory point.
5. Recheck that the page fits the current canvas and does not rely on PPT layout assumptions.
