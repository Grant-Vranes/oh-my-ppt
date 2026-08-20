# Graphite Industrial 风格改造设计

> 将 oh-my-ppt 从暖色有机自然风改为石墨工业商务风。

## 决策摘要

| 维度 | 选择 |
|------|------|
| 整体方向 | Graphite — 石墨商务风 |
| 明暗模式 | 纯浅色 |
| 强调色 | 工业橙 #ea580c |
| 字体 | System UI (SF Pro / Segoe) |
| 圆角 | 微圆角 3-4px |
| 阴影 | 轻阴影 1px |

## 新色板

### @theme 设计令牌

| Token | 新值 | 用途 |
|-------|------|------|
| `--color-background` | `#f4f4f5` | 页面背景 |
| `--color-foreground` | `#18181b` | 主文字 |
| `--color-card` | `#ffffff` | 卡片表面 |
| `--color-card-foreground` | `#18181b` | 卡片文字 |
| `--color-primary` | `#18181b` | 主色（黑色） |
| `--color-primary-foreground` | `#ffffff` | 主色上的文字 |
| `--color-secondary` | `#f4f4f5` | 次级背景 |
| `--color-secondary-foreground` | `#18181b` | 次级文字 |
| `--color-muted` | `#fafafa` | 静默表面 |
| `--color-muted-foreground` | `#71717a` | 静默文字 |
| `--color-accent` | `#ea580c` | 强调色（工业橙） |
| `--color-accent-foreground` | `#ffffff` | 强调色上的文字 |
| `--color-destructive` | `#dc2626` | 危险红 |
| `--color-destructive-foreground` | `#ffffff` | 危险色上的文字 |
| `--color-border` | `#e4e4e7` | 边框 |
| `--color-input` | `#e4e4e7` | 输入框边框 |
| `--color-ring` | `#ea580c` | 焦点环 |

### 辅助色（非令牌，在组件中硬编码使用）

| 色值 | 用途 |
|------|------|
| `#fff7ed` | 强调色软底（accent soft，用于 pill/badge 背景） |
| `#fed7aa` | 强调色软底边框 |
| `#d4d4d8` | 强边框（border strong） |
| `#a1a1aa` | 次级静默文字 |
| `#52525b` | 次级文字 |
| `#27272a` | 遮罩层 overlay |
| `#c2410c` | 强调色 hover |
| `#b91c1c` | 危险色 hover |

## 核心颜色映射表

### 令牌层（index.css @theme）

| 旧值 | 新值 | 用途 |
|------|------|------|
| `#f5f1e8` | `#f4f4f5` | background |
| `#3e4a32` | `#18181b` | foreground / card-foreground |
| `rgba(255,251,244,0.88)` | `#ffffff` | card |
| `#5d6b4d` | `#18181b` | primary |
| `#e8e0d0` | `#f4f4f5` | secondary |
| `#4f5f42` | `#18181b` | secondary-foreground |
| `#efe7d7` | `#fafafa` | muted |
| `#7a8369` | `#71717a` | muted-foreground |
| `#d4e4c1` | `#ea580c` | accent |
| `#3e4a32` | `#18181b` | accent-foreground |
| `#b15a58` | `#dc2626` | destructive |
| `rgba(161,142,112,0.26)` | `#e4e4e7` | border |
| `rgba(78,96,64,0.12)` | `#e4e4e7` | input |
| `#8fbc8f` | `#ea580c` | ring |

### 硬编码色值映射（~86 个 .tsx/.ts 文件）

全局替换映射表，所有 .tsx/.ts 文件中的旧硬编码色值按此表替换：

**背景/表面类**

