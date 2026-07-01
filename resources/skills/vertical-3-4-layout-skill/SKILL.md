---
name: vertical-3-4-layout-skill
description: Must be read before creating, relaying out, or repairing 3:4 vertical Oh My PPT pages. Defines poster-card layout, focal hierarchy, vertical section planning, evidence grouping, compact two-column pockets, chart/list budgeting, plus catalog and checklist references for 1200x1600 canvases.
---

# Vertical 3:4 Layout Skill

This skill is the layout source of truth for `vertical-3-4` pages, usually 1200x1600.

A 3:4 page is a vertical poster-card canvas. It has enough width for rich information cards and compact two-column pockets, but its reading path is still vertical. The layout should feel like a poster with one strong anchor and grouped evidence, not a long feed of equal blocks.

Deep details live in the references:

- `references/catalog.md` - named poster-card patterns and 1200x1600 zone skeletons.
- `references/checklist.md` - P0/P1/P2 structural self-check for delivery.

## Preflight

Before writing HTML, decide:

1. **Message** - the one sentence this card should make the viewer remember.
2. **Focal anchor** - title block, hero metric, chart, image/diagram, framework, or conclusion.
3. **Support groups** - 2-4 proof points, steps, comparison rows, or evidence bands.
4. **Reading path** - top claim -> main proof/value -> bottom synthesis/source.
5. **Density** - low-medium for poster claims, medium for most information cards, high only for compact lists or matrices.
6. **Pattern** - choose one structure from `references/catalog.md` before writing HTML.
7. **Budget** - estimate hero zone, main proof zone, bottom synthesis, gaps, and reserve.

Use the canvas dimensions from the prompt. If custom dimensions are supplied, preserve the same vertical poster relationships.

## Canvas Grammar

- Keep one visual or conceptual anchor larger than the rest.
- Use vertical sections, but group small facts into bands, rows, or chips so the card does not become a long list.
- A compact two-column pocket is allowed inside one section when each item remains readable.
- Let the bottom carry synthesis, implication, source, or a final evidence band.
- Use grid/flex document flow for text-bearing modules. Absolute positioning is only for background accents, connector lines, and non-text decoration.
- Body copy, ordinary labels, and card descriptions stay at least `text-lg` (18px); headings stay at least `text-2xl` (24px); auxiliary source/footer text stays at least 12px.

## Pattern Quick Lookup

| Intent | Patterns |
| --- | --- |
| poster claim | `poster-hero-proof` |
| metric / data | `hero-metric-explainer` · `data-card` |
| process | `vertical-process` |
| comparison | `comparison-rows` |
| evidence | `evidence-band-stack` · `two-column-pocket` |

Use `references/catalog.md` for the full structure recipe before writing a new or heavily repaired card.

## Poster Budget

Calculate before writing:

1. Canvas height: usually 1600px.
2. Outer vertical padding: commonly 72-128px total.
3. Hero/title zone: usually 240-420px depending on focal scale.
4. Gaps between sections.
5. Bottom conclusion/source/reserve: 80-240px when present.
6. Remaining height is the main proof/value zone.

Canvas width is usually 1200px. After horizontal padding, use one full-width column or one compact two-column pocket.

For charts, reserve a specific frame height and keep the `@ppt-chart-height=N` marker aligned with the `h-[Npx]` class. Prefer one clear chart, hero metric, compact bars, rank list, or short table.

## Repair And Self-check

- If the card is just a stack of cards, introduce a hero/focal block.
- If the bottom is empty, add synthesis, implication, source, or a final evidence band.
- If there are too many small facts, group them into bands or chips under shared labels.
- If a two-column pocket feels cramped, return to full-width rows.
- If a chart/table is hard to read, convert it to a hero metric, rank list, compact bars, or grouped rows.
- Before delivery, run `references/checklist.md`.
