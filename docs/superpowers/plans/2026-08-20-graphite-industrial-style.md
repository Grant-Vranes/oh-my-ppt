# Graphite Industrial 风格改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 oh-my-ppt 从暖色有机自然风改为石墨工业商务风

**Architecture:** Token-First 全量替换。先改 index.css 令牌+语义类，再改 tailwind.config.js，然后逐个改 UI 组件，最后脚本批量替换 ~86 个文件的硬编码色值。

**Tech Stack:** Tailwind CSS v4, React, shadcn/ui pattern, Radix UI

**Spec:** `docs/superpowers/specs/2026-08-20-graphite-industrial-style-design.md`

---

### Task 1: index.css — 设计令牌 + 字体 + 背景

**Files:** Modify `src/renderer/src/index.css:1-70`

- [ ] **Step 1: 移除 @font-face 块，替换 @theme 色板，改 body 字体和背景**

将 `index.css` 第 1-70 行替换为：

```css
/* Tailwind CSS v4 - loaded via local package imports */
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/preflight.css" layer(base);
@import "tailwindcss/utilities.css" layer(utilities);

/* Custom theme */
@theme {
  --color-background: #f4f4f5;
  --color-foreground: #18181b;
  --color-card: #ffffff;
  --color-card-foreground: #18181b;
  --color-primary: #18181b;
  --color-primary-foreground: #ffffff;
  --color-secondary: #f4f4f5;
  --color-secondary-foreground: #18181b;
  --color-muted: #fafafa;
  --color-muted-foreground: #71717a;
  --color-accent: #ea580c;
  --color-accent-foreground: #ffffff;
  --color-destructive: #dc2626;
  --color-destructive-foreground: #ffffff;
  --color-border: #e4e4e7;
  --color-input: #e4e4e7;
  --color-ring: #ea580c;
}

* {
  border-color: var(--color-border);
}

html,
body,
#root {
  height: 100%;
}

body {
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-family: -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  text-rendering: optimizeLegibility;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style: replace theme tokens with graphite palette, remove custom font"
```

---

### Task 2: index.css — 滚动条 + 语义类 + 圆角 + 动画 + 清理

**Files:** Modify `src/renderer/src/index.css:72-323`

- [ ] **Step 1: 替换滚动条变量和样式**

`:root` 滚动条变量改为 `--scrollbar-thumb: #d4d4d8; --scrollbar-thumb-hover: #a1a1aa; --scrollbar-track: #f4f4f5;`

webkit scrollbar thumb 改为 `background: #d4d4d8; border: 2px solid #f4f4f5;`（移除 linear-gradient）

- [ ] **Step 2: 替换所有语义 CSS 类**

`.soft-card`: `background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.04); border:1px solid #e4e4e7; border-radius:4px;`

`.soft-card-hover:hover`: `box-shadow:0 2px 4px rgba(0,0,0,0.06); border-color:#d4d4d8;`

`.soft-btn`: `background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.04); border:1px solid #d4d4d8; border-radius:3px;`

`.soft-btn:hover`: `background:#fafafa; border-color:#a1a1aa;`

`.soft-btn:active`: `background:#f4f4f5; box-shadow:inset 0 1px 2px rgba(0,0,0,0.06);`

`.soft-input`: `background:#fff; border:1px solid #d4d4d8; border-radius:3px;`

`.soft-input:focus`: `border-color:#ea580c; box-shadow:0 0 0 2px rgba(234,88,12,0.15);`

`.soft-surface` / `.soft-surface-subtle` / `.soft-titlebar`: `background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.06); border:1px solid #e4e4e7;`

`.soft-inset`: `background:#fafafa; border:1px solid #e4e4e7;`

`.soft-pill`: `background:#fff7ed; border:1px solid #fed7aa; color:#ea580c;`

`.soft-panel-edge`: `border:1px solid #e4e4e7;`

- [ ] **Step 3: 清空 organic-serif，移除 organic-shape 和 leaf-shape**

`.organic-serif` 改为空样式（注释 `/* inherits body font-family */`），删除 `.organic-shape` 和 `.leaf-shape`

- [ ] **Step 4: 替换圆角覆盖**

