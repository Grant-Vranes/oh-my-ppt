# Oh My PPT Layout — Pattern Catalog

> **This catalog is advisory.** Every layout pattern is a *structure choice*, not a template. It describes how information is organized — module count, primary/secondary hierarchy, reading path, and height budget. It does **not** prescribe colors, rounded corners, shadows, gradients, fonts, or any decorative look. Any pattern can be re-visualized by whatever style the user has chosen; the structure stays the same while the current style owns the visual language.
>
> Success is **not** "use as many patterns as possible." It is: the model picks the structure that lets the current style express the content most stably — a data page knows the relationship between its main chart and support modules, a comparison page aligns its zones fairly, a process page defines its reading path, a summary page separates the conclusion from its evidence.

## How to read a layout pattern

Each pattern has four parts:

- **Input shape** — what content and density this pattern fits.
- **Structure recipe** — the recommended grid/flex organization (tracks, module count, primary/secondary, reading path). **No visual words** — colors, corners, shadows, gradients, fonts are all decided by the current style.
- **Budget rule** — the structural relationship that lets the page use the 1600×900 canvas intentionally: which module dominates, how the rest shares the remaining space, where whitespace stays, and the failure sign when it overflows or leaves a large accidental empty band. It states the relationship, not a pixel budget — you compute the actual heights.
- **Failure signs** — structural failures (overload, collision, missing hierarchy, overflow, unreadable font size) and how to reorder. **No aesthetic failure** ("too plain", "not elegant") — those belong to the style.

Before trusting a structure recipe, run the **style-swap self-check**: swap the current style for any other style; does this pattern description still hold without pointing at one fixed look? If not, rewrite it in more abstract structural language.

---

## Canonical 1600×900 zone skeletons

Use these skeletons when the model would otherwise invent an unstable layout. They are **not visual styles**: do not copy colors, rounded corners, shadows, gradients, or decoration from the skeleton name. The current style still owns the visual language. The skeleton only decides canvas zones, hierarchy, and what carries the page's thesis.

The visual center may sit slightly above the geometric center for comfortable projection, but the slide must still use the middle of the canvas. A page where all real modules sit in the top half and the lower half is only source text or background is not a designed low-density page.

#### `full-height-two-zone`

- **Use for**: data exhibit, comparison, concept explanation, or a page with one dominant evidence object plus supporting interpretation.
- **Zone sketch**: title/claim band at top; remaining height split into two full-height columns or unequal zones. One zone carries the primary chart/table/diagram/hero number; the other carries an insight rail, compact evidence, or a concise explanation block.
- **Balance rule**: both zones must visibly participate in the middle of the canvas. The support zone may be lighter, but it cannot become a huge empty card with one short paragraph floating inside.
- **Failure sign**: a small chart or metric row at the top plus a large blank lower area. Recompose into two full-height zones, or let the primary object own the middle and move support into a rail.

#### `vertical-timeline-lanes`

- **Use for**: roadmap, forecast, history, phased plan, or year-by-year narrative.
- **Zone sketch**: title band at top; the content area becomes lane columns or stacked lanes that extend through the middle height. Each time period gets a lane with 1–3 compact events distributed down the lane, plus one conclusion band or trend note at the bottom when useful.
- **Balance rule**: timeline cards should not all sit in one top row. If a year has fewer events, use larger event spacing, a milestone marker, or a concise trend note so the lane still feels intentional.
- **Failure sign**: three year columns with two cards each in the upper third and a blank middle. Rebuild as lanes that occupy the content height.

#### `kpi-dashboard-balanced`

- **Use for**: KPI overview, key data snapshot, market sizing, or metric-heavy summary.
- **Zone sketch**: title/claim band; one hero metric or primary data band; secondary metric group, compact comparison row, or insight rail in the lower/middle area. The hierarchy is hero first, support second.
- **Balance rule**: a metric dashboard needs a designed middle, not just a row of equal cards near the top. If there are many facts, group them into metric bands, bento cells, or compact rows instead of equal full cards.
- **Failure sign**: a top row of KPI cards followed by untouched background. Promote one metric to hero, use a lower support band, or switch to a bento/grid structure.

#### `chart-plus-insight-stack`

