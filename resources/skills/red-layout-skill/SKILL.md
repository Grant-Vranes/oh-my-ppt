---
name: red-layout-skill
description: Must be read before creating, relaying out, or repairing Xiaohongshu/red-note canvas pages. Defines social-note layout, hook/value/takeaway reading flow, saveable note patterns, vertical budgeting, compact chart/list composition, plus catalog and checklist references for 1242x1660 canvases.
---

# Red Layout Skill

This skill is the layout source of truth for `xiaohongshu-note` pages, commonly 1242x1660.

A red-note page should read like a saveable social image note: a strong hook, useful body, and memorable takeaway. The layout should make the viewer understand why the page is worth pausing on and what value they can keep.

Deep details live in the references:

- `references/catalog.md` - named red-note patterns and 1242x1660 zone skeletons.
- `references/checklist.md` - P0/P1/P2 structural self-check for delivery.

## Preflight

Before writing HTML, decide:

1. **Stop reason** - why would someone pause, save, or screenshot this note page?
2. **Hook** - title, question, claim, number, or visual anchor in the first 1-2 seconds.
3. **Value format** - checklist, steps, comparison, myth/fact, template, data takeaway, framework, or story/proof.
4. **Body grouping** - 2-4 information sections, or 3-6 compact rows for checklist/steps.
5. **Takeaway** - conclusion, action, summary line, warning, or compact bottom note.
6. **Pattern** - choose one structure from `references/catalog.md` before writing HTML.
7. **Budget** - estimate hook height, body rows/sections, gaps, bottom note, and safe margin.

Use the canvas dimensions from the prompt. If custom dimensions are supplied, preserve the same red-note reading flow.

## Canvas Grammar

- Hierarchy: hook > value body > support > takeaway/source.
- Prefer vertical sections, note cards, list rows, and poster-like bands.
- Keep copy short and scan-friendly. Split long paragraphs into bullets, labeled chunks, or compact rows.
- Use one main data object, framework, or list as the value body.
- Give the lower area a useful role: takeaway, action, summary, source, or final support.
- Use grid/flex document flow for text-bearing modules. Absolute positioning is only for background accents and non-text decoration.
- Body copy, ordinary labels, and card descriptions stay at least `text-lg` (18px); headings stay at least `text-2xl` (24px); auxiliary source/footer text stays at least 12px.

## Pattern Quick Lookup

| Intent | Patterns |
| --- | --- |
| cover / hook | `cover-hook` |
| checklist / steps | `saveable-checklist` · `step-guide` |
| comparison / Q&A | `before-after-stack` · `myth-fact-qa` |
| data / framework | `data-takeaway-note` · `mini-framework` |
| reusable asset | `template-note` |

Use `references/catalog.md` for the full structure recipe before writing a new or heavily repaired note page.

## Note Budget

Calculate before writing:

1. Canvas height: commonly 1660px.
2. Outer vertical padding: commonly 96-176px total.
3. Hook/title zone: usually 220-420px after wrapping.
4. Body sections or list rows: calculate count and row height.
5. Gaps between sections.
6. Bottom takeaway/source/reserve: usually 120-260px when present.
7. Remaining height is the main value zone.

For charts, reserve a specific frame height and keep the `@ppt-chart-height=N` marker aligned with the `h-[Npx]` class. Prefer compact bars, mini trends, rank lists, or hero metric + explanation.

Keep visible facts grounded in the source. Do not invent social-proof numbers, quotes, cases, or claims.

## Repair And Self-check

- If the hook is weak, rewrite it around a concrete benefit, question, number, or claim.
- If the value body is dense, convert paragraphs into labeled chunks, bullets, rows, or one hero data object.
- If the note lacks a memory point, add a bottom takeaway or action line.
- If items feel scattered, group them under 2-4 section labels.
- If a chart/list is hard to scan, simplify to a hero metric, compact ranking, or grouped rows.
- Before delivery, run `references/checklist.md`.