`rounded-sm` → 2px, `rounded`/`rounded-md` → 3px, `rounded-lg` → 4px, `rounded-xl` → 4px, `rounded-2xl`/`rounded-3xl`/`rounded-full` → 4px。移除所有 `[class*="rounded-[..."]]` 选择器。

- [ ] **Step 5: 替换 gen-grid 颜色**

`rgba(132,141,102,0.16)` → `rgba(120,120,120,0.12)`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style: rewrite semantic CSS classes, radius, scrollbar for graphite theme"
```

---

### Task 3: tailwind.config.js

**Files:** Modify `tailwind.config.js`

- [ ] **Step 1: 替换色板和 borderRadius**

colors: background `#f4f4f5`, foreground `#18181b`, card `#ffffff`/`#18181b`, primary `#18181b`/`#ffffff`, secondary `#f4f4f5`/`#18181b`, muted `#fafafa`/`#71717a`, accent `#ea580c`/`#ffffff`, destructive `#dc2626`, border `#e4e4e7`, input `#e4e4e7`, ring `#ea580c`

borderRadius: sm `0.125rem`, md `0.1875rem`, lg `0.25rem`

- [ ] **Step 2: Commit**

```bash
git add tailwind.config.js
git commit -m "style: update tailwind config with graphite palette"
```

---

### Task 4: Button.tsx

**Files:** Modify `src/renderer/src/components/ui/Button.tsx:24-31`

- [ ] **Step 1: 替换 variant 色值**

`default`: `bg-[#ea580c] text-white shadow-sm hover:bg-[#c2410c]`（移除渐变）

`secondary`: `bg-[#18181b] text-white shadow-sm hover:bg-[#27272a]`（移除渐变）

`destructive`: `bg-[#dc2626] text-white shadow-sm hover:bg-[#b91c1c]`（移除渐变）

`outline`: 保留 `soft-btn text-foreground`