| 旧色 | 新色 | 语义 |
|------|------|------|
| `#f5f1e8` | `#f4f4f5` | 背景 |
| `#f7f0e2` | `#f4f4f5` | 侧栏背景 |
| `#fff9ef` | `#ffffff` | 白色表面 |
| `#fffaf0` | `#ffffff` | 白色表面 |
| `#fffdf8` | `#ffffff` | 白色表面 |
| `#fffaf1` | `#ffffff` | 白色表面 |
| `#fff7e8` | `#ffffff` | 白色表面 |
| `#efe7d7` | `#fafafa` | 静默表面 |
| `#efe7d8` | `#fafafa` | 静默表面 |
| `#efe5d3` | `#fafafa` | hover 背景 |
| `#ebe4d6` | `#f4f4f5` | hover 背景 |
| `#e8e0d0` | `#f4f4f5` | 次级背景 |
| `#f5efe4` | `#fafafa` | 软表面 |

**边框类**

| 旧色 | 新色 | 语义 |
|------|------|------|
| `#d8ccb5` | `#e4e4e7` | 边框 |
| `#d8cfbc` | `#e4e4e7` | 边框 |
| `#d7cbb7` | `#e4e4e7` | 边框 |
| `#d9cfbd` | `#e4e4e7` | 边框 |
| `#ded2bd` | `#e4e4e7` | 边框 |
| `#e1d6c4` | `#e4e4e7` | 边框 |
| `#e0d8c8` | `#e4e4e7` | 边框 |

**强调/绿系 → 橙系**

| 旧色 | 新色 | 语义 |
|------|------|------|
| `#6f8159` | `#ea580c` | 渐变 from → 纯色强调 |
| `#4f613f` | `#ea580c` | 渐变 to → 纯色强调 |
| `#8fbc8f` | `#ea580c` | 焦点环/ring |
| `#d4e4c1` | `#fff7ed` | 强调软底 |
| `#dbe7ca` | `#fff7ed` | 强调软底 |
| `#c7d9b4` | `#fff7ed` | 强调软底 |
| `#c8d6ba` | `#fff7ed` | 强调软底 |

**文字类**

| 旧色 | 新色 | 语义 |
|------|------|------|
| `#3e4a32` | `#18181b` | 主文字/前景 |
| `#5d6b4d` | `#18181b` | 主色/primary |
| `#2f3b28` | `#18181b` | 深色文字 |
| `#38452f` | `#18181b` | 深色文字 |
| `#34402c` | `#18181b` | 深色文字 |
| `#33402a` | `#18181b` | 深色文字 |
| `#7a8369` | `#71717a` | 静默文字 |
| `#7a875f` | `#71717a` | 静默文字 |
| `#7f876e` | `#71717a` | 静默文字 |
| `#6f7d62` | `#71717a` | 静默文字 |
| `#6f6658` | `#71717a` | 静默文字 |
| `#8a9a7b` | `#a1a1aa` | 次级静默文字 |
| `#9bb98a` | `#a1a1aa` | 次级静默文字 |
| `#5f6b50` | `#52525b` | 次级文字 |
| `#58664a` | `#52525b` | 次级文字 |
| `#4a5a3d` | `#52525b` | 次级文字 |
| `#4f5f42` | `#52525b` | 次级文字 |
| `#4f6340` | `#52525b` | 次级文字 |
| `#7c6a4c` | `#52525b` | 次级文字 |
| `#6d604d` | `#52525b` | 次级文字 |
| `#3f4b35` | `#27272a` | 深色文字 |
| `#d6c08d` | `#a1a1aa` | 装饰金 → 灰 |

**危险/遮罩类**

| 旧色 | 新色 | 语义 |
|------|------|------|
| `#b15a58` | `#dc2626` | 危险色 |
| `#c97a64` | `#dc2626` | 危险色 hover |
| `#8e5a53` | `#dc2626` | 危险/错误 |
| `#1f261d` | `#27272a` | 遮罩 |

### Store 默认图表色

