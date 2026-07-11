import { describe, expect, it } from 'vitest'
import { buildDuplicatePageHtmlFromSource } from '../../../../src/main/ipc/session/page-html-builders'

const SOURCE_HTML = `<!DOCTYPE html>
<html>
  <head><title>原标题</title></head>
  <body data-page-id="page-source123">
    <div class="ppt-page-content" data-page-id="page-source123">
      <h1 data-block-id="blk-1">主标题文字</h1>
      <p data-block-id="blk-2">正文内容 ABC</p>
      <input value="输入框里的值" placeholder="占位" />
    </div>
  </body>
</html>`

describe('buildDuplicatePageHtmlFromSource', () => {
  it('保留全部可见文字与输入框值（区别于空白页清空），并重写 pageId 身份和标题', () => {
    const result = buildDuplicatePageHtmlFromSource({
      html: SOURCE_HTML,
      oldPageId: 'page-source123',
      nextPageId: 'page-copy456',
      title: '[副本]原标题'
    })

    // 可见文字保留（空白页流程会清空这些）
    expect(result).toContain('主标题文字')
    expect(result).toContain('正文内容 ABC')
    // 输入框 value/placeholder 保留
    expect(result).toContain('输入框里的值')
    expect(result).toContain('占位')
    // block-id 不重写（跨页不冲突），原样保留
    expect(result).toContain('data-block-id="blk-1"')

    // 旧 pageId 已全部替换为新 pageId，无残留
    expect(result).not.toContain('page-source123')
    expect(result).toContain('data-page-id="page-copy456"')

    // body 上的 data-page-id 换成新 id
    expect(result).toMatch(/<body data-page-id="page-copy456">/)

    // 标题已改为带 [副本] 前缀
    expect(result).toContain('<title>[副本]原标题</title>')
  })

  it('oldPageId 等于 nextPageId 时原样返回（不误伤内容）', () => {
    const result = buildDuplicatePageHtmlFromSource({
      html: SOURCE_HTML,
      oldPageId: 'page-same',
      nextPageId: 'page-same',
      title: '新标题'
    })
    // 内容不被破坏，标题仍被设置
    expect(result).toContain('主标题文字')
    expect(result).toContain('<title>新标题</title>')
  })
})