`ghost`: `hover:bg-[#f4f4f5]` 替换 `hover:bg-[#ebe4d6]/80`

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/components/ui/Button.tsx
git commit -m "style: update Button variants to graphite palette"
```

---

### Task 5: Select.tsx

**Files:** Modify `src/renderer/src/components/ui/Select.tsx:17,37,79`

- [ ] **Step 1: SelectTrigger (line 17)**

`border-[#d8ccb5]/80` -> `border-[#e4e4e7]`, `bg-[#fff9ef]/86` -> `bg-[#ffffff]`, remove `shadow-[inset_0_1px_2px_rgba(77,63,46,0.08)]`, `focus:ring-[#8fbc8f]` -> `focus:ring-[#ea580c]`

- [ ] **Step 2: SelectContent (line 37)**

`border-[#d8ccb5]/85` -> `border-[#e4e4e7]`, `bg-[#fff9ef]` -> `bg-[#ffffff]`, `shadow-[0_12px_28px_rgba(88,72,54,0.18)]` -> `shadow-[0_4px_12px_rgba(0,0,0,0.08)]`

- [ ] **Step 3: SelectItem (line 79)**

`focus:bg-[#efe5d3]/70` -> `focus:bg-[#f4f4f5]`, `data-[state=checked]:bg-[#dbe7ca]` -> `data-[state=checked]:bg-[#fff7ed]`, `data-[state=checked]:text-[#2f3b28]` -> `data-[state=checked]:text-[#ea580c]`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/Select.tsx
git commit -m "style: update Select to graphite palette"
```

---

### Task 6: Dialog.tsx

**Files:** Modify `src/renderer/src/components/ui/Dialog.tsx:18,34,41,71,83`

- [ ] **Step 1: Overlay (line 18)**

`bg-[#1f261d]/38 backdrop-blur-sm` -> `bg-[#27272a]/40` (remove backdrop-blur-sm)

- [ ] **Step 2: Content (line 34)**

`border-[#d8cfbc]/80` -> `border-[#e4e4e7]`, `bg-[#fffaf0]` -> `bg-[#ffffff]`, `shadow-[0_24px_60px_rgba(64,52,38,0.28)]` -> `shadow-[0_4px_12px_rgba(0,0,0,0.08)]`

- [ ] **Step 3: Close button (line 41)**

`text-[#6f7d62]` -> `text-[#71717a]`, `hover:bg-[#ebe4d6]/80` -> `hover:bg-[#f4f4f5]`, `hover:text-[#3e4a32]` -> `hover:text-[#18181b]`

- [ ] **Step 4: Title (line 71)**

`text-[#3e4a32]` -> `text-[#18181b]`

- [ ] **Step 5: Description (line 83)**

`text-[#6f6658]` -> `text-[#71717a]`

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/ui/Dialog.tsx
git commit -m "style: update Dialog to graphite palette"
```

---

### Task 7: 8 Extended UI Components

**Files:** Modify 8 files in `src/renderer/src/components/ui/`

- [ ] **Step 1: AlertDialog.tsx**

L15: `bg-[#1f261d]/38 backdrop-blur-sm` -> `bg-[#27272a]/40`
L30: `border-[#d8cfbc]/80` -> `border-[#e4e4e7]`, `bg-[#fffaf0]` -> `bg-[#ffffff]`, `shadow-[0_24px_60px_rgba(64,52,38,0.28)]` -> `shadow-[0_4px_12px_rgba(0,0,0,0.08)]`
L45: `text-[#3e4a32]` -> `text-[#18181b]`
L57: `text-[#6f6658]` -> `text-[#71717a]`
L85: `border-[#d7cbb7]/80` -> `border-[#e4e4e7]`, `bg-[#fffdf8]/92` -> `bg-[#ffffff]`, `text-[#657058]` -> `text-[#52525b]`, `hover:bg-[#f5efe4]` -> `hover:bg-[#f4f4f5]`

- [ ] **Step 2: Tooltip.tsx**

L18: `border-[#d8ccb5]/85` -> `border-[#e4e4e7]`, `bg-[#fff9ef]` -> `bg-[#18181b]`, `text-[#445439]` -> `text-[#fafafa]`, `shadow-[0_14px_32px_rgba(88,72,54,0.2)]` -> `shadow-[0_2px_8px_rgba(0,0,0,0.12)]`, remove `backdrop-blur-xl`

- [ ] **Step 3: Tabs.tsx**

L14: `border-[#d8ccb5]/75` -> `border-[#e4e4e7]`, `bg-[#fff9ef]/76` -> `bg-[#fafafa]`, remove `shadow-[inset_0_1px_2px_rgba(77,63,46,0.08)]`
L30,47: `focus-visible:ring-[#8fbc8f]` -> `focus-visible:ring-[#ea580c]`
L32: `data-[state=active]:bg-[#dbe7ca]` -> `data-[state=active]:bg-[#fff7ed]`, `data-[state=active]:text-[#2f3b28]` -> `data-[state=active]:text-[#ea580c]`

- [ ] **Step 4: Checkbox.tsx**

L13: `border-[#9daf8a]` -> `border-[#d4d4d8]`, `bg-[#fffaf1]` -> `bg-[#ffffff]`
L14: `focus-visible:ring-[#8eaa70]/45` -> `focus-visible:ring-[#ea580c]/40`
L15: `data-[state=checked]:border-[#5d6b4d]` -> `data-[state=checked]:border-[#ea580c]`, `data-[state=checked]:bg-[#5d6b4d]` -> `data-[state=checked]:bg-[#ea580c]`

- [ ] **Step 5: Progress.tsx**

L8: `bg-[linear-gradient(90deg,#8fbc8f_0%,#6f8159_55%,#4f613f_100%)]` -> `bg-[#ea580c]`

- [ ] **Step 6: ScrollArea.tsx**

L52: `bg-[#8ca66e]/70` -> `bg-[#d4d4d8]/70`, `hover:bg-[#6f8159]/82` -> `hover:bg-[#a1a1aa]/82`

- [ ] **Step 7: ToggleGroup.tsx**

L14: `text-[#6a745a]` -> `text-[#52525b]`
L15: `focus-visible:ring-[#8fbc8f]` -> `focus-visible:ring-[#ea580c]`
L17: `data-[state=on]:bg-[#5d6b4d]` -> `data-[state=on]:bg-[#ea580c]`, remove `data-[state=on]:shadow-[0_5px_12px_rgba(93,107,77,0.18)]`
L18: `data-[state=off]:hover:bg-[#d4e4c1]/72` -> `data-[state=off]:hover:bg-[#f4f4f5]`

- [ ] **Step 8: DropdownMenu.tsx**

L17: `border-[#d8ccb5]/85` -> `border-[#e4e4e7]`, `bg-[#fff9ef]` -> `bg-[#ffffff]`, `shadow-[0_12px_28px_rgba(88,72,54,0.18)]` -> `shadow-[0_4px_12px_rgba(0,0,0,0.08)]`
L33: `focus:bg-[#efe5d3]/75` -> `focus:bg-[#f4f4f5]`
L47: `bg-[#d8ccb5]/60` -> `bg-[#e4e4e7]`

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/components/ui/AlertDialog.tsx src/renderer/src/components/ui/Tooltip.tsx src/renderer/src/components/ui/Tabs.tsx src/renderer/src/components/ui/Checkbox.tsx src/renderer/src/components/ui/Progress.tsx src/renderer/src/components/ui/ScrollArea.tsx src/renderer/src/components/ui/ToggleGroup.tsx src/renderer/src/components/ui/DropdownMenu.tsx
git commit -m "style: update 8 extended UI components to graphite palette"
```

---

### Task 8: Popover, ColorPicker, RichTextBox

**Files:** Modify 3 files in `src/renderer/src/components/ui/`

- [ ] **Step 1: Popover.tsx**

L19: `shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)]` -> `shadow-[0_4px_12px_rgba(0,0,0,0.08)]`

- [ ] **Step 2: ColorPicker.tsx**

L98: `border-[#d7cbb7]/70` -> `border-[#e4e4e7]`, `bg-[#fffdf8]` -> `bg-[#ffffff]`, `hover:border-[#879b71]` -> `hover:border-[#a1a1aa]`, `focus-visible:ring-[#5d6b4d]` -> `focus-visible:ring-[#ea580c]`
L101: `rgba(30,38,25,0.12)` -> `rgba(0,0,0,0.08)`
L115: `border-[#d7cbb7]/70` -> `border-[#e4e4e7]`, `bg-[#fffdf8]` -> `bg-[#ffffff]`, `rgba(66,53,36,0.3)` -> `rgba(0,0,0,0.12)`
L132: `#fffdf8` -> `#ffffff`
L135: `#6f7d62` -> `#71717a`
L136: `#f2ece0` -> `#f4f4f5`
L137: `#7b735f` -> `#71717a`
L138: `#3e4a32` -> `#18181b`
L139: `#d7cbb7` -> `#e4e4e7`

- [ ] **Step 3: RichTextBox.tsx**

L115: `rgba(20, 28, 23, 0.9)` -> `rgba(24, 24, 27, 0.9)`, `rgba(20, 28, 23, 0.72)` -> `rgba(24, 24, 27, 0.72)`
L389: `'#34402c'` -> `'#18181b'`
L418: `border-[#d9cdb8]/80` -> `border-[#e4e4e7]`, `hover:bg-[#d4e4c1]/70` -> `hover:bg-[#f4f4f5]`
L430: `'#34402c'` -> `'#18181b'`
L461: `border-[#d9cdb8]/80` -> `border-[#e4e4e7]`, `text-[#3f4b35]` -> `text-[#18181b]`, `focus:border-[#9bb98a]` -> `focus:border-[#ea580c]`
L479: `text-[#5f6e50]` -> `text-[#52525b]`, `hover:bg-[#d4e4c1]/70` -> `hover:bg-[#f4f4f5]`, `hover:text-[#34402c]` -> `hover:text-[#18181b]`
L480: `bg-[#d4e4c1]/80` -> `bg-[#fff7ed]`, `text-[#34402c]` -> `text-[#ea580c]`
L588: `border-[#ded2bd]/72` -> `border-[#e4e4e7]`, `bg-[#fffdf8]/88` -> `bg-[#ffffff]`, `rgba(74,59,42,0.05)` -> `rgba(0,0,0,0.04)`
L596: `border-[#ded2bd]/60` -> `border-[#e4e4e7]`, `bg-[#fbf6ec]/78` -> `bg-[#fafafa]`
L612: `'#20271f'` -> `'#18181b'`
L616: `selection:bg-[#d4e4c1]/72` -> `selection:bg-[#fff7ed]`, `selection:text-[#20271f]` -> `selection:text-[#18181b]`

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ui/Popover.tsx src/renderer/src/components/ui/ColorPicker.tsx src/renderer/src/components/ui/RichTextBox.tsx
git commit -m "style: update Popover, ColorPicker, RichTextBox to graphite palette"
```

---

### Task 9: App.tsx + Sidebar.tsx

**Files:** Modify `src/renderer/src/App.tsx:65,68`, `src/renderer/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: App.tsx**

L65: `bg-background/85 backdrop-blur-xl` -> `bg-background/95` (remove backdrop-blur-xl)
L68: `bg-[#f7f0e2]/40` -> `bg-[#f4f4f5]/40`

- [ ] **Step 2: Sidebar.tsx**

L60: remove `organic-serif` class, `text-[#3e4a32]` -> `text-[#18181b]`
L64: `text-[#7f876e]` -> `text-[#71717a]`
L71: `text-[#4a5a3d]` -> `text-[#52525b]`, `hover:bg-[#efe5d3]/75` -> `hover:bg-[#fafafa]`
L87: `bg-[#dbe7ca]/80 text-[#2f3b28]` -> `bg-[#fff7ed] text-[#ea580c]`
L88: `text-[#58664a] hover:bg-[#efe5d3]/75 hover:text-[#38452f]` -> `text-[#52525b] hover:bg-[#fafafa] hover:text-[#18181b]`
L101: `bg-gradient-to-r from-[#6f8159] to-[#4f613f]` -> `bg-[#ea580c]`, `shadow-lg shadow-[#5d6b4d]/30` -> `shadow-sm`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/layout/Sidebar.tsx
git commit -m "style: update App layout and Sidebar to graphite palette"
```

---

### Task 10: Store Chart Color Defaults

**Files:** Modify `src/renderer/src/store/editSessionStore.ts`, `src/renderer/src/store/htmlEditStore.ts`

- [ ] **Step 1: editSessionStore.ts**

`chartPrimaryColor: '#5d6b4d'` -> `'#ea580c'` (lines 587, 630)
`chartAccentColor: '#8fbc8f'` -> `'#18181b'` (lines 588, 631)
`chartTextColor: '#2f3b28'` -> `'#18181b'` (lines 589, 632)

- [ ] **Step 2: htmlEditStore.ts**

`chartPrimaryColor: '#5d6b4d'` -> `'#ea580c'` (lines 590, 633)
`chartAccentColor: '#8fbc8f'` -> `'#18181b'` (lines 591, 634)
`chartTextColor: '#2f3b28'` -> `'#18181b'` (lines 592, 635)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/store/editSessionStore.ts src/renderer/src/store/htmlEditStore.ts
git commit -m "style: update store chart color defaults to graphite palette"
```

---

### Task 11: Batch Replace — Background & Surface Colors

**Files:** All `*.tsx` and `*.ts` in `src/renderer/src/` (excluding already-done `components/ui/`)

- [ ] **Step 1: Run sed batch replacement**

```bash
cd src/renderer/src

find . -name '*.tsx' -o -name '*.ts' | xargs sed -i '' \
  -e 's/#f5f1e8/#f4f4f5/g' \
  -e 's/#f7f0e2/#f4f4f5/g' \
  -e 's/#fff9ef/#ffffff/g' \
  -e 's/#fffaf0/#ffffff/g' \
  -e 's/#fffdf8/#ffffff/g' \
  -e 's/#fffaf1/#ffffff/g' \
  -e 's/#fff7e8/#ffffff/g' \
  -e 's/#efe7d7/#fafafa/g' \
  -e 's/#efe7d8/#fafafa/g' \
  -e 's/#efe5d3/#fafafa/g' \
  -e 's/#ebe4d6/#f4f4f5/g' \
  -e 's/#e8e0d0/#f4f4f5/g' \
  -e 's/#f5efe4/#fafafa/g' \
  -e 's/#fbf6ec/#fafafa/g'
```

- [ ] **Step 2: Verify no leftovers**

```bash
rg '#f5f1e8|#f7f0e2|#fff9ef|#fffaf0|#fffdf8|#fffaf1|#fff7e8|#efe7d7|#efe7d8|#efe5d3|#ebe4d6|#e8e0d0|#f5efe4|#fbf6ec' src/renderer/src -l
```

Expected: empty output

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: batch replace background/surface colors across all files"
```

---

### Task 12: Batch Replace — Border Colors

**Files:** All `*.tsx` and `*.ts` in `src/renderer/src/`

- [ ] **Step 1: Run sed batch replacement**

```bash
find . -name '*.tsx' -o -name '*.ts' | xargs sed -i '' \
  -e 's/#d8ccb5/#e4e4e7/g' \
  -e 's/#d8cfbc/#e4e4e7/g' \
  -e 's/#d7cbb7/#e4e4e7/g' \
  -e 's/#d9cfbd/#e4e4e7/g' \
  -e 's/#ded2bd/#e4e4e7/g' \
  -e 's/#e1d6c4/#e4e4e7/g' \
  -e 's/#e0d8c8/#e4e4e7/g' \
  -e 's/#d9cdb8/#e4e4e7/g'
```

- [ ] **Step 2: Verify no leftovers**

```bash
rg '#d8ccb5|#d8cfbc|#d7cbb7|#d9cfbd|#ded2bd|#e1d6c4|#e0d8c8|#d9cdb8' src/renderer/src -l
```

Expected: empty output

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: batch replace border colors across all files"
```

---

### Task 13: Batch Replace — Accent/Green Colors

**Files:** All `*.tsx` and `*.ts` in `src/renderer/src/`

- [ ] **Step 1: Run sed batch replacement**

```bash
find . -name '*.tsx' -o -name '*.ts' | xargs sed -i '' \
  -e 's/#6f8159/#ea580c/g' \
  -e 's/#4f613f/#ea580c/g' \
  -e 's/#8fbc8f/#ea580c/g' \
  -e 's/#d4e4c1/#fff7ed/g' \
  -e 's/#dbe7ca/#fff7ed/g' \
  -e 's/#c7d9b4/#fff7ed/g' \
  -e 's/#c8d6ba/#fff7ed/g'
```

- [ ] **Step 2: Verify no leftovers**

```bash
rg '#6f8159|#4f613f|#8fbc8f|#d4e4c1|#dbe7ca|#c7d9b4|#c8d6ba' src/renderer/src -l
```

Expected: empty output

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: batch replace accent/green colors to orange across all files"
```

---

### Task 14: Batch Replace — Text Colors

**Files:** All `*.tsx` and `*.ts` in `src/renderer/src/`

- [ ] **Step 1: Run sed batch replacement**

```bash
find . -name '*.tsx' -o -name '*.ts' | xargs sed -i '' \
  -e 's/#3e4a32/#18181b/g' \
  -e 's/#5d6b4d/#18181b/g' \
  -e 's/#2f3b28/#18181b/g' \
  -e 's/#38452f/#18181b/g' \
  -e 's/#34402c/#18181b/g' \
  -e 's/#33402a/#18181b/g' \
  -e 's/#7a8369/#71717a/g' \
  -e 's/#7a875f/#71717a/g' \
  -e 's/#7f876e/#71717a/g' \
  -e 's/#6f7d62/#71717a/g' \
  -e 's/#6f6658/#71717a/g' \
  -e 's/#8a9a7b/#a1a1aa/g' \
  -e 's/#9bb98a/#a1a1aa/g' \
  -e 's/#5f6b50/#52525b/g' \
  -e 's/#58664a/#52525b/g' \
  -e 's/#4a5a3d/#52525b/g' \
  -e 's/#4f5f42/#52525b/g' \
  -e 's/#4f6340/#52525b/g' \
  -e 's/#7c6a4c/#52525b/g' \
  -e 's/#6d604d/#52525b/g' \
  -e 's/#3f4b35/#27272a/g' \
  -e 's/#d6c08d/#a1a1aa/g'
```

- [ ] **Step 2: Verify no leftovers**

```bash
rg '#3e4a32|#5d6b4d|#2f3b28|#38452f|#34402c|#33402a|#7a8369|#7a875f|#7f876e|#6f7d62|#6f6658|#8a9a7b|#9bb98a|#5f6b50|#58664a|#4a5a3d|#4f5f42|#4f6340|#7c6a4c|#6d604d|#3f4b35|#d6c08d' src/renderer/src -l
```

Expected: empty output

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: batch replace text colors to graphite palette across all files"
```

---

### Task 15: Batch Replace — Danger/Overlay Colors

**Files:** All `*.tsx` and `*.ts` in `src/renderer/src/`

- [ ] **Step 1: Run sed batch replacement**

```bash
find . -name '*.tsx' -o -name '*.ts' | xargs sed -i '' \
  -e 's/#b15a58/#dc2626/g' \
  -e 's/#c97a64/#dc2626/g' \
  -e 's/#8e5a53/#dc2626/g' \
  -e 's/#1f261d/#27272a/g'
```

- [ ] **Step 2: Verify no leftovers**

```bash
rg '#b15a58|#c97a64|#8e5a53|#1f261d' src/renderer/src -l
```

Expected: empty output

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: batch replace danger/overlay colors across all files"
```

---

### Task 16: Remaining Color Cleanup

**Files:** All `*.tsx` and `*.ts` in `src/renderer/src/`

- [ ] **Step 1: Search for any remaining warm colors not yet covered**

```bash
rg '#8ca66e|#8eaa70|#9daf8a|#6a745a|#657058|#5f6e50|#879b71|#7b735f|#f2ece0|#445439|#20271f|#879b71' src/renderer/src -l
```

If any files found, replace each using the mapping:
- `#8ca66e` -> `#d4d4d8`
- `#8eaa70` -> `#ea580c`
- `#9daf8a` -> `#d4d4d8`
- `#6a745a` -> `#52525b`
- `#657058` -> `#52525b`
- `#5f6e50` -> `#52525b`
- `#879b71` -> `#a1a1aa`
- `#7b735f` -> `#71717a`
- `#f2ece0` -> `#f4f4f5`
- `#445439` -> `#fafafa`
- `#20271f` -> `#18181b`

- [ ] **Step 2: Search for any remaining `rgba` warm shadows**

```bash
rg 'rgba\(88,7[0-9],5[0-9]|rgba\(64,5[0-9],3[0-9]|rgba\(86,7[0-9],5[0-9]|rgba\(77,6[0-9],4[0-9]|rgba\(74,5[0-9],4[0-9]|rgba\(92,7[0-9],5[0-9]|rgba\(83,7[0-9],5[0-9]|rgba\(79,6[0-9],4[0-9]|rgba\(85,7[0-9],5[0-9]|rgba\(132,141,102' src/renderer/src -l
```

Replace any found with `rgba(0,0,0,0.0X)` using judgment based on original alpha.

- [ ] **Step 3: Search for remaining gradient classes**

```bash
rg 'bg-gradient-to-r from-\[#|bg-gradient-to-r from-\[#' src/renderer/src -l
```

Replace `bg-gradient-to-r from-[...] to-[...]` with solid `bg-[#ea580c]` or `bg-[#18181b]` depending on context.

- [ ] **Step 4: Search for remaining backdrop-blur**

```bash
rg 'backdrop-blur' src/renderer/src -l
```

Remove `backdrop-blur-sm` and `backdrop-blur-xl` from all files (replace titlebar with opaque bg).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "style: cleanup remaining warm colors, gradients, backdrop-blur"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Run app and visually verify**

```bash
pnpm dev
```

Check each page: Home, Sessions, Session Create, Session Detail, Templates, Styles, Fonts, Settings, Edit HTML, Token Usage. Verify:
- No warm/green/cream colors remain
- Orange accent appears on buttons, active states, focus rings
- 3-4px border radius throughout
- Light shadows (no heavy multi-layer shadows)
- No gradient buttons
- No backdrop-blur
- System font rendering correctly

- [ ] **Step 2: Run existing tests**

```bash
pnpm test
```

All tests should pass (style changes should not affect logic tests).

- [ ] **Step 3: Search for any remaining old color values**

```bash
rg '#f5f1e8|#3e4a32|#5d6b4d|#8fbc8f|#6f8159|#4f613f|#d4e4c1|#dbe7ca|#d8ccb5|#d8cfbc|#fff9ef|#fffaf0|#fffdf8|#efe5d3|#e8e0d0|#1f261d|#b15a58' src/renderer/src -l
```

Expected: empty output. If any remain, fix them.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "style: final verification and cleanup for graphite industrial theme"
```
