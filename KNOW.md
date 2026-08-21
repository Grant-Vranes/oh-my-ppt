# ChatPPT — 项目结构与模块分析

## 项目概述

**ChatPPT** (v2.2.0) 是一个 **本地优先的 AI 演示文稿工作台**——用 Electron 构建的桌面应用，核心是「AI 驱动的可编辑 HTML PPT」：AI 生成完整的 HTML 幻灯片，可在浏览器中预览、可视化编辑，并导出为 PPTX/PDF/PNG/MP4。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 39 + electron-vite 5 |
| 前端 | React 19, TypeScript 5.9, Tailwind CSS 4, Radix UI, Zustand 5 |
| 路由 | react-router-dom 7 (HashRouter) |
| AI/LLM | LangChain 1.x (Anthropic, OpenAI, Gemini), DeepAgents, LangGraph |
| 数据库 | SQLite + Drizzle ORM 0.44 |
| 版本控制 | isomorphic-git (会话历史) |
| PPTX I/O | @arcsin1/pptx2json (导入), @arcsin1/html2pptx (导出) — 自研 |
| 编辑器运行时 | @arcsin1/presentation-editor-runtime |
| 测试 | Vitest 4 + happy-dom |
| 包管理 | pnpm 10 |
| 构建/打包 | electron-builder 26 |

## 核心目录结构