- **Use for**: one main chart where the takeaway matters as much as the data.
- **Zone sketch**: title/claim band; chart frame as the dominant middle zone; concise insight band, annotation rail, or 1–2 support chips attached to the chart. Footer/source stays small.
- **Balance rule**: if the chart is the main evidence, it normally needs a real chart frame (often 380–560px depending on remaining slot) and the insight area stays compact. If the chart only needs 220–280px, another element must clearly carry the page's thesis.
- **Failure sign**: chart frame around 240px with no other hero object, or a giant empty explanation card beside/below the chart. Either enlarge the chart role or make the explanation the hero and demote the chart.

---

## `cover` — opening or section divider

### `hero-title-center`

- **Input shape**: Opening cover. Single title + optional one-line subtitle (scope, date, or thesis). Low density.
- **Structure recipe**: Title block centered on both axes. Optional accent line above or below the title. Subtitle on its own line beneath. Single column, generous outer padding.
- **Budget rule**: Title + subtitle + accent occupy ~40–60% of height, vertically centered; the rest is intentional whitespace.
- **Failure signs**: Multiple subtitles, intro paragraphs, or several metadata rows turn the cover into a document page → keep the cover to title + one subtitle line; fold the extra detail into the subtitle or compress it into a single metadata tag.

### `hero-title-asymmetric`

- **Input shape**: Cover or section opener that wants editorial energy. Title + short subtitle + optional single metadata tag.
- **Structure recipe**: Two-zone unequal split (`grid grid-cols-[2fr_1fr]` or `[3fr_1fr]`). Title block in the dominant zone; the small zone holds subtitle/metadata or acts as a whitespace anchor. Title left-aligned, vertically centered.
- **Budget rule**: Dominant zone carries title scale; small zone keeps to 1–2 short lines.
- **Failure signs**: The small zone fills with multiple paragraphs that compete with the title → reduce the small zone to one short anchor.

### `hero-big-number`

- **Input shape**: Cover or key-message slide built around one headline metric (a total, a percentage, a year). Low density.
- **Structure recipe**: One hero number at visual center (or in the dominant zone); label/unit below it; optional one-line context. Single column.
- **Budget rule**: Hero number + label + 1 context line; reserve whitespace.
- **Failure signs**: Two or three competing big numbers, or a long explanation paragraph under the number, kills the hero → pick one hero number; relegate the other numbers to 1–2 small context chips or fold them into the hero label.

### `section-divider`

- **Input shape**: Chapter/section transition. Section label + section name + optional one-line scope.
- **Structure recipe**: Low-density, centered or asymmetric. Section label (e.g. an index) and section name on separate lines. Single column.
- **Budget rule**: Label + name occupy a center band; large whitespace.
- **Failure signs**: The divider carries body bullets or a mini agenda → it becomes a content slide; keep it to label + name (+ optional one scope line).

---

## `quote` — single statement

### `hero-quote`

- **Input shape**: One quotation or statement that *is* the slide. Low density.
- **Structure recipe**: Quotation block centered on both axes, constrained to a readable line length (e.g. `max-w-3xl`). Attribution on its own line below at a smaller scale. Optional one-line context.
- **Budget rule**: Quote + attribution + 1 context line; large padding; no grid needed.
- **Failure signs**: Multiple quotes, or a paragraph of commentary around the quote, dilute it → one quote per slide; fold commentary into a single context line beneath the attribution, or compress it into a short context tag.

---

## `summary` — conclusion, takeaways

### `summary-takeaways`

- **Input shape**: Conclusion/takeaway slide. One conclusion statement + 2–3 evidence or takeaway points. Low-medium to medium density.
- **Structure recipe**: Opening conclusion at the top at hero scale; 2–3 takeaway blocks below in a grid (`grid-cols-2` or `grid-cols-3`) or stacked. Conclusion dominates; takeaways support.
- **Budget rule**: Conclusion ~1–2 lines; takeaway blocks use enough space to feel intentional while preserving whitespace. Do not force 3–4 full cards just to fill height.
- **Failure signs**: 5+ takeaways, or takeaways each holding long paragraphs, overflow → group into 3 primary takeaways; secondary detail becomes annotation chips.

### `executive-brief`  *(controlled high-density, use sparingly)*

- **Input shape**: An executive summary that must convey conclusion + key data + risk/action in one slide. High density but disciplined.
- **Structure recipe**: Three-band vertical structure: (1) one-line conclusion, (2) key-data row of 2–4 metric cells, (3) risk/action row of 1–3 compact blocks. Use `grid-rows-[auto_auto_1fr]` with each band a grid. Reading path: conclusion → data → action.
- **Budget rule**: three bands — one-line conclusion, key-data row, risk/action row — share the canvas; the data band takes the room it needs, conclusion and action stay compact, and whitespace remains visible.
- **Failure signs**: Adding a fourth band (a full chart or a long footnote list) overflows → executive-brief holds three bands only; if a chart is essential, swap one band for a compact chart or switch this page to the `trend-exhibit` pattern.

