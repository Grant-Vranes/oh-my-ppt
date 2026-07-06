# Standard 4:3 Layout Catalog

This catalog describes 1600x1200 square-ish presentation structures. It is structural only: style controls color, type mood, decoration, shadows, and texture.

## Zone Skeletons

### `title-body-synthesis`

- **Use for**: most presentation slides.
- **Zone sketch**: title/claim band, body slot, optional synthesis/source band.
- **Balance rule**: the body must carry the message; synthesis stays compact.
- **Failure sign**: title consumes too much height and the body becomes cramped.

### `two-zone-balanced`

- **Use for**: chart + insight, diagram + explanation, comparison pair.
- **Zone sketch**: two body zones under a title, equal or unequal depending on hierarchy.
- **Balance rule**: both zones should be readable and one should clearly be primary.
- **Failure sign**: both zones become equal paragraph boxes with no hierarchy.

### `center-with-rails`

- **Use for**: concept, framework, or diagram with support facets.
- **Zone sketch**: central primary object, compact rails above/below or left/right.
- **Balance rule**: rails support the center and do not flatten it.
- **Failure sign**: support cards become the main visual mass.

## Patterns

### `title-plus-two-zone`

- **Input shape**: one primary object plus interpretation.
- **Structure recipe**: title band, then two body zones; one is primary, one is support.
- **Budget rule**: both zones use the middle height; support stays concise but meaningful.
- **Failure signs**: primary zone is unclear; support zone is mostly empty or too verbose.

### `chart-insight-pair`

- **Input shape**: one chart/table plus takeaway or metric context.
- **Structure recipe**: chart/data zone paired with an insight panel or bottom interpretation band.
- **Budget rule**: reserve width for labels and height for the plot before adding support.
- **Failure signs**: chart labels are cramped; interpretation repeats every datapoint.

### `matrix-2x2`

- **Input shape**: four categories, quadrants, risks, options, or framework cells.
- **Structure recipe**: 2x2 grid with clear axis/row/column meaning.
- **Budget rule**: each cell gets a short title and 1-2 lines.
- **Failure signs**: cells become long essays; axis meaning is unclear.

### `center-concept-rails`

- **Input shape**: one central concept with 2-4 supporting facets.
- **Structure recipe**: center block with side/top/bottom rails or a three-row composition.
- **Budget rule**: center carries the thesis; rails provide compact support.
- **Failure signs**: all facets become equal cards; center no longer dominates.

### `compact-table-rows`

- **Input shape**: small tables, criteria, roadmap slices, or comparison dimensions.
- **Structure recipe**: table-like rows with few columns and consistent row heights.
- **Budget rule**: keep columns short; use grouped labels instead of paragraph cells.
- **Failure signs**: clipped cells; too many columns; tiny text pressure.

### `diagram-plus-takeaways`

- **Input shape**: existing screenshots, diagrams, product views, or technical visuals.
- **Structure recipe**: visual as primary zone, with a short takeaway rail or bottom band.
- **Budget rule**: visual gets explicit ratio/object-fit constraints.
- **Failure signs**: image distortion; text surrounds the visual as equal full cards.