```
oh-my-ppt/
├── src/
│   ├── main/                          # Electron 主进程 (Node.js)
│   │   ├── index.ts                   # 入口 — 创建 MainApplication
│   │   ├── app/                       # 应用生命周期
│   │   │   ├── application.ts         # MainApplication 类 — 组合根，持有 DB/agent/window/IPC
│   │   │   ├── lifecycle.ts           # 日志、更新通知
│   │   │   ├── menu.ts                # 窗口菜单配置
│   │   │   ├── tray.ts                # 系统托盘 (Windows)
│   │   │   ├── window.ts              # BrowserWindow 创建
│   │   │   └── renderer-recovery.ts   # 崩溃恢复
│   │   ├── agent-runtime/             # AI Agent 编排 (DeepAgents + LangChain)
│   │   │   ├── agent/                 # Agent 工厂和管理器
│   │   │   │   ├── manager.ts         # AgentManager — 每会话 Agent 实例
│   │   │   │   ├── factory.ts         # createSessionEditAgent / createSessionDeckAgent
│   │   │   │   ├── backend.ts         # GuardedFilesystemBackend — 限制文件操作范围
│   │   │   │   └── types.ts           # DeepAgentStreamResult, context types
│   │   │   ├── events/                # TypedEventBus + 事件信封
│   │   │   ├── job/                   # JobCoordinator — 资源锁 & 取消
│   │   │   ├── lock/                  # ResourceLock — claim-based 并发控制
│   │   │   ├── model/                 # LLM 模型解析 (OpenAI, Anthropic, Google)
│   │   │   ├── prompt/                # 系统提示词模板
│   │   │   ├── provider/              # 图片 & 视觉 provider
│   │   │   ├── skills/                # 产品技能后端
│   │   │   ├── tools/                 # LangChain 工具 (deck-tools, page-writer)
│   │   │   ├── types.ts               # RuntimeDomain, RuntimeOwner, RuntimeAudience
│   │   │   └── index.ts
│   │   ├── animation/                 # 动画 schema & 校验
│   │   ├── config/                    # 设置 & 模型配置处理
│   │   ├── db/                        # 数据库层
│   │   │   ├── schema.ts              # Drizzle ORM schema (22 张表)
│   │   │   ├── database.ts            # PPTDatabase 类 — 全部 CRUD 操作
│   │   │   └── patch/                 # DB 迁移补丁
│   │   ├── edit-jobs/                 # 编辑任务服务
│   │   │   ├── deck-edit-job-service.ts
│   │   │   ├── page-edit-job-service.ts
│   │   │   ├── page-beautify-job-service.ts
│   │   │   └── style-switch-job-service.ts
│   │   ├── element-editor/            # 元素级编辑 (图表数据, 同步)
│   │   ├── generation/                # PPT 生成流程 (27 文件)
│   │   │   ├── handlers.ts            # IPC handlers for generate:*
│   │   │   ├── context.ts             # GenerationContext 组装
│   │   │   ├── deck-flow.ts           # 全册生成
│   │   │   ├── edit-flow.ts           # 页面编辑流程
│   │   │   ├── retry-flow.ts          # 重试失败页面
│   │   │   ├── add-page-flow.ts       # 添加新页面
│   │   │   ├── template-deck-flow.ts  # 模板生成
│   │   │   ├── style-switch.ts        # 换风格
│   │   │   └── ...
│   │   ├── history/                   # Git 版本历史
│   │   │   ├── git-history-service.ts # isomorphic-git 操作
│   │   │   └── handlers.ts            # IPC handlers for history:*
│   │   ├── html-editor/               # 独立 HTML 文件编辑器
│   │   ├── image-generation/          # AI 图片生成
│   │   ├── io/                        # I/O 操作
│   │   │   ├── assets-handlers.ts     # 资源上传/管理
│   │   │   ├── export-handlers.ts     # PDF/PNG/PPTX/MP4 导出
│   │   │   ├── file-handlers.ts       # 文件打开/保存/定位
│   │   │   ├── document-parse-handlers.ts  # 文档解析 (txt, md, csv, docx)
│   │   │   ├── pptx-import/           # PPTX → session 导入 (12 文件)
│   │   │   ├── html-pptx/             # HTML → PPTX 导出 (5 文件)
│   │   │   ├── html-video/            # MP4 视频导出
│   │   │   └── thumbnails/            # HTML 缩略图服务
│   │   ├── ipc/                       # IPC 基础设施
│   │   │   ├── index.ts               # setupIPC — 注册所有 handler
│   │   │   ├── runtime/               # IPC 运行时上下文 (11 文件)
│   │   │   │   ├── context.ts         # IpcContext 门面
│   │   │   │   ├── event-bridge.ts    # 事件桥接到渲染进程
│   │   │   │   ├── credentials.ts     # API key 解密
│   │   │   │   └── ...
│   │   │   ├── thinking/              # Thinking 模式 IPC handler
│   │   │   └── utils.ts
│   │   ├── presentation/              # 演示 HTML 管理
│   │   │   ├── fonts/                 # 字体注册 & 管理
│   │   │   ├── html/                  # HTML 页面 & 索引构建器
│   │   │   ├── templates/             # HTML 模板
│   │   │   ├── assets/                # 资源管理
│   │   │   └── design-contract.ts     # 设计契约 (颜色/字体/布局)
│   │   ├── product-skills/            # 产品技能 (90+ 内置风格)
│   │   ├── session/                   # 会话管理 (21 文件)
│   │   │   ├── handlers.ts            # 会话 CRUD IPC
│   │   │   ├── page-management-*.ts   # 页面 CRUD/重排/删除/复制
│   │   │   ├── page-merge-*.ts        # 从其他会话合并页面
│   │   │   ├── master-*.ts            # 幻灯片母版 (CSS/HTML 覆盖层)
│   │   │   ├── preview-handlers.ts    # 预览加载
│   │   │   ├── presentation-handlers.ts # 演示模式
│   │   │   └── ...
│   │   ├── speech/                    # 演讲稿生成
│   │   ├── styles/                    # 风格管理 (90+ 风格)
│   │   │   ├── catalog.ts             # 风格目录 & DB 同步
│   │   │   ├── handlers.ts            # 风格 IPC
│   │   │   ├── preview/               # 风格预览生成
│   │   │   ├── import/                # 风格包导入
│   │   │   └── ...
│   │   ├── templates/                 # 模板管理
│   │   ├── thinking/                  # "Thinking" 模式 (对话式规划)
│   │   ├── utils/                     # 代理、工具日志
│   │   └── vite-env.d.ts
│   ├── preload/                       # Electron 预加载脚本
│   │   ├── index.ts                   # 向渲染进程暴露 electron API
│   │   └── index.d.ts                 # 类型声明
│   ├── renderer/                      # 渲染进程 (React 应用)
│   │   ├── index.html                 # HTML 入口
│   │   └── src/
│   │       ├── main.tsx               # React 入口 (StrictMode + HashRouter)
│   │       ├── App.tsx                # 路由 & 布局
│   │       ├── pages/                 # 15 个页面组件
│   │       │   ├── home.tsx
│   │       │   ├── session-create.tsx
│   │       │   ├── session-detail.tsx
│   │       │   ├── session-generating.tsx
│   │       │   ├── sessions.tsx
│   │       │   ├── settings.tsx
│   │       │   ├── styles.tsx
│   │       │   ├── style-editor.tsx
│   │       │   ├── fonts.tsx
│   │       │   ├── templates.tsx
│   │       │   ├── edit-html.tsx
│   │       │   ├── edit-html-list.tsx
│   │       │   ├── thinking-detail.tsx
│   │       │   ├── token-usage.tsx
│   │       │   └── template-sessions-generating.tsx
│   │       ├── components/            # UI 组件
│   │       │   ├── session-detail/    # 会话详情 (12 个子目录)
│   │       │   │   ├── ai-panel/      # AI 聊天面板
│   │       │   │   ├── preview/       # 幻灯片预览
│   │       │   │   ├── sidebar/       # 页面列表侧栏
│   │       │   │   ├── toolbar/       # 编辑工具栏
│   │       │   │   ├── workspace/     # 编辑画布
│   │       │   │   ├── element-inspector/ # 元素属性检查器
│   │       │   │   ├── modal/         # 模态框
│   │       │   │   ├── speech/        # 演讲稿 UI
│   │       │   │   ├── style/         # 换风格 UI
│   │       │   │   ├── browse/        # 浏览模式
│   │       │   │   ├── shared/        # 共享组件
│   │       │   │   └── hooks/         # 会话详情 hooks
│   │       │   ├── ui/                # 17 个 Radix UI 基础组件
│   │       │   ├── layout/            # 侧栏、导航
│   │       │   ├── session-create/    # 创建向导
│   │       │   ├── session-generating/ # 生成进度
│   │       │   ├── settings/          # 设置表单
│   │       │   ├── style/             # 风格管理
│   │       │   ├── templates/         # 模板管理
│   │       │   ├── thinking/          # Thinking 模式 UI
│   │       │   ├── html-editor/       # HTML 编辑器
│   │       │   ├── master-elements/   # 幻灯片母版元素
│   │       │   ├── master-layouts/    # 布局母版
│   │       │   ├── model/             # 模型配置 UI
│   │       │   ├── preview/           # 预览组件
│   │       │   ├── token-usage/       # Token 用量面板
│   │       │   ├── gradient-editor/   # 渐变编辑器
│   │       │   ├── AppToaster.tsx
│   │       │   ├── UpdateAvailableDialog.tsx
│   │       │   └── RendererErrorBoundary.tsx
│   │       ├── store/                 # Zustand stores (20 个文件)
│   │       │   ├── sessionStore.ts    # 会话列表 & 当前会话
│   │       │   ├── generateStore.ts   # 生成/编辑任务状态
│   │       │   ├── sessionDetailStore.ts # 会话详情状态
│   │       │   ├── settingsStore.ts   # 应用设置
│   │       │   ├── editSessionStore.ts # 编辑会话状态
│   │       │   ├── editHistoryStore.ts # 历史版本
│   │       │   ├── thinkingStore.ts   # Thinking 模式
│   │       │   ├── templateStore.ts   # 模板
│   │       │   ├── stylePreviewStore.ts # 风格预览
│   │       │   ├── masterWorkbenchStore.ts # 幻灯片母版
│   │       │   ├── layoutMasterStore.ts    # 布局母版
│   │       │   ├── htmlEditor*.ts     # HTML 编辑器 (4 个 store)
│   │       │   ├── sessionDetailRuntimeStore.ts # 运行时状态
│   │       │   ├── toastStore.ts      # Toast 通知
│   │       │   └── index.ts
│   │       ├── hooks/                 # 5 个自定义 hooks
│   │       ├── lib/                   # 工具库
│   │       │   ├── ipc.ts             # IPC 客户端 (1532 行) — 全部渲染→主进程调用
│   │       │   ├── utils.ts           # 通用工具
│   │       │   ├── sessionMetadata.ts
│   │       │   ├── style-case.ts
│   │       │   └── ...
│   │       ├── i18n/                  # 国际化 (zh, en)
│   │       ├── types/                 # 渲染进程类型
│   │       ├── assets/                # 静态资源
│   │       ├── env.d.ts               # 环境类型声明
│   │       └── index.css              # 全局样式
│   └── shared/                        # 主进程与渲染进程共享类型 (23 文件)
│       ├── generation.ts              # 核心生成类型 (606 行)
│       ├── model-config.ts            # 模型配置类型
│       ├── slide-size.ts              # 幻灯片尺寸预设
│       ├── history.ts                 # 历史版本类型
│       ├── thinking.ts                # Thinking 模式类型
│       ├── image-generation.ts        # 图片生成类型
│       ├── master.ts                  # 幻灯片母版类型 (851 行)
│       ├── element-animation.ts       # 元素动画配置
│       ├── index-transition.ts        # 页面转场类型 (16 种)
│       ├── layout-master.ts           # 布局母版类型
│       ├── speech.ts                  # 演讲稿类型
│       ├── export-progress.ts         # 导出进度
│       ├── thumbnail.ts               # 缩略图类型
│       ├── model-usage.ts             # Token 用量统计
│       ├── page-merge.ts              # 页面合并类型
│       ├── chart-data.ts              # 图表数据类型
│       ├── edit-output.ts             # 编辑输出规范化
│       ├── local-asset.ts             # 本地资源协议
│       ├── model-timeout.ts           # 模型超时配置
│       ├── progress.ts                # 进度标签
│       ├── app-update.ts              # 应用更新类型
│       └── image-mime.ts              # 图片 MIME 类型
├── tests/
│   └── unit/                          # 225 个测试文件, 41 个子目录
│       ├── agent-runtime/
│       ├── generation/
│       ├── session/
│       ├── session-detail/
│       ├── styles/
│       ├── thinking/
│       ├── html-pptx/
│       ├── pptx-import-progress.test.ts
│       ├── model-runtime.test.ts
│       ├── openai-responses-compat.test.ts
│       └── ... (41 个子目录)
├── build/                             # 构建资源 (图标, after-pack.cjs)
├── resources/                         # 应用资源 (字体, ffmpeg, 风格)
├── docs/                              # 文档
├── drizzle/                           # Drizzle 迁移文件
├── package.json
├── electron-builder.yml               # 打包配置
├── electron.vite.config.ts            # Vite 配置 (main/preload/renderer)
├── tsconfig.json                      # 项目引用 (node + web)
├── tsconfig.node.json                 # 主进程 TS 配置
├── tsconfig.web.json                  # 渲染进程 TS 配置
├── vitest.config.ts                   # 测试配置
├── drizzle.config.ts                  # DB 迁移配置
├── AGENTS.md                          # Agent 指南
├── CLAUDE.md                          # Claude 配置
├── README.md / README_EN.md
└── ... (配置文件)
```