---

## `data-focus` — metrics, KPIs, charts

### `kpi-hero`

- **Input shape**: One headline KPI to dominate. Optional baseline/unit/one-line context.
- **Structure recipe**: Hero KPI number + label in the dominant zone; 1–2 small context chips (baseline, delta) beside or below. Single column or `grid grid-cols-[2fr_1fr]`.
- **Budget rule**: KPI hero ~40% of height; context chips capped at 2; reserve whitespace.
- **Failure signs**: A full chart + KPI + metric row + footnotes on one slide overloads → make the KPI primary; if a chart is essential, switch this page to `chart-annotated` or `metric-band`, or compress extra metrics into 1–2 chips.

### `metric-band`

- **Input shape**: 3–6 parallel metrics of equal weight (a dashboard snapshot). Medium-high density.
- **Structure recipe**: One horizontal band of equal-width cells (`grid-cols-3` to `grid-cols-6`); each cell is number + label. Optional one-line title above the band.
- **Budget rule**: a single horizontal band of cells under an optional title; cells stay compact (number + short label); title + band feel centered and intentional without forcing extra rows.
- **Failure signs**: Cells holding multi-line paragraphs, or a second band of full cards stacked below, overflow → keep cells to number + short label; merge two groups into one band, or switch this page to `compare-options` to hold both groups as columns.

### `trend-exhibit`

- **Input shape**: One main trend/chart as the primary evidence + 0–2 compact support modules. Medium density.
- **Structure recipe**: Title at top; chart in the dominant zone; 0–2 compact support blocks (metric chips or an annotation rail) in a single row or narrow rail — **not** a two-row card grid. `grid-rows-[auto_1fr_auto]` with support in the last auto row only when needed.
- **Budget rule**: title at top; the chart owns the dominant zone and has breathing room; support blocks sit beside or below it only when they clarify the chart. The chart is not a tiny default, but the page is not forced into a dense dashboard.
- **Failure signs**: A two-row bottom card grid under the tall chart, or support modules expanded into full cards, overflows the 900px budget → cap support at 0–2 compact blocks; see SKILL.md "Overpacked chart slide guardrails".

### `chart-annotated`

- **Input shape**: A chart whose key insight needs callouts. Chart is primary; annotations are the support.
- **Structure recipe**: Chart in the dominant zone; 1–3 annotation labels placed as a rail beside it (`grid-cols-[2fr_1fr]`) or as a compact row below, each annotation tied to a chart feature. No card grid competing with the chart.
- **Budget rule**: chart owns the dominant zone and has breathing room; annotation rail/row beside or below stays compact.
- **Failure signs**: Annotations expanded into full multi-line cards, or a second chart plus an annotation row, overflow → annotations stay as short callouts; a second chart only when the two are truly comparable (one primary, one compact).

---

## `comparison` — options, alternatives, before/after

### `compare-two-zone`

- **Input shape**: Side-by-side comparison of two options or states (before/after, A/B). Medium density.
- **Structure recipe**: Two equal-width zones (`grid-cols-2`), the **same** internal structure in each zone (same number of rows/fields) for fair comparison. Title spans both zones at the top.
- **Budget rule**: title spans both zones at top; the two zones split the remaining height evenly enough to feel balanced, with whitespace preserved around each comparison.
- **Failure signs**: Zones with unequal field counts (one side 4 fields, the other 2) break fairness; zones with long paragraphs overflow → align field counts; long text becomes labels.

### `compare-options`

- **Input shape**: Compare 3–4 options along the same dimensions. Medium-high density.
- **Structure recipe**: Options as columns (or rows) with shared dimension labels. `grid-cols-3` / `grid-cols-4` for option columns, each cell a short value; or a row-per-dimension table-like grid. Same dimensions in every option.
- **Budget rule**: header row (dimensions) + 3–4 option columns; each cell short; fit in 900px.
- **Failure signs**: 5+ options collapse cells too narrow; cells with long prose overflow → cap at 4 options; prose condenses to phrases.

### `decision-matrix`  *(fills a gap)*

