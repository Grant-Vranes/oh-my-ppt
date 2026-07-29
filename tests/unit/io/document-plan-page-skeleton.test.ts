import { describe, expect, it } from 'vitest'
import { scanDocumentOutline } from '../../../src/main/io/document-outline-scan'
import {
  buildDocumentPlanPageSkeleton,
  sanitizeDocumentPlanPageSkeletonContent
} from '../../../src/main/io/document-plan-page-skeleton'

describe('document plan page skeleton', () => {
  it('derives an authoritative skeleton only when source candidates match the plan count', () => {
    const scan = scanDocumentOutline(
      [
        '# Source Manual',
        '',
        '## Market',
        'Market details.',
        '',
        '## Execution',
        'Execution details.'
      ].join('\n')
    )

    const skeleton = buildDocumentPlanPageSkeleton({
      scan,
      pageCount: 2
    })

    expect(skeleton).toHaveLength(2)
    expect(skeleton[0]).toMatchObject({
      id: 'page-1',
      pageNumber: 1,
      title: 'Market',
      sourceHeading: '## Market',
      lineStart: 3
    })
    expect(
      buildDocumentPlanPageSkeleton({
        scan,
        pageCount: 1
      })
    ).toEqual([])
    expect(
      buildDocumentPlanPageSkeleton({
        scan,
        pageCount: 2
      })
    ).toHaveLength(2)
  })

  it('keeps LLM summaries as skeleton reasons', () => {
    const skeleton = [
      {
        pageNumber: 1,
        title: '市场洞察',
        role: 'content' as const,
        sourceHeading: '## 市场洞察',
        headingLevel: 2,
        lineStart: 3,
        lineEnd: 18,
        reason: '说明市场增长信号和关键机会。'
      }
    ]

    const sanitized = sanitizeDocumentPlanPageSkeletonContent({
      pageSkeleton: skeleton
    })

    expect(sanitized[0].reason).toBe('说明市场增长信号和关键机会。')
  })

  it('drops internal scanner reasons when no model page purpose is available', () => {
    const skeleton = [
      {
        pageNumber: 1,
        title: 'Execution',
        role: 'content' as const,
        sourceHeading: '## Execution',
        headingLevel: 2,
        lineStart: 3,
        lineEnd: 18,
        reason: 'leaf ## section without standalone child sections'
      }
    ]

    const sanitized = sanitizeDocumentPlanPageSkeletonContent({
      pageSkeleton: skeleton
    })

    expect(sanitized[0].reason).toBe('')
  })
})