## 关键模块职责

### 主进程 (`src/main/`)

#### `app/` — 应用生命周期
- **`application.ts`**: `MainApplication` 类是组合根，初始化数据库、风格、技能、Agent 管理器、主窗口、IPC handler，管理关闭。
- **`window.ts`**: 创建带自定义标题栏、预加载脚本、崩溃恢复的 `BrowserWindow`。

#### `agent-runtime/` — AI Agent 编排
AI 大脑，基于 **DeepAgents + LangChain**：
- **`agent/manager.ts`**: `AgentManager` 维护每会话 Agent 实例（主 Agent + 每页 Agent 用于并发生成）。
- **`agent/factory.ts`**: 创建两种 Agent：
  - `createSessionDeckAgent` — 全册生成（限制 `edit_file`，使用 `update_single_page_file` / `update_page_file` 工具）
  - `createSessionEditAgent` — 编辑（selector/page/deck/container 范围），带 `GuardedFilesystemBackend` 限制文件操作。
- **`job/coordinator.ts`**: `JobCoordinator` 管理运行时任务的资源锁和取消。使用 `ResourceLock` 进行 claim-based 冲突检测。
- **`model/resolve.ts`**: 解析 4 个 provider 的 LLM 实例：OpenAI (chat-completions)、OpenAI-responses、Anthropic、Google Gemini。
- **`tools/deck-tools.ts`**: Agent 的 LangChain 工具 — `update_single_page_file`、`update_page_file`、`set_index_transition` 等。
- **`prompt/`**: 全册生成和编辑的系统提示词模板。
- **`events/`**: `TypedEventBus` 用于领域作用域事件路由，支持受众过滤（owner/requester/broadcast）。

#### `generation/` — PPT 生成流程 (27 文件)
- **`deck-flow.ts`**: 全册生成 — 调用 DeepAgent 生成所有页面。
- **`edit-flow.ts`**: 页面级编辑（单页/selector/全册编辑）。
- **`retry-flow.ts`**: 重试失败页面。
- **`add-page-flow.ts`**: 向已有 deck 添加新页面。
- **`template-deck-flow.ts`**: 基于模板的生成。
- **`style-switch.ts`**: 切换会话风格（用新风格重新生成所有页面）。
- **`context.ts`**: 组装 `GenerationContext` — 生成的完整能力集（DB、agent manager、model runtime、history、温度调参）。

