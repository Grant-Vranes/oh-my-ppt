# Oh My PPT Layout — Structural Self-check

Run this list against the page before delivering. Items come from the project hard rules and the failure signs across SKILL.md and `catalog.md` — they are structural, not aesthetic. Visual taste is the current style's job; this list only guards structure, budget, and readability.

Levels:

- **P0 — not deliverable.** The page is broken; fix before it ships.
- **P1 — should fix.** The page works but a structural weakness will likely cause overflow or weak hierarchy.
- **P2 — consider optimizing.** The page is fine; these improve clarity and rhythm.

## P0 — not deliverable

- Standard mode emits `data-img-slot` / `data-image-slot` / `script[data-img-intent]`, an image job, or an empty image placeholder. Standard mode does not generate images.
- A text-bearing element (title, body, card) uses `absolute` or `fixed` positioning. Body content must live in grid/flex flow.
- Body copy, ordinary labels, or card descriptions are below 18px (`text-lg` is the floor), any heading is below 24px (`text-2xl` is the floor), or auxiliary text is below 12px. These are minimums, not fixed sizes. Annotations, footers, page numbers, source/citation lines, and elements explicitly marked `data-ppt-text-role="auxiliary"` may be 12–17px.
- On a standard or high chart page, a two-row bottom card grid sits under the main chart. Support modules are capped at 0–2 compact blocks; 3 is allowed only when they are genuinely parallel, short facts with explicit height budget.
- A dense chart page expanded content into more cards without regrouping; rich content must become hierarchy, annotations, compact rows, or an evidence rail, not extra equal-weight modules.
- Content exceeds 1600×900 — collision, overflow, or clipping.

## P1 — should fix

- The page has no single memorable message. State the one sentence the audience should leave with and confirm the slide's hero element expresses it. If two facts compete to be the hero, merge them or demote one to support — a slide with two heroes has none.
- The combined height of title + subtitle + metrics + chart + annotations exceeds the 900px safe budget.
- A content/data page has a message but no load-bearing structure: the thesis is written as text, while the chart, metric, matrix, timeline, comparison zone, or conclusion band does not visibly carry it.
- A non-cover / non-quote / non-divider page is top-heavy: title + real modules sit in the upper half, while the middle/lower canvas is mostly background, footer, or source text. Recompose with a full-height two-zone, timeline-lanes, balanced KPI dashboard, or chart-plus-insight skeleton.
- A non-cover / non-quote / non-divider page is accidentally under-filled: the chart, cards, or grid were tiny and left an unplanned empty band. Enlarge the primary module or add one concise evidence / annotation zone; do not make the whole page dense just to fill space.
- A `flex-1` or `h-full` card is mostly empty inside. Shrink the card or let the main chart, timeline, matrix, hero number, evidence group, or conclusion band own the remaining space.
- The main chart is only 220–280px tall and no other module is clearly the hero. Increase the chart role, or make a different structure carry the thesis.
- A grid declares more columns or rows than it fills — an empty track wastes the canvas (e.g. `grid-cols-[1fr_280px]` with only the left column populated). Fill every declared track, or remove the empty track and widen the others.
- A table, list, or card row is much shorter than its zone and leaves a large accidental empty band below. Increase visual scale or spacing modestly, but keep presentation-like breathing room.
- Consecutive pages reuse the same card grid, chip row, or table pattern. Vary the pattern across the deck. (Deck-generation only — when editing a single page you do not control its neighbors, so this check does not apply.)
- Nesting goes deeper than 4 levels purely for visual wrapping. Flatten wrapper chains.
- A 4-column card row carries long paragraphs. 4 columns are only for truly parallel short values.
- A chart container's padding is so large that the actual chart area is too small.
- An axis-heavy chart has no tick/label reserve, so axis labels press into nearby cards or the plot becomes cramped.
- A mixed-language long title (English + numbers + Chinese) is set vertically or compressed. Such titles must be horizontal.

## P2 — consider optimizing

- A short-content page has no visual argument — just a few small cards centered. Add one visual anchor, one concise evidence rail, or a clearer expanded argument.
- All support modules are equal-weight cards with no primary. Establish hierarchy — one dominant module, the rest visibly supporting.
- Decorative lines, connectors, or SVG sit on top of the body reading path. Keep decoration behind or beside the text.
- An existing image asset has no `object-fit` or ratio constraint. Add one to prevent distortion.
