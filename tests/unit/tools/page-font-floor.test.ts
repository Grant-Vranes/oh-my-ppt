// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp'
  },
  BrowserWindow: class BrowserWindow {},
  ipcMain: {},
  session: {}
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: false
  }
}))

import { buildBasePageStyleTag, buildFitScript } from '../../../src/main/tools/page-writer'
import { requireSlideSizePreset } from '../../../src/shared/slide-size'

describe('generated page font floors', () => {
  const slideSize = requireSlideSizePreset('wide-16-9')

  afterEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('enforces semantic font floors in the generated page DOM', () => {
    document.head.innerHTML = `${buildBasePageStyleTag(slideSize)}<style>.text-sm { font-size: 14px; }</style>`
    document.body.innerHTML = `
      <main class="ppt-page-root" data-ppt-guard-root="1">
        <div class="ppt-page-fit-scope">
          <div class="ppt-page-content">
            <section data-ppt-readable-fonts="1">
              <p id="body" class="text-sm">正文</p>
              <h3 id="heading" style="font-size: 16px">标题</h3>
              <div id="block-title" data-block-id="title" style="font-size: 16px">区块标题</div>
              <footer id="footer" style="font-size: 11px">来源</footer>
            </section>
          </div>
        </div>
      </main>
    `
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })

    const script = buildFitScript(slideSize).replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')
    Function(script)()
    window.dispatchEvent(new Event('load'))

    expect(getComputedStyle(document.querySelector('#body')!).fontSize).toBe('18px')
    expect(getComputedStyle(document.querySelector('#heading')!).fontSize).toBe('24px')
    expect(getComputedStyle(document.querySelector('#block-title')!).fontSize).toBe('24px')
    expect(getComputedStyle(document.querySelector('#footer')!).fontSize).toBe('12px')
  })
})
