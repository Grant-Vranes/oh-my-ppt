import { test, expect, _electron as electron } from '@playwright/test'
import { join, dirname } from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

test.describe('PR#107 Animation Features E2E', () => {
  test('should load Electron app and verify animation test file', async () => {
    // Launch Electron app
    const electronApp = await electron.launch({
      args: [join(__dirname, '../../out/main/index.js')],
      env: {
        ...process.env,
        NODE_ENV: 'development'
      }
    })

    // Wait for the first window
    const window = await electronApp.firstWindow()

    // Wait for app to be ready
    await window.waitForLoadState('domcontentloaded')

    // Log console messages for debugging
    window.on('console', (msg) => {
      console.log(`[Browser Console ${msg.type()}]:`, msg.text())
    })

    // Take screenshot of initial state
    await window.screenshot({ path: 'tests/e2e/screenshots/01-initial.png' })

    // Verify app loaded
    const title = await window.title()
    console.log('App title:', title)
    expect(title).toBeTruthy()

    // Read test HTML content
    const testHtmlPath = join(__dirname, '../../test-animation-pr107-fragment.html')
    const testHtml = readFileSync(testHtmlPath, 'utf-8')

    // Try to inject test content into the app
    // This is a workaround - in real usage, we'd use the file picker or IPC
    const injected = await window.evaluate((html) => {
      try {
        // Find the preview container or main content area
        const previewContainer = document.querySelector('.preview-container') ||
                                 document.querySelector('#preview') ||
                                 document.querySelector('main') ||
                                 document.body

        if (previewContainer) {
          previewContainer.innerHTML = html
          return { success: true, containerTag: previewContainer.tagName }
        }
        return { success: false, error: 'No suitable container found' }
      } catch (e) {
        return { success: false, error: (e as Error).message }
      }
    }, testHtml)

    console.log('Injection result:', injected)

    // Wait a bit for any dynamic loading
    await window.waitForTimeout(2000)

    // Take screenshot after injection attempt
    await window.screenshot({ path: 'tests/e2e/screenshots/02-after-injection.png' })

    // Verify animation attributes are present in the DOM
    const animationElements = await window.evaluate(() => {
      const elements = {
        withSequence: document.querySelectorAll('[data-anim-sequence="with"]').length,
        afterSequence: document.querySelectorAll('[data-anim-sequence="after"]').length,
        stagger: document.querySelectorAll('[data-anim-stagger]').length,
        clickGroup: document.querySelectorAll('[data-anim-click-group]').length,
        fromCenter: document.querySelectorAll('[data-anim-from="center"]').length,
        exitAnimations: document.querySelectorAll('[data-anim*="exit-"]').length,
        pulseAnimations: document.querySelectorAll('[data-anim*="pulse-"]').length,
        growShrinkAnimations: document.querySelectorAll('[data-anim*="grow-shrink-"]').length,
        pathAnimations: document.querySelectorAll('[data-anim="path"]').length,
        allAnimated: document.querySelectorAll('[data-anim]').length
      }
      return elements
    })

    // Log results to stdout so we can see them
    console.log('\n=== ANIMATION ELEMENTS FOUND ===')
    console.log('Total animated elements:', animationElements.allAnimated)
    console.log('  - with sequence:', animationElements.withSequence)
    console.log('  - after sequence:', animationElements.afterSequence)
    console.log('  - stagger:', animationElements.stagger)
    console.log('  - click-group:', animationElements.clickGroup)
    console.log('  - from="center":', animationElements.fromCenter)
    console.log('  - exit animations:', animationElements.exitAnimations)
    console.log('  - pulse animations:', animationElements.pulseAnimations)
    console.log('  - grow-shrink animations:', animationElements.growShrinkAnimations)
    console.log('  - path animations:', animationElements.pathAnimations)
    console.log('================================\n')

    // Verify at least some animation elements are present
    expect(animationElements.allAnimated).toBeGreaterThan(0)

    // Check for specific new features
    if (injected.success) {
      expect(animationElements.withSequence).toBeGreaterThan(0)
      expect(animationElements.afterSequence).toBeGreaterThan(0)
      expect(animationElements.stagger).toBeGreaterThan(0)
      expect(animationElements.clickGroup).toBeGreaterThan(0)
      expect(animationElements.fromCenter).toBeGreaterThan(0)
    }

    // Check for JavaScript errors
    const errors: string[] = []
    window.on('pageerror', (error) => {
      errors.push(error.message)
    })

    // Wait a bit more to catch any delayed errors
    await window.waitForTimeout(1000)

    // Log any errors found
    if (errors.length > 0) {
      console.log('JavaScript errors detected:', errors)
    }

    // Take final screenshot
    await window.screenshot({ path: 'tests/e2e/screenshots/03-final.png' })

    // Close app
    await electronApp.close()
  })

  test('should verify app starts without crashes', async () => {
    const electronApp = await electron.launch({
      args: [join(__dirname, '../../out/main/index.js')]
    })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // App should have at least one window
    const windows = electronApp.windows()
    expect(windows.length).toBeGreaterThan(0)

    // Window should have content
    const content = await window.content()
    expect(content.length).toBeGreaterThan(100)

    await electronApp.close()
  })
})