| 文件 | 旧值 | 新值 | 字段 |
|------|------|------|------|
| `store/editSessionStore.ts` | `#5d6b4d` | `#ea580c` | chartPrimaryColor |
| `store/editSessionStore.ts` | `#8fbc8f` | `#18181b` | chartAccentColor |
| `store/editSessionStore.ts` | `#2f3b28` | `#18181b` | chartTextColor |
| `store/htmlEditStore.ts` | `#5d6b4d` | `#ea580c` | chartPrimaryColor |
| `store/htmlEditStore.ts` | `#8fbc8f` | `#18181b` | chartAccentColor |
| `store/htmlEditStore.ts` | `#2f3b28` | `#18181b` | chartTextColor |

## CSS 层变更

### index.css 改动

#### 字体
- 移除 3 个 `@font-face`（ElmsSans-Light/Regular/Bold）
- body `font-family` 改为 `-apple-system, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif`
- `.organic-serif` 保留类名但清空样式（仅继承 body 字体），避免逐文件修改 21 处引用

#### 背景
- body 移除 `background-image`（radial-gradient + linear-gradient）
- body `background-color` 改为 `#f4f4f5`

#### 滚动条
- `--scrollbar-thumb`: `#d4d4d8`
- `--scrollbar-thumb-hover`: `#a1a1aa`
- `--scrollbar-track`: `#f4f4f5`
- webkit scrollbar thumb 移除 `linear-gradient`，改为纯色 `#d4d4d8`
- webkit scrollbar thumb border 改为 `2px solid #f4f4f5`

#### 语义 CSS 类重写

| 类 | 新样式 |
|----|--------|
| `.soft-card` | `background:#fff; border:1px solid #e4e4e7; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.04)` |
| `.soft-card-hover:hover` | `box-shadow:0 2px 4px rgba(0,0,0,0.06); border-color:#d4d4d8` |
| `.soft-btn` | `background:#fff; border:1px solid #d4d4d8; border-radius:3px; box-shadow:0 1px 2px rgba(0,0,0,0.04)` |
| `.soft-btn:hover` | `background:#fafafa; border-color:#a1a1aa` |
| `.soft-btn:active` | `background:#f4f4f5; box-shadow:inset 0 1px 2px rgba(0,0,0,0.06)` |
| `.soft-input` | `background:#fff; border:1px solid #d4d4d8; border-radius:3px` |
| `.soft-input:focus` | `border-color:#ea580c; box-shadow:0 0 0 2px rgba(234,88,12,0.15)` |
| `.soft-surface` / `.soft-surface-subtle` / `.soft-titlebar` | `background:#fff; border:1px solid #e4e4e7; box-shadow:0 1px 3px rgba(0,0,0,0.06)` |
| `.soft-inset` | `background:#fafafa; border:1px solid #e4e4e7` |
| `.soft-pill` | `background:#fff7ed; border:1px solid #fed7aa; color:#ea580c` |
| `.soft-panel-edge` | `border:1px solid #e4e4e7` |

#### 圆角覆盖

```
rounded-sm  → 2px
rounded-md  → 3px
rounded-lg  → 4px
rounded-xl  → 4px
rounded-2xl, rounded-3xl → 4px
rounded-full → 4px
```

移除所有 `[class*="rounded-[..."]` 属性选择器覆盖。

#### 动画
- 保留 `shell-enter`、`gen-grid-pan`、`gen-orb-float`、`gen-shimmer-slide` 动画
- `gen-grid` 背景线颜色从 `rgba(132,141,102,0.16)` 改为 `rgba(120,120,120,0.12)`

#### 清理
- `.organic-serif` 保留类名但清空样式（见下方 organic-serif 类处理）
- 移除 `.organic-shape`（已无使用）
- 移除 `.leaf-shape`（已无使用）

### tailwind.config.js 改动

将 `theme.extend.colors` 更新为与 @theme 一致的石墨色板：
- background: `#f4f4f5`, foreground: `#18181b`
- card: `#ffffff` / `#18181b`
- primary: `#18181b` / `#ffffff`
- secondary: `#f4f4f5` / `#18181b`
- muted: `#fafafa` / `#71717a`
- accent: `#ea580c` / `#ffffff`
- destructive: `#dc2626`
- border: `#e4e4e7`, input: `#e4e4e7`, ring: `#ea580c`