- **Input shape**: Evaluate options against weighted criteria (a decision aid). High density.
- **Structure recipe**: Matrix grid — rows are criteria, columns are options, cells are ratings/values. Criteria labels in a left rail (`grid-cols-[1fr_repeat(n,1fr)]`); optional one-line verdict per option below. Equal columns.
- **Budget rule**: header + criteria rows + optional verdict row; row count justified by real criteria; fit in 900px.
- **Failure signs**: A criteria column with long prose cells, or 6+ criteria, overflows → criteria condense to short labels; cap visible criteria at 5–6; fold deep rationale into a compact footnote line or one summary cell.

---

## `concept` — ideas, frameworks

### `concept-center-satellites`

- **Input shape**: One central concept explained by 3–6 surrounding facets. Medium density.
- **Structure recipe**: Explicit `grid-cols-3 grid-rows-3` with the concept in the center cell and satellites in surrounding cells; connector lines as an SVG decoration layer (not content). Each satellite: short title + 1 line.
- **Budget rule**: center concept + 4–8 satellites; fit in 900px with gap.
- **Failure signs**: Satellites holding multi-line paragraphs, or the center concept also being a long paragraph, collide → satellites stay short; for 6+ facets switch this page to `framework-2x2` or a compact list.

### `framework-2x2`  *(fills a gap)*

- **Input shape**: A 2×2 framework / quad map (two axes, four quadrants). Medium density.
- **Structure recipe**: `grid-cols-2 grid-rows-2` for the four quadrants; axis labels placed as a decoration/rail (one top axis label, one left axis label); each quadrant: short title + 1–2 lines. Reading path: axis meaning → quadrant.
- **Budget rule**: axis labels + 2×2 grid; each quadrant capped at short title + 1–2 lines + reserve.
- **Failure signs**: Quadrants holding long paragraphs, or a third implicit axis, break the 2×2 → quadrants condense to short title + 1 line; if there is a third dimension, switch this page to the `framework-pyramid` pattern.

### `framework-pyramid`  *(fills a gap)*

- **Input shape**: A layered hierarchy (strategy → tactics → execution, or a needs hierarchy). Medium density.
- **Structure recipe**: Stacked horizontal layers, narrowest at the top (or bottom). `grid-rows-3` / `grid-rows-4` with each layer a band holding a layer label + one-line content. Reading path is consistent (apex → base, or base → apex).
- **Budget rule**: 3–5 layers; each layer a band holding a label + one line; layers are scaled to read clearly without turning the slide into a dense stack.
- **Failure signs**: 6+ layers, or layers holding multi-line paragraphs, overflow → cap at 4–5 layers; fold sub-points into each layer's one-line content or group them as compact labels.

---

## `process` — steps, flow, mechanism

### `process-linear`

- **Input shape**: A linear sequence of steps or stages (3–6 steps). Medium density.
- **Structure recipe**: Steps in a row (`grid-cols-3` / `grid-cols-4` / `grid-cols-5`) or a vertical staircase; each step: number/label + 1–2 lines. Connectors as decoration. Reading path: left → right (or top → bottom).
- **Budget rule**: 3–6 steps; each step short; fit in 900px.
- **Failure signs**: Steps holding long paragraphs, or 7+ steps, overflow → cap at 5–6 steps; compress sub-steps into each step's 1–2 lines, or switch this page to `timeline-strip` (a strip tolerates more nodes).

### `process-loop`  *(fills a gap)*

- **Input shape**: A cyclical/recurring process (continuous improvement, lifecycle). Medium density.
- **Structure recipe**: Center cell holds the cycle's goal or theme; 3–5 stage cells arranged in a ring around the center (`grid-cols-3 grid-rows-3` with the center occupied); connector arrows as SVG decoration showing loop direction. Reading path: center theme → stages in cycle order.
- **Budget rule**: center + 3–5 stage cells; each stage short; fit in 900px.
- **Failure signs**: Stages holding long paragraphs, or connector arrows overlapping stage text, collide → stages stay short; for 6+ stages switch this page to `process-linear` (a row tolerates more cells).

---

## `timeline` — phases, stages, roadmap

### `timeline-strip`

- **Input shape**: A sequence of phases over time (roadmap, history, project plan). Medium density.
- **Structure recipe**: Horizontal strip with labeled nodes (or a vertical staircase for many phases); each phase: time + label + 1–2 lines. Optional detail cards in a single band below the strip. `grid-cols-n` for nodes.
- **Budget rule**: title; a horizontal node strip; an optional detail band below; together they feel balanced. With no detail band, the strip and nodes scale up modestly instead of leaving the page accidentally short.
- **Failure signs**: 7+ nodes on one horizontal strip compress labels unreadably, or detail cards expanding into a two-row grid below, overflow → collapse detail to one-line labels, switch to a vertical staircase, or group nearby nodes into fewer labeled clusters — keep it on one page.