#### `edit-jobs/` — 编辑任务服务
四种编辑任务类型，各有独立服务：
- **页面编辑** (`page-edit-job-service.ts`): 通过 AI 编辑单页。
- **全册编辑** (`deck-edit-job-service.ts`): 编辑多页/全部页面。
- **页面美化** (`page-beautify-job-service.ts`): AI 驱动的布局优化。
- **换风格** (`style-switch-job-service.ts`): 整个 deck 切换到新视觉风格。

#### `session/` — 会话管理 (21 文件)
- 会话 CRUD、页面管理（创建/删除/复制/重排）。
- **页面合并**: 从其他会话或模板合并页面。
- **幻灯片母版**: `master-handlers.ts`、`master-service.ts` — 管理所有页面的 CSS/HTML 覆盖层（logo、页脚、页码、水印、背景）。
- **运行时资源**: `runtime-assets.ts` — 管理会话本地资源（图片、视频）。
- **页面转场**: `index-transition.ts` — 页面转场动画。

#### `db/` — 数据库层
- **`schema.ts`**: 22 张 Drizzle ORM 表。
- **`database.ts`**: `PPTDatabase` 类 — 1600+ 行 CRUD 操作，覆盖会话、消息、生成运行、页面、风格、缩略图、HTML 编辑文档、模型配置、图片生成历史、会话操作（Git）等。

#### `io/` — I/O 操作
- **`export-handlers.ts`**: 导出为 PDF、PNG、长图、MP4 视频、PPTX、slide pack、session zip、大纲 Markdown。
- **`pptx-import/`** (12 文件): PPTX → session 导入，使用 `@arcsin1/pptx2json`。处理形状、图表、表格、动画、文本。
- **`html-pptx/`** (5 文件): HTML → PPTX 导出，使用 `@arcsin1/html2pptx`。字体收集、抽取报告、静态背景。
- **`html-video/`**: MP4 视频导出。
- **`thumbnails/`**: HTML 缩略图生成服务。
- **`document-parse-handlers.ts`**: 解析 txt、md、csv、docx 文档作为参考。

#### `history/` — Git 版本历史
- **`git-history-service.ts`** (1120 行): 使用 `isomorphic-git` 追踪会话文件变更。每个操作（生成/编辑/添加页面/重试/导入/回滚/重排/删除）创建一个 git commit。支持回滚到任意 commit。

#### `thinking/` — 对话式规划模式
生成前的多阶段对话式工作流：
- 阶段：`collect` → `outline` → `draft` → `refine` → `ready`
- 源文档分析、上下文构建、意图路由。

#### `styles/` — 风格管理
- 90+ 内置风格"技能"（赛博朋克霓虹、包豪斯、日式极简等）
- 风格包导入/导出（ZIP、目录）
- 风格预览生成
- 会话风格快照（会话创建时不可变风格捕获）

#### `image-generation/` — AI 图片生成
- 多 provider：即梦 3.0/4.0、Agnes AI、Seedream、SiliconFlow、Gemini、OpenAI 兼容
- 每会话/页面图片生成历史
- 从页面内容自动生成图片提示词

### 渲染进程 (`src/renderer/`)

#### 页面 (15 个)
- **`home.tsx`**: 首页，创建入口。
- **`session-create.tsx`**: 创建向导（主题、风格、尺寸、字体、文档上传）。
- **`session-detail.tsx`**: 完整会话编辑器 — 预览、编辑、AI 对话、元素。
- **`session-generating.tsx`**: 生成进度视图。
- **`edit-html.tsx`**: 独立 HTML 编辑器（带 AI）。
- **`settings.tsx`**: 模型配置、图片模型配置、存储、代理。
- **`styles.tsx` / `style-editor.tsx`**: 风格库和编辑器。
- **`fonts.tsx`**: 字体管理。
- **`templates.tsx`**: 模板库。
- **`thinking-detail.tsx`**: 对话式规划界面。
- **`token-usage.tsx`**: Token 用量面板。

#### Stores (20 个 Zustand store)
状态管理遵循 AGENTS.md 约定 — 逻辑内聚在 store 中，不通过 props 传：
- `sessionStore`: 会话列表、当前会话、消息。
- `generateStore`: 所有生成/编辑任务状态（页面编辑/全册编辑/换风格/页面美化）。
- `sessionDetailStore`: 会话详情视图状态。
- `editSessionStore`: 编辑会话状态。
- `editHistoryStore`: 历史版本。
- `htmlEditor*` (4 个 store): HTML 编辑器状态。
- `masterWorkbenchStore`, `layoutMasterStore`: 幻灯片母版和布局。

#### 组件
- **`session-detail/`** (12 个子目录): 最复杂的组件组 — AI 面板、预览、侧栏、工具栏、工作区（编辑画布）、元素检查器、演讲、风格、模态框、浏览、共享、hooks。
- **`ui/`** (17 个组件): 基于 Radix UI 的基础组件（Button、Dialog、Select、Tabs、ColorPicker 等）。

## 数据模型

### 数据库 Schema (22 张表, `src/main/db/schema.ts`)