borderRadius: sm `0.125rem` (2px), md `0.1875rem` (3px), lg `0.25rem` (4px)

## 组件层变更

### Button.tsx
- `default`: `bg-[#ea580c] text-white shadow-sm hover:bg-[#c2410c]`（移除渐变）
- `secondary`: `bg-[#18181b] text-white shadow-sm hover:bg-[#27272a]`（移除渐变）
- `destructive`: `bg-[#dc2626] text-white shadow-sm hover:bg-[#b91c1c]`（移除渐变）
- `outline`: 保留 `soft-btn` 类（已重写为石墨风）
- `ghost`: `hover:bg-[#f4f4f5]` 替换 `hover:bg-[#ebe4d6]/80`

### Select.tsx
- Trigger: `border-[#e4e4e7]` `bg-[#ffffff]` `focus:ring-[#ea580c]`，移除 inset shadow
- Content: `border-[#e4e4e7]` `bg-[#ffffff]` `shadow-[0_4px_12px_rgba(0,0,0,0.08)]`
- Item: `focus:bg-[#f4f4f5]` `data-[state=checked]:bg-[#fff7ed]` `data-[state=checked]:text-[#ea580c]`

### Dialog.tsx
- Overlay: `bg-[#27272a]/40`
- Content: `border-[#e4e4e7]` `bg-[#ffffff]` `shadow-[0_4px_12px_rgba(0,0,0,0.08)]`
- Close: `text-[#71717a]` `hover:bg-[#f4f4f5]` `hover:text-[#18181b]`
- Title: `text-[#18181b]`
- Description: `text-[#71717a]`

### 其他 UI 组件
- `AlertDialog.tsx`: 同 Dialog 风格
- `Tooltip.tsx`: `bg-[#18181b]` `text-[#fafafa]` `border-[#27272a]`
- `Tabs.tsx`: active `text-[#18181b]` border-b-2 `border-[#ea580c]`，inactive `text-[#71717a]`
- `Checkbox.tsx`: `bg-[#ea580c]` border-[#ea580c]
- `Progress.tsx`: `bg-[#ea580c]` 纯色（移除渐变）
- `ScrollArea.tsx`: thumb `#d4d4d8`
- `ToggleGroup.tsx`: active `bg-[#fff7ed]` `text-[#ea580c]`
- `DropdownMenu.tsx`: 同 Select 风格
- `ColorPicker.tsx`: 表面色值替换

### App.tsx
- Titlebar: `bg-background/95` 移除 `backdrop-blur-xl`
- Sidebar aside: `bg-[#f4f4f5]/40` 替换 `bg-[#f7f0e2]/40`

### Sidebar.tsx
- Logo title: `text-[#18181b]`（`organic-serif` 类保留但已清空样式）
- Tagline: `text-[#71717a]`
- Nav active: `bg-[#fafafa]` `text-[#18181b]` border-left-2 `border-[#ea580c]`
- Nav inactive: `text-[#52525b]` `hover:bg-[#fafafa]`
- New button: `bg-[#ea580c]` `hover:bg-[#c2410c]`（移除渐变）
- Back link: `text-[#52525b]` `hover:bg-[#fafafa]`

## organic-serif 类处理

`organic-serif` 被 21 处使用。策略：保留类名但重写为空样式（仅继承字体），避免逐文件修改。后续可逐步移除类名引用。

## 不在范围内的内容

- PPT 生成内容的样式（`resources/google-fonts/`、模板 HTML）不受影响
- `src/main/` 主进程代码不受影响
- `src/shared/` 共享类型不受影响
- 应用功能逻辑不变，仅视觉样式调整
- 不新增深色模式
