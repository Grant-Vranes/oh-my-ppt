import type { createClient } from '@libsql/client'

type LibSqlClient = ReturnType<typeof createClient>

export const patchActivityLogsTable = async (client: LibSqlClient): Promise<void> => {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT,
      session_id TEXT,
      created_at INTEGER NOT NULL
    )
  `)
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at)'
  )
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_level ON activity_logs(level, created_at)'
  )
  await client.execute(
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_source ON activity_logs(source, created_at)'
  )
}