| 表 | 用途 |
|---|---|
| `sessions` | PPT 会话 (id, title, topic, styleId, slideSize, provider, model, status, designContract, currentOperationId, currentCommit) |
| `messages` | 聊天消息 (sessionId, chatScope, pageId, role, content, type, toolName, toolCallId, tokenCount) |
| `modelUsageEvents` | Token 用量追踪 (provider, model, inputTokens, outputTokens) |
| `projects` | 会话项目目录 |
| `generationRuns` | 生成运行记录 (mode, status, totalPages, animationPreferences) |
| `sessionJobs` | 任务队列 (kind, status, targetPageId, selector, abortReason) |
| `generationPages` | 每页生成记录 (pageId, pageNumber, title, contentOutline, layoutIntent, htmlPath, status) |
| `sessionPages` | 最终会话页面 (fileSlug, pageNumber, title, htmlPath, status, deletedAt) |
| `sourcePageSkeletons` | 文档派生的页面大纲 (sourceDocumentPath, sourceHeading, lineStart, lineEnd) |
| `settings` | 键值设置 |
| `modelConfigs` | 文本模型配置 (provider, model, apiKey, baseUrl, maxTokens, thinkingParameterMode) |
| `imageModelConfigs` | 图片模型配置 (provider, modelConfig JSON) |
| `imageGenerationHistories` | 图片生成历史 (prompt, imagePaths, provider, model) |
| `memorySummaries` | 对话记忆摘要 |
| `userPreferences` | 用户偏好追踪 |
| `styles` | 风格目录 (styleKey, styleName, styleSkill, category, source, version) |
| `thumbnails` | 缩略图缓存 (resourceType, resourceId, sourcePath, thumbnailPath, status) |
| `sessionStyleSnapshots` | 每会话不可变风格快照 |
| `sessionOperations` | Git 操作记录 (type, scope, beforeCommit, afterCommit, changedFiles) |
| `sessionOperationPages` | 操作影响的页面 |
| `htmlEditDocuments` | 独立 HTML 编辑文档 |
| `htmlEditMessages` | HTML 编辑器聊天消息 |
| `htmlEditVersions` | HTML 编辑器 Git 版本 |

### 关键共享类型 (`src/shared/`)

- **`OutlineItem`**: `title`, `contentOutline`, `layoutIntent`, `layoutId`
- **`DesignContract`**: `theme`, `background`, `palette[]`, `titleStyle`, `layoutMotif`, `chartStyle`, `shapeLanguage`, `titleFont`, `bodyFont`
- **`SlideSizePreset`**: 6 种预设 — `wide-16-9` (1600x900), `vertical-9-16`, `standard-4-3`, `square-1-1`, `vertical-3-4`, `xiaohongshu-note`
- **`SessionMasterConfig`**: 背景（纯色/渐变/图片）、字体（标题/正文，预设或自定义）、元素（logo/页脚/页码/水印，带位置/尺寸）
- **`ElementAnimationConfig`**: 28 种动画类型（fade/slide/scale/exit/pulse 等），触发方式（load/with/after/click）、时长、方向
- **`IndexTransitionConfig`**: 16 种页面转场（fade/slide/push/zoom/flip/cube 等）
- **`ImageModelProvider`**: 7 个 provider (jimeng, jimeng4, agnes, siliconflow, openaiCompatible, gemini, seedream)
- **`ThinkingWorkspace`**: 多阶段 thinking (collect → outline → draft → refine → ready)

## IPC 通信模式

### 架构

IPC 层遵循 **handler 注册模式**：

1. **`src/main/ipc/index.ts`** (`setupIPC`): 中央注册函数，创建 `IpcContext` 并注册约 30 个 handler 模块。

2. **`IpcContext`** (`src/main/ipc/runtime/context.ts`): 兼容门面，组合了专注的运行时能力：
   - `RuntimeCredentials` — API key 解密
   - `RuntimeLocalFiles` — 文件路径校验
   - `SessionProjectResolver` — 项目目录解析
   - `SessionScaffold` — 会话资源设置
   - `SessionRunStateStore` — 活跃运行状态追踪
   - `RuntimeEmitters` — 向渲染进程发射事件
   - `PageExport` — 页面文件操作

3. **渲染进程侧** (`src/renderer/src/lib/ipc.ts`, 1532 行): 单个 `ipc` 对象，100+ 个类型化方法，调用 `getIpc().invoke(channel, payload)`。

### IPC 通道分类

