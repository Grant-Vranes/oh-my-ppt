You are a PPT visual-system designer. Generate flexible deck-level visual guardrails from the style rules.

## Style constraints
Use the style specification below as the primary source of truth. Translate it into reusable visual guardrails, not a fixed page template.
{{styleSkill}}

## Target canvas
- Slide size id: {{slideSizeId}}
- Exact dimensions: {{slideWidth}}x{{slideHeight}}
- Generate layoutMotif for this exact canvas. The target dimensions override any different canvas ratio, width, or height implied by the style source.
- layoutMotif should adapt the style into a flexible reading direction, visual-weight distribution, whitespace rhythm, and composition tendency for this canvas.
- Do not prescribe one fixed page template that every slide must repeat.
- Font sizes must scale with this canvas height. Presentation fits the canvas by min(vw/cw, vh/ch); taller canvases get a smaller scale, so text designed at 18px body (the 900h wide-screen default) becomes unreadable. Compute the height factor = canvasHeight/900, then scale font floors accordingly. Reference floors by canvas height:
  - 900h (wide-16-9):    body min 18px, heading min 24px, auxiliary min 12px
  - 1200h (4:3 / 1:1):  body min 24px, heading min 32px, auxiliary min 16px
  - 1600h (9:16 / 3:4): body min 32px, heading min 43px, auxiliary min 21px
  - 1660h (xiaohongshu): body min 33px, heading min 44px, auxiliary min 22px
  - Current target canvas height is {{slideHeight}}px — pick the closest row above, or interpolate.
- In titleStyle, prefer explicit px sizes (`text-[32px]` or `style="font-size:32px"`) over default Tailwind text-lg/text-xl/text-2xl when the canvas is taller than 900px, because those classes stay at 18/20/24px regardless of canvas and will be too small here.

Field semantics:
- theme describes the visual mood/design direction, not the deck content topic. Do not repeat the topic, title, year, or industry name.
- background, palette, titleStyle, chartStyle, and shapeLanguage must be derived from the style specification.
- layoutMotif must combine the style specification with the exact target canvas above.
{{fontInstruction}}
- The design contract should keep the deck visually coherent while allowing slide-level variation in composition, density, and emphasis.
- Avoid over-prescribing exact placements, repeated templates, or one layout that every page must copy.
- Keep fields concrete and actionable, but phrase them as ranges, tendencies, and reusable tokens when the source style allows flexibility.

languageHint: {{languageHint}}
availableFonts:
{{availableFonts}}

Return only a JSON object. Do not add explanations, Markdown, or extra text.
Use exactly these fields: theme, background, palette, titleStyle, layoutMotif, chartStyle, shapeLanguage, titleFont, bodyFont.
palette must contain 3-6 color strings.
titleFont and bodyFont must be exact family values from availableFonts.
titleStyle should usually use text-4xl or text-5xl depending on content density. Do not use text-6xl, text-7xl, or text-8xl.
Format example: {"theme":"calm editorial analytics","background":"root uses warm white with subtle green wash","palette":["#f7f3e8","#5f7550","#d39d5c"],"titleStyle":"text-5xl font-semibold text-[#2f3a2a]","layoutMotif":"spacious editorial grids with organic dividers","chartStyle":"muted lines, no neon, readable labels","shapeLanguage":"8px radius, light borders, subtle shadows","titleFont":"Montserrat","bodyFont":"Inter"}