---

## `image-focus` — products, scenes, visual material

> Standard mode does **not** generate images. These patterns describe how to lay out a slide *when an image asset already exists* (an imported image, a screenshot, a diagram you have been given). Do not create image slots, request image jobs, or reserve empty image placeholders.

### `asset-image-hero`

- **Input shape**: A slide built around one existing image/diagram/screenshot — the image is the argument.
- **Structure recipe**: Image fills 60–70% of the canvas (dominant zone); compact text block: title + 1–2 lines + labels. Single column or `grid-cols-[2fr_1fr]` with the image dominant. The image needs an `object-fit` and an explicit ratio constraint (structural — it prevents distortion, not a style choice).
- **Budget rule**: image zone carries most of the visual weight; compact text block (title + 1–2 lines); whitespace remains intentional around the image and text.
- **Failure signs**: The text block expanding into multiple paragraphs competes with the image, or an image without a ratio constraint distorts → text stays compact; the image gets an explicit ratio.

### `asset-text-visual-split`

- **Input shape**: Image and substantial text both matter (narrative + visual). Medium density.
- **Structure recipe**: Two-zone split (`grid-cols-2` or `grid-cols-[1fr_2fr]`); one zone is the image (with a ratio constraint), the other is text (title + 2–3 short blocks). Reading path is defined by which zone is primary.
- **Budget rule**: split zones share height equally; text zone capped at title + 2–3 short blocks; reserve.
- **Failure signs**: The text zone holding long paragraphs, or an image without a ratio constraint, overflow or distort → text condenses; the image gets a ratio.

---

## Stackable composition techniques

These are **not** layout patterns. They are composition mechanics you can layer on top of any pattern above to add hierarchy or rhythm. They describe mechanism only — the actual color, weight, and decoration are chosen by the current style.

- **unequal-zones** — unequal grid track splits (`grid-cols-[2fr_1fr]`, `[1fr_3fr]`). The larger zone gets dominance; the smaller zone anchors with context. Use for hero + support, claim + evidence, narrative + data.
- **overlap-layering** — a module overlaps a zone boundary via a small negative margin to create depth; the overlap point becomes a visual anchor. Negative margin applies only to modules that stay in normal flow; `absolute` / translate is for decorative accents only, never for content cards or text.
- **bento-grid** — `grid-cols-4 grid-rows-3` with some cells `col-span-2` / `row-span-2` to create size hierarchy within the grid; the largest cell gets implicit importance. Use for 5+ parallel items that need differentiation.
- **split-tone** — each grid child gets its own background (color chosen by the current style) to create an instant visual split without borders; use `gap-0` or per-child backgrounds. Use for before/after, problem/solution.
- **floating-cards** — a full-canvas background with card modules placed asymmetrically on top; the shared background unifies disparate content. Use for process steps, feature showcases, brand slides.
- **staircase** — modules offset with incrementing `ml-*` / `pl-*` create a diagonal reading flow; pair with a descending scale for rhythm. Use for sequential content.
- **hero-band** — a full-width band occupying 40–60% of page height creates dramatic weight; modules below overlap into the band with a negative margin. Use for key results, section openers.
- **diagonal-accent** — a tilted decorative band behind the content layer (via transform rotation; angle chosen by the current style) adds energy; content stays flat on top. Use for covers, case studies that need energy without affecting layout.
- **asymmetric-whitespace** — content placed off-center (e.g. left 60%) with large empty space; the whitespace itself is a design element. Use for quotes, key messages, low-density slides.

---

## Intent → pattern quick lookup

| Intent | Patterns |
| --- | --- |
| `cover` | `hero-title-center` · `hero-title-asymmetric` · `hero-big-number` · `section-divider` |
| `quote` | `hero-quote` |
| `summary` | `summary-takeaways` · `executive-brief` |
| `data-focus` | `kpi-hero` · `metric-band` · `trend-exhibit` · `chart-annotated` |
| `comparison` | `compare-two-zone` · `compare-options` · `decision-matrix` |
| `concept` | `concept-center-satellites` · `framework-2x2` · `framework-pyramid` |
| `process` | `process-linear` · `process-loop` |
| `timeline` | `timeline-strip` |
| `image-focus` | `asset-image-hero` · `asset-text-visual-split` |