| 类别 | 通道 | Handler 模块 |
|------|------|-------------|
| 会话 | `session:create`, `session:list`, `session:get`, `session:delete`, `session:updateTitle`, `session:reorderPages`, `session:deletePages`, `session:duplicatePage`, `session:createBlankPage`, `session:mergePages`, `session:saveAsNew`, `session:getMaster`, `session:saveMaster` | `session/handlers.ts`, `session/page-management-handlers.ts`, `session/master-handlers.ts` |
| 生成 | `generate:start`, `generate:startTemplate`, `generate:retryFailedPages`, `generate:addPage`, `generate:retrySinglePage`, `generate:state`, `generate:listActive`, `generate:cancel` | `generation/handlers.ts` |
| 页面编辑 | `page-edit:assess`, `page-edit:start`, `page-edit:state`, `page-edit:cancel` | `edit-jobs/page-edit-job-service.ts` |
| 全册编辑 | `deck-edit:start`, `deck-edit:state`, `deck-edit:cancel` | `edit-jobs/deck-edit-job-service.ts` |
| 换风格 | `style-switch:start`, `style-switch:retryPage`, `style-switch:retryFailed`, `style-switch:state`, `style-switch:cancel` | `edit-jobs/style-switch-job-service.ts` |
| 页面美化 | `page-beautify:start`, `page-beautify:state`, `page-beautify:cancel` | `edit-jobs/page-beautify-job-service.ts` |
| 导出 | `export:pdf`, `export:png`, `export:longImage`, `export:video`, `export:pptx`, `export:slidePack`, `export:sessionZip` | `io/export-handlers.ts` |
| 导入 | `pptx:import`, `session:importFile`, `html-editor:import` | `io/pptx-import/handlers.ts`, `session/import-handlers.ts` |
| 历史 | `history:listVersions`, `history:rollbackToVersion`, `history:recordSnapshot` | `history/handlers.ts` |
| 风格 | `styles:get`, `styles:list`, `styles:getDetail`, `styles:create`, `styles:update`, `styles:delete`, `styles:parseFile`, `styles:parsePptx`, `styles:parseImage`, `styles:importPackageZip`, `styles:exportPackageZip` | `styles/handlers.ts` |
| 设置 | `settings:get`, `settings:save`, `settings:listModelConfigs`, `settings:upsertModelConfig`, `settings:verifyApiKey`, `settings:chooseStoragePath` | `config/settings-handlers.ts` |
| 图片模型 | `imageModels:list`, `imageModels:upsert`, `imageModels:setActive`, `imageModels:delete`, `imageModels:verify` | `config/image-model-handlers.ts` |
| 图片生成 | `images:generate`, `images:generatePrompt`, `images:listHistory`, `images:cancel` | `image-generation/handlers.ts` |
| 字体 | `fonts:list`, `fonts:upload`, `fonts:update`, `fonts:delete`, `fonts:chooseFiles`, `fonts:previewCss` | `presentation/fonts/handlers.ts` |
| 模板 | `templates:list`, `templates:createFromSession`, `templates:createSession`, `templates:createEditableSession`, `templates:importPptx`, `templates:delete` | `templates/template-handlers.ts` |
| Thinking | `thinking:createWorkspace`, `thinking:chat`, `thinking:prepareGeneration`, `thinking:updatePageOutline`, `thinking:uploadSources` | `ipc/thinking/thinking-handlers.ts` |
| HTML 编辑器 | `html-editor:import`, `html-editor:aiChat`, `html-editor:applyEdits`, `html-editor:ensureAnchor`, `html-editor:listVersions`, `html-editor:restoreVersion` | `html-editor/html-editor-handlers.ts`, `html-editor/html-editor-ai-handlers.ts` |
| 元素编辑 | `drag-editor:update-element-layout`, `text-editor:update-element-properties`, `element-editor:delete-element`, `element-anchor:ensure`, `element-animation:get`, `element-animation:set`, `edit:save-batch` | `element-editor/handlers.ts` |
| 文件 | `file:open`, `file:reveal`, `file:openInBrowser`, `file:save` | `io/file-handlers.ts` |
| 资源 | `assets:upload`, `assets:chooseAndUpload`, `assets:list` | `io/assets-handlers.ts` |
| 预览 | `preview:load`, `preview:loadPage` | `session/preview-handlers.ts` |
| 演示 | `presentation:open` | `session/presentation-handlers.ts` |
| 演讲稿 | `speech:generateScript`, `speech:getScript`, `speech:openScriptFile`, `speech:clearScript` | `speech/handlers.ts` |

### 事件通信 (主进程 → 渲染进程)

用于流式/进度更新，使用 `webContents.send`：

| 通道 | 用途 |
|------|------|
| `generate:chunk` | 流式生成块（页面 HTML、进度、工具状态） |
| `export:progress` | 导出进度更新 |
| `pptx:import:progress` | PPTX 导入进度 |
| `thumbnails:changed` | 缩略图状态更新 |
| `app:update-available` | 应用更新通知 |
| `speech:progress` | 演讲稿生成进度 |
| `thinking:stream:thinking` | Thinking 模式流式 |
| `thinking:stream:end` | Thinking 模式完成 |

### 事件总线 (主进程内部)

`TypedEventBus` (`agent-runtime/events/bus.ts`) 内部路由事件：
- **领域过滤**: `generation`, `image`, `style`, `edit`
- **所有者过滤**: 按 sessionId、styleId 或 imageHistoryOwner
- **受众**: `owner`, `requester`（特定订阅者）, `broadcast`
- **事件桥**: `RuntimeEventBridge` 将 bus 事件桥接到 `webContents.send` 供渲染进程消费。

### 任务协调

`JobCoordinator` 提供：
- **资源锁**: Claim-based 冲突检测（如同一会话的两个生成任务冲突）。
- **取消**: 基于 `AbortController` 的取消中继。
- **任务生命周期**: `waiting` → `active` → `finished`/`aborted`。

## 测试

### 框架
- **Vitest 4** + `happy-dom` DOM 环境
- **225 个测试文件**，分布在 **41 个子目录**，位于 `tests/unit/`

### 配置 (`vitest.config.ts`)
- 别名：`@renderer`, `@shared`, 本地 `@arcsin1/html2pptx` 包
- `environmentMatchGlobs`: `tests/unit/runtime/**` 使用 `happy-dom`
- 10 秒超时
- 启用 globals

### 测试组织（镜像源码结构）
```
tests/unit/
├── agent-runtime/     # Agent, job coordinator, model resolution
├── animation/         # 动画 schema 校验
├── app/               # 应用生命周期
├── config/            # 设置, 模型配置
├── db/                # 数据库操作
├── edit-jobs/         # 编辑任务服务
├── editor/            # 元素编辑器
├── export/            # 导出 handler
├── generation/        # 生成流程
├── history/           # Git 历史服务
├── html-editor/       # HTML 编辑器
├── html-pptx/         # HTML→PPTX 导出
├── html-video/        # 视频导出
├── i18n/              # 国际化
├── image-generation/  # 图片生成
├── io/                # I/O 操作
├── ipc/               # IPC 运行时
├── main/              # 主进程工具
├── master/            # 幻灯片母版
├── model/             # 模型选项
├── presentation/      # 演示 HTML
├── preview/           # 预览加载
├── prompt/            # 提示词组合
├── renderer/          # 渲染进程工具
├── runtime/           # 运行时事件
├── session/           # 会话管理
├── session-create/    # 会话创建
├── session-detail/    # 会话详情
├── session-import/    # 会话导入
├── settings/          # 设置
├── shared/            # 共享类型
├── skills/            # 产品技能
├── slide-size/        # 幻灯片尺寸
├── styles/            # 风格
├── templates/         # 模板
├── thinking/          # Thinking 模式
├── thumbnail/         # 缩略图
├── tools/             # Agent 工具
└── utils/             # 工具
```

