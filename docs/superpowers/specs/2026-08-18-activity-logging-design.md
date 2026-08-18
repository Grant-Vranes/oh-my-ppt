# Activity Logging Feature Design

## Overview

为项目增加用户操作日志记录功能，在设置页新增"操作日志"Tab，记录用户操作的每一步日志。默认记录用户操作和关键系统行为，用户可选择开启详细调试日志。日志存储在 SQLite 数据库中，保留 14 天，应用启动时自动清理过期日志。

## Decisions

| 决策项 | 选择 |
|--------|------|
| 日志范围 | 默认：用户操作 + 关键系统行为；可选开启：详细调试日志 |
| 展示方式 | 设置中日志面板（Tab） |
| 存储位置 | SQLite 数据库（`activity_logs` 表） |
| 保留策略 | 仅天数限制，保留 14 天 |
| 清理时机 | 应用启动时自动清理 |
| 实现方案 | 方案 A：集中式 Logger 服务 |

## Architecture

```
渲染进程组件 → logger.ts (微缓冲 500ms) → IPC (log:writeBatch) → 主进程 LoggerService → SQLite activity_logs 表
                                                                                              ↓
设置页日志面板 ← IPC (log:query) ← 主进程 LoggerService ← SQLite activity_logs 表
```

### Data Flow

**写入流程**：
1. 组件调用 `logger.action('session', '创建会话', { sessionId })`
2. `logger.ts` 将日志放入微缓冲队列（500ms 合并）
3. flush 时调用 `ipc.writeLogBatch(entries)` → `log:writeBatch` IPC 通道
4. 主进程 `LoggerService.write(entry)` → `db.insertActivityLog(entry)`
5. 日志禁用时，`logger.ts` 直接 return，不产生任何 IPC 调用
6. `debug` 级别在非 debug 模式下在渲染进程侧直接跳过，不进入缓冲队列

**查询流程**：
1. `LogSettingsTab` 挂载 → `logStore.fetchLogs()`
2. 调用 `ipc.queryLogs({ level, source, searchText, limit: 100, offset: 0 })`
3. 主进程 `LoggerService.query(params)` → `db.queryActivityLogs(params)`
4. 返回 `{ logs, total }` → `logStore` 更新状态 → UI 渲染
5. 支持"加载更多"分页

## Data Model

### `activity_logs` 表

```sql
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,          -- 'action' | 'info' | 'warn' | 'error' | 'debug'
  source TEXT NOT NULL,         -- 来源模块，如 'session', 'generate', 'settings', 'export'
  message TEXT NOT NULL,        -- 日志消息
  detail TEXT,                  -- 可选的 JSON 详情
  session_id TEXT,              -- 关联的会话 ID（可选）
  created_at INTEGER NOT NULL   -- Unix 时间戳（秒）
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_level ON activity_logs(level, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_source ON activity_logs(source, created_at);
```

### 日志级别

| 级别 | 说明 | 默认是否记录 |
|------|------|-------------|
| `action` | 用户主动触发的操作（点击按钮、切换页面等） | 是 |
| `info` | 关键系统行为（生成开始/完成、导出结果等） | 是 |
| `warn` | 警告 | 是 |
| `error` | 错误 | 是 |
| `debug` | 调试细节（IPC 调用参数摘要、流式 chunk 等） | 否（需用户开启） |

### Settings keys

在 `settings` 表中新增两个 key：

| key | 值 | 默认值 |
|-----|----|--------|
| `log_level` | `'normal'` 或 `'debug'` | `'normal'` |
| `log_enabled` | `'true'` 或 `'false'` | `'true'` |

- `normal` 模式：记录 action / info / warn / error
- `debug` 模式：额外记录 debug 级别

## Components

### 1. 主进程

#### 1.1 DB 层 (`src/main/db/database.ts`)

新增方法：

```ts
insertActivityLog(data: {
  level: LogLevel
  source: string
  message: string
  detail?: string  // JSON string
  sessionId?: string
}): Promise<void>

queryActivityLogs(params: {
  level?: LogLevel
  source?: string
  sessionId?: string
  searchText?: string
  limit?: number     // default 100
  offset?: number    // default 0
  startTime?: number
  endTime?: number
}): Promise<{ logs: ActivityLogRow[]; total: number }>

deleteActivityLogsBefore(timestamp: number): Promise<void>
getActivityLogCount(): Promise<number>
```

#### 1.2 LoggerService (`src/main/logging/logger-service.ts`)

