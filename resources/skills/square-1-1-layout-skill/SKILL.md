---
name: square-1-1-layout-skill
description: Must be read before creating, relaying out, or repairing 1:1 square Oh My PPT pages. Defines square-card composition, centered focal hierarchy, quadrant layouts, balanced margins, and anti-wide-PPT rules for 1200x1200 canvases.
---

# Square 1:1 Layout Skill

This skill is the layout source of truth for `square-1-1` pages, usually 1200x1200.

A 1:1 canvas is a square content card. It is good for social cards, concept summaries, quote/data cards, compact explainers, and visual takeaways. It should not look like a cropped 16:9 slide.

## Use this skill when

- The selected slide size is `square-1-1`
- The prompt says the canvas is 1200x1200 or 1:1
- Creating, relaying out, or repairing a square HTML card

## Composition

Good structures:

- center hero + surrounding support chips
- top title + central visual/data + bottom takeaway
- 2x2 matrix with one emphasized quadrant
- large quote/claim + compact evidence row
- image/diagram focus + short explanation band
- comparison pair stacked vertically or side by side with generous gutters

Avoid:

- wide 16:9 dashboard skeletons
- long horizontal timelines
- three equal columns
- dense tables
- content packed only into the top half
- decorative empty bottom areas

## Rules

- Start with one focal anchor. A square card needs one dominant center of gravity.
- Keep margins balanced on all four sides. Accidental empty corners are easier to notice in a square.
- Use at most 2 columns or a 2x2 grid. If each cell needs paragraphs, reduce the number of cells.
- Body text stays at least 18px; headings stay at least 24px.
- Use current canvas dimensions from the prompt, never 1600x900 defaults.
- Charts should be one clear object with a visible interpretation sentence. Avoid wide legends and many categories.
- If content is sparse, enlarge the core claim or visual anchor. Do not add filler cards.
- If content is dense, summarize into one core message and 2-4 support points before writing HTML.

## Repair checklist

- If the page looks like a cropped PPT slide, rebuild around a square focal anchor.
- If modules are all the same size, create one dominant block and subordinate support.
- If the card is top-heavy, move the takeaway, evidence, or visual mass into the middle/lower area.
- If a table or timeline feels cramped, convert it into a matrix, ranked list, or compact evidence band.
