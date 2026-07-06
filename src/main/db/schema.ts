import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  topic: text('topic'),
  styleId: text('style_id'),
  pageCount: integer('page_count'),
  slideSizeId: text('slide_size_id').notNull().default('wide-16-9'),
  slideWidth: integer('slide_width').notNull().default(1600),
  slideHeight: integer('slide_height').notNull().default(900),
  referenceDocumentPath: text('reference_document_path'),
  status: text('status').notNull().default('active'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  metadata: text('metadata'),
  designContract: text('design_contract'),
  currentOperationId: text('current_operation_id'),
  currentCommit: text('current_commit')
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  chatScope: text('chat_scope').notNull().default('main'),
  pageId: text('page_id'),
  selector: text('selector'),
  imagePaths: text('image_paths'),
  videoPaths: text('video_paths'),
  role: text('role').notNull(),
  content: text('content').notNull(),
  type: text('type'),
  toolName: text('tool_name'),
  toolCallId: text('tool_call_id'),
  tokenCount: integer('token_count'),
  runModel: text('run_model'),
  createdAt: integer('created_at').notNull()
})

export const modelUsageEvents = sqliteTable(
  'model_usage_events',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    modelConfigId: text('model_config_id'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    usageSource: text('usage_source').notNull().default('provider'),
    createdAt: integer('created_at').notNull()
  },
  (table) => ({
    modelUsageCreatedIdx: index('idx_model_usage_events_created').on(table.createdAt),
    modelUsageModelIdx: index('idx_model_usage_events_model').on(
      table.provider,
      table.model,
      table.createdAt
    )
  })
)

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  title: text('title').notNull(),
  outputPath: text('output_path').notNull(),
  rootPath: text('root_path'),
  fileCount: integer('file_count').default(0),
  totalSize: integer('total_size').default(0),
  status: text('status').notNull().default('draft'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const generationRuns = sqliteTable('generation_runs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull().default('generate'),
  status: text('status').notNull().default('running'),
  totalPages: integer('total_pages').notNull().default(0),
  error: text('error'),
  metadata: text('metadata'),
  animationPreferences: text('animation_preferences'),
  modelConfigId: text('model_config_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    id: text('id')
      .primaryKey()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    abortReason: text('abort_reason'),
    createdAt: integer('created_at').notNull(),
    activatedAt: integer('activated_at'),
    updatedAt: integer('updated_at').notNull(),
    finishedAt: integer('finished_at')
  },
  (table) => ({
    generationJobsSessionStatusIdx: index('idx_generation_jobs_session_status').on(
      table.sessionId,
      table.status,
      table.updatedAt
    ),
    generationJobsStatusIdx: index('idx_generation_jobs_status').on(table.status, table.updatedAt)
  })
)

export const generationPages = sqliteTable('generation_pages', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => generationRuns.id, { onDelete: 'cascade' }),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  pageId: text('page_id').notNull(),
  pageNumber: integer('page_number').notNull(),
  title: text('title').notNull(),
  contentOutline: text('content_outline'),
  layoutIntent: text('layout_intent'),
  htmlPath: text('html_path'),
  status: text('status').notNull().default('pending'),
  error: text('error'),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const sessionPages = sqliteTable(
  'session_pages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    legacyPageId: text('legacy_page_id'),
    fileSlug: text('file_slug').notNull(),
    pageNumber: integer('page_number').notNull(),
    title: text('title').notNull(),
    htmlPath: text('html_path').notNull(),
    status: text('status').notNull().default('pending'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at')
  },
  (table) => ({
    sessionPageNumberIdx: index('idx_session_pages_session_number').on(
      table.sessionId,
      table.pageNumber
    )
  })
)

export const sourcePageSkeletons = sqliteTable(
  'source_page_skeletons',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    title: text('title').notNull(),
    role: text('role').notNull().default('content'),
    sourceDocumentPath: text('source_document_path').notNull(),
    sourceDocumentName: text('source_document_name'),
    sourceHeading: text('source_heading').notNull(),
    headingLevel: integer('heading_level').notNull(),
    lineStart: integer('line_start').notNull(),
    lineEnd: integer('line_end').notNull(),
    reason: text('reason'),
    confidence: text('confidence').notNull().default('high'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    sourcePageSkeletonSessionIdx: index('idx_source_page_skeletons_session').on(
      table.sessionId,
      table.pageNumber
    )
  })
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const modelConfigs = sqliteTable('model_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  apiKey: text('api_key').notNull().default(''),
  baseUrl: text('base_url').notNull().default(''),
  maxTokens: integer('max_tokens').notNull().default(4096),
  disableTemperature: integer('disable_temperature').notNull().default(0),
  thinkingParameterMode: text('thinking_parameter_mode').notNull().default('auto'),
  active: integer('active').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const imageModelConfigs = sqliteTable('image_model_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  modelConfig: text('model_config').notNull().default('{}'),
  active: integer('active').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const imageGenerationHistories = sqliteTable(
  'image_generation_histories',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    pageId: text('page_id').notNull(),
    prompt: text('prompt').notNull(),
    imagePaths: text('image_paths').notNull().default('[]'),
    modelConfigId: text('model_config_id').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    createdAt: integer('created_at').notNull()
  },
  (table) => ({
    imageGenerationHistoriesSessionIdx: index('idx_image_generation_histories_session').on(
      table.sessionId,
      table.createdAt
    ),
    imageGenerationHistoriesPageIdx: index('idx_image_generation_histories_page').on(
      table.sessionId,
      table.pageId,
      table.createdAt
    )
  })
)

export const memorySummaries = sqliteTable('memory_summaries', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  messageRangeStart: integer('message_range_start').notNull(),
  messageRangeEnd: integer('message_range_end').notNull(),
  summary: text('summary').notNull(),
  tokenCount: integer('token_count'),
  createdAt: integer('created_at').notNull()
})

export const userPreferences = sqliteTable('user_preferences', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  confidence: real('confidence').default(1.0),
  sourceSessions: text('source_sessions'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastUsedAt: integer('last_used_at')
})

export const styles = sqliteTable('styles', {
  id: text('id').primaryKey(),
  style: text('style').notNull().unique(),
  styleName: text('style_name').notNull(),
  styleNameZh: text('style_name_zh').notNull().default(''),
  styleNameEn: text('style_name_en').notNull().default(''),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default(''),
  aliases: text('aliases').notNull().default('[]'),
  source: text('source').notNull().default('custom'),
  styleSkill: text('style_skill').notNull().default(''),
  version: text('version').notNull().default('1.0.0'),
  styleCase: text('style_case').notNull().default(''),
  packageDir: text('package_dir').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  favoriteAt: integer('favorite_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const thumbnails = sqliteTable(
  'thumbnails',
  {
    key: text('key').primaryKey(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    variant: text('variant').notNull().default('default'),
    sourcePath: text('source_path').notNull(),
    sourceMtimeMs: integer('source_mtime_ms').notNull().default(0),
    signature: text('signature').notNull().default(''),
    thumbnailPath: text('thumbnail_path').notNull().default(''),
    status: text('status').notNull().default('queued'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    resourceVariantUniqueIdx: uniqueIndex('thumbnails_resource_variant_unique').on(
      table.resourceType,
      table.resourceId,
      table.variant
    ),
    statusIdx: index('thumbnails_status_idx').on(table.status, table.updatedAt)
  })
)

export const sessionStyleSnapshots = sqliteTable(
  'session_style_snapshots',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    styleId: text('style_id').notNull(),
    styleKey: text('style_key').notNull(),
    styleName: text('style_name').notNull(),
    styleNameZh: text('style_name_zh').notNull().default(''),
    styleNameEn: text('style_name_en').notNull().default(''),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default(''),
    aliases: text('aliases').notNull().default('[]'),
    source: text('source').notNull(),
    version: text('version').notNull().default('1.0.0'),
    styleCase: text('style_case').notNull().default(''),
    packageDir: text('package_dir').notNull().default(''),
    styleSkill: text('style_skill').notNull().default(''),
    createdAt: integer('created_at').notNull()
  },
  (table) => ({
    sessionIdUniqueIdx: uniqueIndex('session_style_snapshots_session_id_unique').on(
      table.sessionId
    )
  })
)

export const sessionOperations = sqliteTable('session_operations', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  status: text('status').notNull().default('completed'),
  scope: text('scope'),
  prompt: text('prompt'),
  parentOperationId: text('parent_operation_id'),
  beforeCommit: text('before_commit'),
  afterCommit: text('after_commit'),
  targetOperationId: text('target_operation_id'),
  targetCommit: text('target_commit'),
  changedFilesJson: text('changed_files_json').notNull().default('[]'),
  changedPagesJson: text('changed_pages_json').notNull().default('[]'),
  trackedFilesJson: text('tracked_files_json').notNull().default('[]'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at')
})

export const sessionOperationPages = sqliteTable(
  'session_operation_pages',
  {
    id: text('id').primaryKey(),
    operationId: text('operation_id')
      .notNull()
      .references(() => sessionOperations.id, { onDelete: 'cascade' }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    pageId: text('page_id').notNull(),
    legacyPageId: text('legacy_page_id'),
    fileSlug: text('file_slug').notNull(),
    pageNumber: integer('page_number').notNull(),
    title: text('title').notNull(),
    htmlPath: text('html_path').notNull(),
    status: text('status').notNull().default('pending'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => ({
    sessionOperationPagesOrderIdx: index('idx_session_operation_pages_order').on(
      table.operationId,
      table.pageNumber
    ),
    sessionOperationPagesSessionIdx: index('idx_session_operation_pages_session').on(
      table.sessionId,
      table.operationId
    )
  })
)

export type Session = typeof sessions.$inferSelect
export type Message = typeof messages.$inferSelect
export type ModelUsageEvent = typeof modelUsageEvents.$inferSelect
export type Project = typeof projects.$inferSelect
export type GenerationRun = typeof generationRuns.$inferSelect
export type GenerationPage = typeof generationPages.$inferSelect
export type SessionPage = typeof sessionPages.$inferSelect
export type SourcePageSkeleton = typeof sourcePageSkeletons.$inferSelect
export type ModelConfig = typeof modelConfigs.$inferSelect
export type ImageGenerationHistory = typeof imageGenerationHistories.$inferSelect
export type MemorySummary = typeof memorySummaries.$inferSelect
export type UserPreference = typeof userPreferences.$inferSelect
export type SessionOperation = typeof sessionOperations.$inferSelect
export type SessionOperationPage = typeof sessionOperationPages.$inferSelect

export type SessionStatus = 'active' | 'completed' | 'failed' | 'archived'
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'
export type MessageType = 'text' | 'tool_call' | 'tool_result' | 'stream_chunk'
export type ChatScope = 'main' | 'page'
export type GenerationRunStatus = 'running' | 'completed' | 'failed' | 'partial'
export type GenerationRunMode = 'generate' | 'retry' | 'edit' | 'import' | 'addPage' | 'retrySinglePage'
export type GenerationPageStatus = 'pending' | 'running' | 'completed' | 'failed'
export type SessionPageStatus = 'completed' | 'failed' | 'pending'
export type SessionOperationType =
  | 'generate'
  | 'edit'
  | 'addPage'
  | 'retry'
  | 'import'
  | 'rollback'
  | 'reorder'
  | 'delete'
export type SessionOperationScope = 'session' | 'deck' | 'page' | 'selector' | 'shell'
export type SessionOperationStatus = 'committing' | 'completed' | 'failed' | 'noop'