```ts
class LoggerService {
  constructor(db: PPTDatabase, logLevel: 'normal' | 'debug', enabled: boolean)

  write(entry: {
    level: LogLevel
    source: string
    message: string
    detail?: Record<string, unknown>
    sessionId?: string
  }): Promise<void>

  query(params: LogQueryParams): Promise<{ logs: ActivityLogEntry[]; total: number }>
  clearAll(): Promise<void>
  pruneExpired(): Promise<void>  // 删除 14 天前的日志
  setLogLevel(level: 'normal' | 'debug'): void
  setEnabled(enabled: boolean): void
  isEnabled(): boolean
  getLogLevel(): 'normal' | 'debug'
}
```

- 在 `IpcContext` 中暴露为 `logger` 字段
- 所有 handler 可通过 `ctx.logger.write(...)` 记录日志
- `write` 方法内部检查 `isEnabled()` 和日志级别，跳过不需要记录的日志
- 主进程现有的 `electron-log` 调用保持不变，两者并行

#### 1.3 IPC Handlers (`src/main/logging/log-handlers.ts`)

```ts
export function registerLogHandlers(ctx: IpcContext): void
```

| 通道 | 方向 | 说明 |
|------|------|------|
| `log:write` | renderer → main | 渲染进程提交单条日志 |
| `log:writeBatch` | renderer → main | 渲染进程提交批量日志 |
| `log:query` | renderer → main | 分页查询日志列表 |
| `log:clear` | renderer → main | 清空全部日志 |
| `log:getSettings` | renderer → main | 获取日志设置（级别、是否启用、总数） |
| `log:saveSettings` | renderer → main | 保存日志设置 |

#### 1.4 启动时清理

在 `MainApplication.start()` 中，`db.init()` 之后调用：
1. 从 settings 读取 `log_level` 和 `log_enabled`，初始化 LoggerService
2. 调用 `logger.pruneExpired()` 删除 14 天前的日志

#### 1.5 主进程埋点

在关键 IPC handler 中增加 `ctx.logger.write(...)` 调用。与现有 `electron-log` 调用并行，不替换。主要在用户可感知的操作结果处补充（成功/失败）。

### 2. 渲染进程

#### 2.1 IPC 层 (`src/renderer/src/lib/ipc.ts`)

在 `ipc` 对象中新增：

```ts
writeLog: (entry: LogWriteEntry) => getIpc().invoke('log:write', entry)
writeLogBatch: (entries: LogWriteEntry[]) => getIpc().invoke('log:writeBatch', entries)
queryLogs: (params: LogQueryParams) => getIpc().invoke('log:query', params)
clearLogs: () => getIpc().invoke('log:clear')
getLogSettings: () => getIpc().invoke('log:getSettings')
saveLogSettings: (settings: LogSettingsPayload) => getIpc().invoke('log:saveSettings', settings)
```

#### 2.2 Logger 模块 (`src/renderer/src/lib/logger.ts`)

```ts
export const logger = {
  action(source: string, message: string, detail?: Record<string, unknown>): void
  info(source: string, message: string, detail?: Record<string, unknown>): void
  warn(source: string, message: string, detail?: Record<string, unknown>): void
  error(source: string, message: string, detail?: Record<string, unknown>): void
  debug(source: string, message: string, detail?: Record<string, unknown>): void
}
```

内部实现：
- 维护微缓冲队列（500ms flush 一次），将窗口内的日志合并为一次 `log:writeBatch` IPC 调用
- `debug` 级别在发送前检查当前日志级别设置，非 debug 模式直接跳过
- 日志禁用时直接 return，不产生任何 IPC 调用
- 页面 `beforeunload` 时立即 flush 剩余日志

#### 2.3 LogStore (`src/renderer/src/store/logStore.ts`)

```ts
interface LogStore {
  logs: ActivityLogEntry[]
  total: number
  loading: boolean
  hasMore: boolean
  filter: { level?: LogLevel; source?: string; searchText?: string }
  logSettings: { logLevel: 'normal' | 'debug'; logEnabled: boolean } | null

  fetchLogs: () => Promise<void>
  loadMore: () => Promise<void>
  fetchLogSettings: () => Promise<void>
  saveLogSettings: (settings: { logLevel?: 'normal' | 'debug'; logEnabled?: boolean }) => Promise<void>
  clearLogs: () => Promise<void>
  setFilter: (filter: Partial<{ level: LogLevel; source: string; searchText: string }>) => void
}
```

分页：默认每页 100 条，`loadMore` 增加 offset。

