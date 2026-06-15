#!/usr/bin/env node

const { _electron: electron } = require('@playwright/test');
const { readFileSync } = require('fs');

(async () => {
  console.log('\n🎬 Starting Electron Animation Demo...\n');

  const electronApp = await electron.launch({
    args: ['./out/main/index.js'],
    env: { ...process.env, NODE_ENV: 'development' }
  });

  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  console.log('✅ Electron app launched');
  console.log('   App:', await window.title());

  // Load the standalone demo HTML directly
  const demoHtml = readFileSync('./animation-demo-standalone.html', 'utf-8');

  await window.evaluate((html) => {
    document.open();
    document.write(html);
    document.close();
  }, demoHtml);

  console.log('\n🎬 Animation demo loaded in Electron!');
  console.log('   Animations will auto-start in 2 seconds');
  console.log('   Auto-repeat every 20 seconds');
  console.log('\n📺 Watch the Electron window to see:');
  console.log('   1. Cards flying in with stagger delays (150ms apart)');
  console.log('   2. Sequence control (with/after timing)');
  console.log('   3. Click groups (simultaneous animation)');
  console.log('   4. Center direction (zoom + rotate from center)');
  console.log('   5. Exit animations (shrink and zoom out)');
  console.log('   6. Pulse animations (continuous soft and strong)');
  console.log('   7. Grow-shrink animations (continuous)');
  console.log('   8. Path motion (diagonal movement)');
  console.log('\n⏱️  Demo will run for 2 minutes. Press Ctrl+C to stop.\n');

  // Keep the app open for 2 minutes
  await new Promise(resolve => setTimeout(resolve, 120000));

  console.log('\n✅ Demo complete');
  await electronApp.close();
})();
