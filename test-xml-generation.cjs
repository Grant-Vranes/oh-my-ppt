#!/usr/bin/env node

/**
 * Generate test PPTX XML to verify P1 fixes
 * This creates sample animation XML output to verify the fixes work correctly
 */

const fs = require('fs')
const path = require('path')

// Import the animation writer functions
let buildSlideTimingXml, getPptxAnimationPreset
try {
  const writerModule = require('./src/main/utils/html-pptx/animation-writer.ts')
  const mapModule = require('./src/main/animation/pptx-animation-map.ts')
  buildSlideTimingXml = writerModule.buildSlideTimingXml
  getPptxAnimationPreset = mapModule.getPptxAnimationPreset
} catch (e) {
  // Try compiled version
  try {
    const mainModule = require('./out/main/index.js')
    buildSlideTimingXml = mainModule.buildSlideTimingXml
    getPptxAnimationPreset = mainModule.getPptxAnimationPreset
  } catch (e2) {
    console.error('Cannot load animation modules. Using direct test approach.')
  }
}

console.log('='.repeat(70))
console.log('P1 Fix XML Generation Test')
console.log('='.repeat(70))
console.log()

// P1-1: Test emphasis animation structure
console.log('P1-1: Testing Emphasis Animation XML Structure')
console.log('-'.repeat(70))

const emphasisAnimation = {
  spid: 1,
  type: 'pulse',
  trigger: 'click',
  duration: 500,
  delay: 0,
  order: 1
}

if (buildSlideTimingXml) {
  const xml = buildSlideTimingXml([emphasisAnimation])

  // Check for two-phase animation
  const scaleCount = (xml.match(/<p:animScale>/g) || []).length
  const hasRebound = xml.includes('x="100000" y="100000"') &&
                     xml.includes('x="106000" y="106000"') &&
                     xml.includes('fill="remove"')

  console.log(`  Scale elements found: ${scaleCount}`)
  console.log(`  Has rebound to 100000: ${hasRebound ? '✅' : '❌'}`)
  console.log(`  Has fill="remove": ${xml.includes('fill="remove"') ? '✅' : '❌'}`)

  if (scaleCount >= 2 && hasRebound) {
    console.log('  ✅ P1-1 FIX VERIFIED: Two-phase rebound present')
  } else {
    console.log('  ❌ P1-1 FIX NOT VERIFIED: Missing proper rebound')
  }

  // Save sample XML
  fs.writeFileSync('/tmp/emphasis-sample.xml', xml)
  console.log('  📄 Sample XML saved to /tmp/emphasis-sample.xml')
}

console.log()

// P1-4: Test pure path animation (no fade)
console.log('P1-4: Testing Pure Path Animation (No Fade)')
console.log('-'.repeat(70))

const pathAnimation = {
  spid: 2,
  type: 'path',
  trigger: 'click',
  path: 'M 0.5 0 L 120.5 30.25',
  duration: 500,
  delay: 0,
  order: 1
}

if (buildSlideTimingXml) {
  const xml = buildSlideTimingXml([pathAnimation])

  const hasMotion = xml.includes('ppt_x') && xml.includes('ppt_y')
  const hasFade = xml.includes('<p:animEffect') && xml.includes('filter="fade"')
  const hasDecimalDelta = xml.includes('+120.5') && xml.includes('+30.25')

  console.log(`  Has motion channels (ppt_x, ppt_y): ${hasMotion ? '✅' : '❌'}`)
  console.log(`  Has animEffect fade: ${hasFade ? '❌ (should NOT have)' : '✅ (correct)'}`)
  console.log(`  Has decimal delta (+120.5, +30.25): ${hasDecimalDelta ? '✅' : '❌'}`)

  if (hasMotion && !hasFade) {
    console.log('  ✅ P1-4 FIX VERIFIED: Path has motion only, no fade')
  } else {
    console.log('  ❌ P1-4 FIX NOT VERIFIED: Path has unwanted fade effect')
  }

  if (hasDecimalDelta) {
    console.log('  ✅ P1-3 FIX VERIFIED: Decimal path coordinates preserved')
  } else {
    console.log('  ⚠️  P1-3: Could not verify decimal delta in XML')
  }

  // Save sample XML
  fs.writeFileSync('/tmp/path-sample.xml', xml)
  console.log('  📄 Sample XML saved to /tmp/path-sample.xml')
}

console.log()
console.log('='.repeat(70))
console.log()

if (!buildSlideTimingXml) {
  console.log('⚠️  Could not load animation modules for automated XML generation')
  console.log('   Manual verification in real software is required')
  console.log()
  console.log('   Run: node verify-p1-fixes.cjs')
  console.log('   For detailed manual testing steps')
} else {
  console.log('✅ Automated XML structure verification complete')
  console.log()
  console.log('📋 Next Steps:')
  console.log('   1. Review generated XML files in /tmp/')
  console.log('   2. Run full app test: pnpm dev')
  console.log('   3. Export PPTX and verify in PowerPoint')
  console.log('   4. Run: node verify-p1-fixes.cjs for complete checklist')
}

console.log()