### 约定 (来自 AGENTS.md)
- 测试为 `*.test.ts` 文件，按功能域分目录放在 `tests/unit/`
- 运行：`pnpm test` 或 `pnpm test -- tests/unit/xxx/foo.test.ts`
- 修 bug 或加功能时必须补对应测试
- 样式 UI 改动不需要写测试

## 核心架构模式

### 1. 本地优先架构
所有数据（会话、页面、资源、历史）存储在本地。SQLite 数据库追踪元数据，实际 HTML 文件存储在可配置的存储目录（`{storagePath}/{sessionId}/`）。Git（通过 isomorphic-git）追踪文件变更用于版本历史。

### 2. AI Agent 架构 (DeepAgents + LangChain)
- Agent 按会话创建，带 `GuardedFilesystemBackend` 限制文件操作到会话项目目录。
- 两种 Agent 类型：**Deck Agent**（生成）和 **Edit Agent**（编辑），各有不同工具限制。
- Agent 使用 LangChain 工具（`update_single_page_file`、`update_page_file`、`set_index_transition`）而非原始文件操作。
- 产品技能（90+ 风格）作为中间件附加到 Agent 后端。

### 3. 多 Provider LLM 支持
支持 4 个 LLM provider，各有 provider 特定处理：
- **OpenAI** (chat-completions API)
- **OpenAI Responses** (responses API with thinking parameter 兼容)
- **Anthropic** (Claude)
- **Google** (Gemini)
- 以及 OpenAI 兼容的本地模型 (Ollama)

### 4. 并发控制
`JobCoordinator` + `ResourceLock` 系统确保：
- 每个会话同时只有一个活跃任务
- Claim-based 冲突检测（如同一会话的 page-edit 和 deck-edit 冲突）
- 基于 `AbortController` 的取消，带外部信号中继

### 5. 状态管理 (Zustand)
遵循 AGENTS.md 约定：
- 20 个 Zustand store，各管一个特定领域
- 逻辑内聚在 store 中（不通过 props 传）
- Store 直接调用 `ipc.*` 方法与主进程通信
- 组件"自我管理" — 最小 props，只传配置和展示数据

### 6. Git 版本历史
每个会话操作（生成/编辑/添加页面/重试/导入/回滚/重排/删除）通过 isomorphic-git 创建一个 git commit。`sessionOperations` 表记录操作元数据（类型、范围、前后 commit、变更文件/页面）。用户可回滚到任意版本。

### 7. 幻灯片母版系统
CSS/HTML 覆盖层系统（`master.ts`, 851 行），应用全册视觉规则：
- 背景（纯色、渐变、图片）
- 字体族和字号（标题/正文）
- 元素（logo、页脚、页码、水印）精确定位
- 母版 CSS 通过 `<link data-ppt-master="1">` 注入每页。

### 8. PPTX 导入/导出 (自研)
- **导入**: `@arcsin1/pptx2json` 解析 PPTX 为结构化数据，转换为可编辑 HTML 页面。处理形状、图表、表格、动画、文本。
- **导出**: `@arcsin1/html2pptx` 将 HTML 页面转回可编辑 PPTX。字体收集、背景抽取、布局保持。

### 9. 代码风格
- Prettier: `singleQuote`, `no semi`, `printWidth: 100`, `trailingComma: none`
- 路径别名: `@shared/*`, `@renderer/*`
- ESM 模块 (`"type": "module"`)
- TypeScript 严格模式，项目引用（node + web 配置）

### 10. 国际化
- 两种语言：中文 (`zh`) 和英文 (`en`)
- 语言存储在设置中，应用于 AI 提示词和 UI
- `i18n/` 目录包含 `zh.ts`、`en.ts`、`index.ts` (LangProvider)

### 11. 安全
- 预加载脚本启用上下文隔离
- `index.html` 中的 CSP 限制连接到已知 API 端点
- `local-asset://` 协议安全地服务本地资源
- API key 静态加密，通过 `RuntimeCredentials` 解密

### 12. 多格式画布支持
6 种幻灯片尺寸预设：
- 16:9 宽屏、4:3 标准、9:16 竖屏、1:1 正方形、3:4 竖屏、小红书笔记
- PPTX 导出仅支持 16:9 和 4:3；其他格式可导出为 PNG/PDF/MP4

## 学习路径建议

1. **入口** → `src/main/app/application.ts` (组合根) → `src/renderer/src/main.tsx` → `App.tsx`
2. **IPC 层** → `src/main/ipc/index.ts` → `src/renderer/src/lib/ipc.ts` (理解前后端通信)
3. **AI 核心** → `agent-runtime/agent/factory.ts` → `generation/deck-flow.ts` → `generation/edit-flow.ts`
4. **数据模型** → `src/shared/` (类型定义) → `src/main/db/schema.ts` (数据库表)
5. **编辑流程** → `edit-jobs/` 四种编辑服务 → `session/` 页面管理
6. **导入导出** → `io/pptx-import/` → `io/html-pptx/` → `io/export-handlers.ts`

## 本地运行调试

### 环境要求
- Node.js ≥ 20
- pnpm ≥ 10 < 11

### 1. 安装依赖（首次或拉取新依赖后）
```bash
pnpm install
```

### 2. 启动开发模式
```bash
pnpm dev
```
这会通过 `electron-vite dev` 同时启动：
- **主进程** (`src/main/`) 和 **预加载脚本** (`src/preload/`) 的构建与热重载
- **渲染进程** (`src/renderer/`) 的 Vite dev server，端口 **5178**
- 自动打开 Electron 窗口

