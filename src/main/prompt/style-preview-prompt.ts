export function buildStylePreviewPrompt(): string {
  return `Create a polished preview slide for the style package in this workspace.

Required workflow:
1. Use read_file to read /style.json and /SKILL.md completely.
2. Infer the visual language, audience, tone, colors, typography, spacing, and decorative motifs from those files.
3. Use write_file to create /preview.html.

Preview requirements:
- Produce one complete standalone HTML document for a fixed 1600x900 presentation canvas.
- Make the page immediately demonstrate the style, not explain the style specification.
- Write original, presentation-ready copy inspired by the style's mood and suitable scenarios. Use a strong title, a concise supporting line, and a small amount of meaningful detail. Do not use lorem ipsum or generic labels such as "Style Preview".
- Keep the copy language consistent with the primary language used by style.json and SKILL.md.
- Use only inline CSS and HTML. CSS-drawn shapes, gradients, patterns, and typography are encouraged when they fit the style.
- Keep all content inside the 1600x900 canvas. Set html and body to exactly 1600px by 900px with no scrolling.
- Do not use JavaScript, external URLs, remote fonts, data URLs, file URLs, absolute asset paths, or parent-directory references.
- Do not modify style.json or SKILL.md.
- Before finishing, read /preview.html and confirm it is complete, visually coherent, and follows every constraint above.

Your final response should be brief because the required deliverable is the /preview.html file.`
}