#### 2.4 LogSettingsTab (`src/renderer/src/components/settings/LogSettingsTab.tsx`)

UI 布局（自上而下）：

1. **设置区**
   - 日志开关（启用/禁用 toggle）
   - 日志级别切换（标准 / 详细）

2. **筛选区**
   - 级别筛选（全部 / action / info / warn / error / debug）
   - 来源筛选（下拉选择来源模块）
   - 关键词搜索（搜索 message 字段）

3. **日志列表**
   - 每条日志一行：时间戳、级别标签（彩色 badge）、来源标签、消息文本
   - 可点击展开查看 `detail` JSON
   - 级别标签颜色：action=蓝、info=灰、warn=黄、error=红、debug=紫

4. **底部操作区**
   - 日志总数显示
   - "加载更多"按钮
   - "清空日志"按钮（带确认对话框）

在 `settings.tsx` 的 Tabs 中新增第 5 个 Tab `log`，放在"高级"之后。

### 3. 共享类型 (`src/shared/activity-log.ts`)

```ts
export type LogLevel = 'action' | 'info' | 'warn' | 'error' | 'debug'

export interface ActivityLogEntry {
  id: string
  level: LogLevel
  source: string
  message: string
  detail: string | null
  sessionId: string | null
  createdAt: number
}

export interface LogWriteEntry {
  level: LogLevel
  source: string
  message: string
  detail?: Record<string, unknown>
  sessionId?: string
}

export interface LogQueryParams {
  level?: LogLevel
  source?: string
  sessionId?: string
  searchText?: string
  limit?: number
  offset?: number
}

export interface LogQueryResult {
  logs: ActivityLogEntry[]
  total: number
}

export interface LogSettingsPayload {
  logLevel?: 'normal' | 'debug'
  logEnabled?: boolean
}

export interface LogSettingsResult {
  logLevel: 'normal' | 'debug'
  logEnabled: boolean
  total: number
}
```

## Instrumentation Points

### 渲染进程埋点（通过 `logger.*()`）

| 来源 | 级别 | 记录内容 |
|------|------|----------|
| `session` | action | 创建会话、删除会话、重命名、导入文件 |
| `session` | info | 页面重排序、删除页面、复制页面 |
| `generate` | action | 用户发起生成、重试、添加页面 |
| `generate` | info | 生成开始、完成、失败 |
| `edit` | action | 用户发起整页编辑、选择器编辑、整页美化 |
| `edit` | info | 编辑完成、失败 |
| `export` | action | 用户发起导出（PDF/PNG/PPTX/视频等） |
| `export` | info | 导出完成、失败 |
| `settings` | action | 保存设置、切换模型、验证 API Key |
| `html-editor` | action | 打开 HTML 编辑器、AI 对话、版本回退 |
| `image` | action | 用户发起图片生成 |
| `image` | info | 图片生成完成、失败 |
| `template` | action | 创建模板、从模板创建会话、导入模板 |
| `thinking` | action | 用户发起思考对话 |
| `speech` | action | 用户生成演讲稿 |
| `style` | action | 切换风格、导入风格包 |

### 主进程埋点（通过 `ctx.logger.write()`）

在关键 IPC handler 中补充，记录用户可感知的操作结果（成功/失败）。

### 埋点原则

- `action` 级别只记用户主动触发的操作，不记系统自动行为
- `info` 级别记操作结果（成功/失败）和关键状态变化
- `error` 级别记所有错误，包含错误消息
- `debug` 级别记 IPC 调用参数摘要、流式 chunk 等高频细节
- 日志消息使用中文，便于用户阅读
- `detail` 字段存 JSON，包含操作上下文（如 sessionId、pageId、provider 等），不包含敏感信息（apiKey 等）

## Performance

- 渲染进程侧 500ms 微缓冲，避免每条日志一次 IPC 调用
- 查询分页，默认每页 100 条，支持"加载更多"
- `activity_logs` 表有 created_at / level / source 三个索引，筛选查询走索引
- 日志禁用时，`logger.ts` 直接 return，不产生任何 IPC 调用
- `debug` 级别在非 debug 模式下在渲染进程侧直接跳过，不进入缓冲队列

## Internationalization

在 `zh.ts` 和 `en.ts` 中新增 `settings` 下日志相关 key：

