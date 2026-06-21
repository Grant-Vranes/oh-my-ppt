import type { createClient } from '@libsql/client'

type LibSqlClient = ReturnType<typeof createClient>

/**
 * Patch: add thinking_parameter_mode column to model_configs table.
 * Default auto preserves existing centralized OpenAI-compatible behavior.
 */
export const patchModelConfigThinkingParameterMode = async (
  client: LibSqlClient
): Promise<void> => {
  const cols = await client.execute("PRAGMA table_info('model_configs')")
  const hasColumn = cols.rows.some((r) => r.name === 'thinking_parameter_mode')
  if (hasColumn) return

  await client.execute(
    "ALTER TABLE model_configs ADD COLUMN thinking_parameter_mode TEXT NOT NULL DEFAULT 'auto'"
  )
}
