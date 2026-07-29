import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRODUCT_SKILLS_ROUTE } from '../../../src/main/product-skills/contract'

const logMock = vi.hoisted(() => ({
  info: vi.fn(),
}))

vi.mock('electron-log/main.js', () => ({
  default: logMock,
}))

describe('logAgentToolEvents', () => {
  beforeEach(() => {
    logMock.info.mockClear()
  })

  it('logs a dedicated event when read_file opens a product skill file', async () => {
    const { logAgentToolEvents } = await import('../../../src/main/utils/agent-tool-logger')
    const path = `${PRODUCT_SKILLS_ROUTE}system/oh-my-ppt-data-anim/SKILL.md`

    logAgentToolEvents(
      {
        model: {
          messages: [
            {
              additional_kwargs: {
                tool_calls: [
                  {
                    id: 'call_1',
                    function: {
                      name: 'read_file',
                      arguments: JSON.stringify({ path }),
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      new Set<string>(),
      { tag: 'deepagent', source: 'updates' }
    )

    expect(logMock.info).toHaveBeenCalledWith(
      '[deepagent] product_skill_read_file',
      expect.objectContaining({
        source: 'updates',
        toolName: 'read_file',
        toolCallId: 'call_1',
        skillName: 'oh-my-ppt-data-anim',
        path,
      })
    )
  })

  it('does not emit product skill read logs for normal project files', async () => {
    const { logAgentToolEvents } = await import('../../../src/main/utils/agent-tool-logger')

    logAgentToolEvents(
      {
        tool_calls: [
          {
            id: 'call_2',
            name: 'read_file',
            args: { path: '/page-1.html' },
          },
        ],
      },
      new Set<string>(),
      { tag: 'deepagent', source: 'messages' }
    )

    expect(
      logMock.info.mock.calls.some(([message]) => message === '[deepagent] product_skill_read_file')
    ).toBe(false)
  })
})
