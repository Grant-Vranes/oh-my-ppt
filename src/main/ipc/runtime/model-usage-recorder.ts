import type { ModelUsageEntry, ModelUsageRecorder } from '../../agent-runtime/model'
import type { PPTDatabase } from '../../db/database'

/** Main-process adapter that persists runtime model usage without coupling Runtime to SQLite. */
export class DbModelUsageRecorder implements ModelUsageRecorder {
  constructor(private readonly db: PPTDatabase) {}

  record(entry: ModelUsageEntry): Promise<void> {
    return this.db.recordModelUsage(entry)
  }
}