| key | zh | en |
|-----|----|----|
| `logTab` | 操作日志 | Activity Log |
| `logEnabled` | 启用日志 | Enable Logging |
| `logEnabledHint` | 关闭后将不再记录任何操作日志 | When disabled, no activity logs will be recorded |
| `logLevel` | 日志级别 | Log Level |
| `logLevelNormal` | 标准 | Standard |
| `logLevelDebug` | 详细 | Detailed |
| `logLevelNormalHint` | 记录用户操作和关键系统行为 | Records user actions and key system events |
| `logLevelDebugHint` | 额外记录调试细节（日志量较大） | Also records debug details (larger log volume) |
| `logFilterLevel` | 级别 | Level |
| `logFilterSource` | 来源 | Source |
| `logSearchPlaceholder` | 搜索日志... | Search logs... |
| `logClear` | 清空日志 | Clear Logs |
| `logClearConfirm` | 确定要清空所有日志吗？此操作不可撤销。 | Are you sure you want to clear all logs? This cannot be undone. |
| `logEmpty` | 暂无日志 | No logs yet |
| `logLoadMore` | 加载更多 | Load More |
| `logTotal` | 共 {count} 条 | {count} total |
| `logLevelAction` | 操作 | Action |
| `logLevelInfo` | 信息 | Info |
| `logLevelWarn` | 警告 | Warning |
| `logLevelError` | 错误 | Error |
| `logLevelDebug` | 调试 | Debug |
| `logDetail` | 详情 | Detail |
| `logDisabled` | 日志已禁用 | Logging is disabled |

## File Structure

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/shared/activity-log.ts` | 共享类型定义 |
| `src/main/logging/logger-service.ts` | LoggerService 核心服务 |
| `src/main/logging/log-handlers.ts` | IPC handler 注册 |
| `src/main/db/patch/add-activity-logs-table.ts` | 建表 patch |
| `src/renderer/src/lib/logger.ts` | 渲染进程轻量 logger |
| `src/renderer/src/store/logStore.ts` | 日志 zustand store |
| `src/renderer/src/components/settings/LogSettingsTab.tsx` | 日志设置面板组件 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/main/db/schema.ts` | 新增 `activityLogs` 表定义 + 类型导出 |
| `src/main/db/database.ts` | 新增 log 相关 DB 方法 |
| `src/main/db/patch/index.ts` | 注册 `add-activity-logs-table` patch |
| `src/main/ipc/runtime/context.ts` | IpcContext 新增 `logger` 字段 |
| `src/main/ipc/index.ts` | 注册 `registerLogHandlers` |
| `src/main/app/application.ts` | 启动时初始化 LoggerService + 调用 `pruneExpired()` |
| `src/renderer/src/lib/ipc.ts` | 新增 log 相关 IPC 方法 |
| `src/renderer/src/store/index.ts` | 导出 logStore |
| `src/renderer/src/pages/settings.tsx` | 新增日志 Tab |
| `src/renderer/src/i18n/zh.ts` | 新增日志相关中文文案 |
| `src/renderer/src/i18n/en.ts` | 新增日志相关英文文案 |
| 各业务组件/handler | 在关键操作点添加 `logger.*()` 调用 |

## Testing

| 测试文件 | 覆盖范围 |
|----------|----------|
| `tests/unit/logging/logger-service.test.ts` | LoggerService 的 write/query/prune/clear 逻辑 |
| `tests/unit/logging/log-handlers.test.ts` | IPC handler 输入校验、权限、返回结构 |
| `tests/unit/db/activity-logs.test.ts` | DB 层 CRUD、分页查询、过期清理 |
| `tests/unit/logging/logger.test.ts` | 渲染进程 logger 的缓冲、flush、级别过滤 |
| `tests/unit/logging/log-store.test.ts` | zustand store 的 fetch/filter/pagination |

### 测试要点

- **LoggerService**: 验证 normal 模式下 debug 日志被跳过，debug 模式下被记录；验证 `pruneExpired` 只删除 14 天前的日志
- **DB 层**: 验证分页查询的 offset/limit、level/source/searchText 筛选、总数计算
- **渲染进程 logger**: 验证 500ms 缓冲合并、禁用时跳过、debug 级别过滤、beforeunload flush
- **LogStore**: 验证 fetchLogs 带筛选参数、loadMore 增量加载、clearLogs 清空后重置状态

## Error Handling

- DB 写入失败时，LoggerService 内部 catch 并通过 `electron-log` 记录错误，不抛出给调用方（日志不应影响业务流程）
- IPC handler 中的参数校验失败时，返回空结果或错误消息，不 crash
- 渲染进程 logger 的 IPC 调用失败时，静默丢弃当前批次日志，不影响后续日志写入
