---
name: standard-4-3-layout-skill
description: Must be read before creating, relaying out, or repairing standard 4:3 Oh My PPT pages. Defines square-ish presentation composition, column limits, chart/table budgeting, and anti-wide-dashboard rules for 1600x1200 canvases.
---

# Standard 4:3 Layout Skill

This skill is the layout source of truth for `standard-4-3` pages, usually 1600x1200.

A 4:3 canvas is presentation-like but not wide. It supports clear two-zone layouts, balanced chart + insight pairs, and compact grids. It does not have enough width for many 16:9 dashboard patterns.

## Use this skill when

- The selected slide size is `standard-4-3`
- The prompt says the canvas is 1600x1200 or 4:3
- Creating, relaying out, or repairing a squarer presentation page

## Composition

Good structures:

- title band + 2-column body
- chart/data zone + explanation panel
- 2x2 matrix
- central concept + side annotations
- table-like rows with few columns
- balanced image/diagram plus takeaways

Avoid:

- six-metric horizontal bands
- long horizontal timelines
- three or four dense equal columns
- wide tables with many narrow columns
- bottom rows copied from 16:9 PPT

## Rules

- Use fewer columns than a 16:9 slide. Two columns is usually the limit.
- Keep side margins and gutters generous enough for readability.
- Body text stays at least 18px; headings stay at least 24px.
- Use current canvas dimensions from the prompt, never 1600x900 defaults.
- Charts can be larger than in vertical formats, but legends and labels must remain readable.
- If content feels cramped, convert wide structures into stacked rows or a 2x2 matrix.

## Repair checklist

- If the page has narrow columns, reduce column count.
- If a timeline stretches edge to edge, convert to rows or a compact sequence.
- If a table is clipped, keep only key columns or turn it into grouped insight cards.