修改代码会触发热重载；主进程改动会自动重启 Electron。

### 3. 调试技巧
- **渲染进程**：在 Electron 窗口里 `Cmd+Option+I` 打开 DevTools（和 Chrome 一致）
- **主进程**：在 `src/main/` 代码里加 `console.log`，输出会在启动 `pnpm dev` 的终端里看到；也可在 VSCode 里用 `F5` attach 到 Electron 主进程
- **断点调试主进程**：VSCode 创建 `.vscode/launch.json`，attach 到 `9229` 端口，然后 `pnpm dev` 启动后 attach

### 4. 类型检查（改完代码后验证）
```bash
pnpm typecheck          # 全量
pnpm typecheck:node     # 只查主进程
pnpm typecheck:web      # 只查渲染进程
```

### 5. 跑测试
```bash
pnpm test                                          # 全量
pnpm test -- tests/unit/xxx/foo.test.ts            # 单个文件
```

### 6. 预览构建产物（可选）
```bash
pnpm start    # electron-vite preview，跑已 build 的产物（需要先 build）
```
> 注意：按项目约定，**不要跑** `pnpm build` / `pnpm lint`。

### 关键配置文件
- `electron.vite.config.ts:5` — 渲染进程 dev server 端口 `5178`
- `tsconfig.node.json` — 主进程 TS 配置
- `tsconfig.web.json` — 渲染进程 TS 配置
- 路径别名：`@shared/*` → `src/shared/*`，`@renderer/*` → `src/renderer/src/*`

### 运行后
应用启动后，进入「设置 → 文本模型」配置 AI 模型（provider / base_url / model / api_key）才能使用生成功能；本地 Ollama 也支持（`base_url` 填 `http://127.0.0.1:11434/v1`）。

## 打包构建

### 通用前置步骤

```bash
pnpm install          # 安装依赖（首次或拉取新依赖后）
```

打包配置在 `electron-builder.yml`，由 `electron-builder` 驱动。所有平台的产物输出到 `dist/` 目录。

### Windows

| 类型 | 命令 | 产物文件名 | 说明 |
|------|------|-----------|------|
| 安装包 (NSIS) | `pnpm build:win` 的一部分 | `OhMyPPT-2.2.0-setup.exe` | 支持自定义安装路径、创建桌面/开始菜单快捷方式，非一键安装 |
| 免安装版 (Portable) | `pnpm build:win` 的一部分 | `OhMyPPT-2.2.0-portable.exe` | 单文件，双击即可运行，无需安装，数据存储在 exe 同目录 |

```bash
# 同时生成安装包和免安装版（推荐）
pnpm build:win

# 仅生成免安装版
pnpm build && npx electron-builder --win portable

# 仅生成安装包
pnpm build && npx electron-builder --win nsis

# 免打包目录（用于调试打包结果，不生成安装包/portable）
pnpm build:unpack
```

**配置详情** (`electron-builder.yml` → `win` / `nsis` / `portable`)：
- 架构：`x64`
- 可执行文件名：`ohmyppt`
- 图标：`build/icons/icon.ico`
- NSIS：非一键安装 (`oneClick: false`)，允许自定义安装路径，创建桌面 + 开始菜单快捷方式
- Portable：artifactName 模板 `${name}-${version}-portable.${ext}`
- Electron 下载镜像：`https://npmmirror.com/mirrors/electron/`（国内加速）

### macOS

| 类型 | 命令 | 产物文件名 | 说明 |
|------|------|-----------|------|
| DMG 安装镜像 | `pnpm build:mac` | `OhMyPPT-2.2.0-x64.dmg` / `OhMyPPT-2.2.0-arm64.dmg` | 支持 Intel 和 Apple Silicon |

```bash
pnpm build:mac
```

**配置详情** (`electron-builder.yml` → `mac` / `dmg`)：
- 架构：`x64` + `arm64`（同时生成两个 DMG）
- 图标：`build/icons/icon.icns`
- 不签名 (`identity: null`)，不公证 (`notarize: false`)
- 声明了相机、麦克风、文档、下载文件夹的使用权限描述

### Linux

| 类型 | 命令 | 产物文件名 | 说明 |
|------|------|-----------|------|
| AppImage | `pnpm build:linux` 的一部分 | `OhMyPPT-2.2.0-x64.AppImage` | 免安装，chmod +x 后直接运行 |
| DEB 安装包 | `pnpm build:linux` 的一部分 | `OhMyPPT-2.2.0-x64.deb` | Debian/Ubuntu 系安装包 |

```bash
# 同时生成 AppImage 和 DEB
pnpm build:linux

# 仅生成 AppImage
pnpm build && npx electron-builder --linux AppImage

# 仅生成 DEB
pnpm build && npx electron-builder --linux deb
```

**配置详情** (`electron-builder.yml` → `linux` / `appImage` / `deb`)：
- 架构：`x64`
- 可执行文件名：`ohmyppt`
- 图标：`build/icons/`
- 分类：`Office`
- DEB 依赖：`libgtk-3-0`, `libnotify4`, `libnss3`, `libxss1`, `libxtst6`, `xdg-utils`
- 注意：Linux 目前缺少 ffmpeg 二进制，MP4 视频导出暂不可用

### 各平台速查表

| 平台 | 命令 | 产物格式 | 架构 |
|------|------|---------|------|
| Windows | `pnpm build:win` | NSIS 安装包 + Portable 免安装 | x64 |
| macOS | `pnpm build:mac` | DMG | x64, arm64 |
| Linux | `pnpm build:linux` | AppImage + DEB | x64 |

> 按项目约定，日常开发**不要跑** `pnpm build` / `pnpm lint`；仅在需要打包时使用上述命令。
