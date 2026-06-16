import { describe, expect, it } from 'vitest'
import { PageMergeError, readPageMergeErrorCode } from '../../../src/shared/page-merge'

describe('page merge errors', () => {
  it('keeps the domain error code separate from the internal message', () => {
    const error = new PageMergeError('PAGE_MERGE_SESSION_BUSY', '会话正在生成')

    expect(error.code).toBe('PAGE_MERGE_SESSION_BUSY')
    expect(error.message).toBe('会话正在生成')
  })

  it('reads an error code from Electron invoke error wrappers', () => {
    const error = new Error(
      "Error invoking remote method 'session:mergePages': Error: PAGE_MERGE_PAGE_COPY_FAILED"
    )

    expect(readPageMergeErrorCode(error)).toBe('PAGE_MERGE_PAGE_COPY_FAILED')
    expect(readPageMergeErrorCode(new Error('unknown failure'))).toBeNull()
  })
})
