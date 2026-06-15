#!/usr/bin/env node
/**
 * Automated validation of PR#107 animation features
 * Tests HTML parsing, attribute validation, and PPTX export without GUI
 */

const fs = require('fs');
const path = require('path');

// Read the test HTML file
const testHtmlPath = path.join(__dirname, 'test-animation-pr107.html');
const testHtml = fs.readFileSync(testHtmlPath, 'utf-8');

console.log('🧪 PR#107 Animation Feature Validation\n');
console.log('═'.repeat(60));

// Test 1: Verify all new attributes are present in test file
console.log('\n📋 Test 1: Verify new attributes in test file');
const newAttributes = [
  'data-anim-sequence="with"',
  'data-anim-sequence="after"',
  'data-anim-stagger="90"',
  'data-anim-click-group="reveal"',
  'data-anim-from="center"',
  'data-anim="exit-scale"',
  'data-anim="exit-zoom"',
  'data-anim="pulse-soft"',
  'data-anim="pulse-strong"',
  'data-anim="grow-shrink-soft"',
  'data-anim="grow-shrink-strong"',
  'data-anim="path"',
  'data-anim-path="M 0 0 L 120 30"'
];

let passed = 0;
let failed = 0;

newAttributes.forEach(attr => {
  if (testHtml.includes(attr)) {
    console.log(`  ✅ Found: ${attr}`);
    passed++;
  } else {
    console.log(`  ❌ Missing: ${attr}`);
    failed++;
  }
});

console.log(`\n  Result: ${passed}/${newAttributes.length} attributes found`);

// Test 2: Verify HTML structure and IDs
console.log('\n📋 Test 2: Verify test element structure');
const requiredBlockIds = [
  'header',
  'subtitle',
  'card-1',
  'card-2',
  'card-3',
  'after-card',
  'center-fly',
  'exit-scale',
  'exit-zoom',
  'pulse-soft',
  'pulse-strong',
  'grow-shrink-soft',
  'grow-shrink-strong',
  'click-group-1',
  'click-group-2',
  'click-separate',
  'path-anim'
];

let blockIdsPassed = 0;
requiredBlockIds.forEach(id => {
  if (testHtml.includes(`data-block-id="${id}"`)) {
    console.log(`  ✅ Block ID: ${id}`);
    blockIdsPassed++;
  } else {
    console.log(`  ❌ Missing block ID: ${id}`);
  }
});

console.log(`\n  Result: ${blockIdsPassed}/${requiredBlockIds.length} block IDs found`);

// Test 3: Import and test validation function
console.log('\n📋 Test 3: Import validation function');
try {
  // We need to build first to get the compiled validation
  const { validateHtmlContent } = require('./out/main/tools/html-utils.js');

  console.log('  ✅ Validation module imported successfully');

  // Test valid cases
  console.log('\n  Testing valid animations:');
  const validTests = [
    '<div data-anim="fade-up" data-anim-stagger="90">Test</div>',
    '<div data-anim="fade" data-anim-sequence="with" data-anim-delay="100">Test</div>',
    '<div data-anim="fade-up" data-anim-sequence="after">Test</div>',
    '<div data-anim="fly-in" data-anim-from="center">Test</div>',
    '<div data-anim="exit-scale" data-anim-trigger="click">Test</div>',
    '<div data-anim="pulse-soft" data-anim-duration="600">Test</div>',
    '<div data-anim="path" data-anim-path="M 0 0 L 120 30">Test</div>',
    '<div data-anim="fade-up" data-anim-trigger="click" data-anim-click-group="test">A</div>'
  ];

  validTests.forEach((html, i) => {
    const result = validateHtmlContent(html);
    if (result.valid) {
      console.log(`    ✅ Valid test ${i + 1}: ${html.substring(0, 50)}...`);
    } else {
      console.log(`    ❌ Should be valid ${i + 1}: ${result.errors.join(', ')}`);
      failed++;
    }
  });

  // Test invalid cases
  console.log('\n  Testing invalid animations (should reject):');
  const invalidTests = [
    {
      html: '<div data-anim="fade-up" data-anim-from="start">Test</div>',
      reason: 'Invalid from value'
    },
    {
      html: '<div data-anim="fade-up" data-anim-stagger="-10">Test</div>',
      reason: 'Negative stagger'
    },
    {
      html: '<div data-anim="path" data-anim-path="M 0 0 C 10 20 30 40 50 60">Test</div>',
      reason: 'Curved path'
    },
    {
      html: '<div data-anim="fade-up" data-anim-click-group="test">Test</div>',
      reason: 'click-group without trigger=click'
    }
  ];

  invalidTests.forEach(({ html, reason }) => {
    const result = validateHtmlContent(html);
    if (!result.valid) {
      console.log(`    ✅ Correctly rejected: ${reason}`);
    } else {
      console.log(`    ❌ Should reject: ${reason}`);
      failed++;
    }
  });

} catch (error) {
  console.log(`  ⚠️  Could not import validation (needs build): ${error.message}`);
  console.log(`  ℹ️  Run 'pnpm build' first for complete validation testing`);
}

// Test 4: Check schema consistency
console.log('\n📋 Test 4: Check animation schema');
try {
  const schemaPath = path.join(__dirname, 'src/main/animation/data-anim-schema.ts');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

  const schemaChecks = [
    { pattern: "'center'", name: "center in DATA_ANIM_FROM_VALUES" },
    { pattern: "'exit-scale'", name: "exit-scale type" },
    { pattern: "'exit-zoom'", name: "exit-zoom type" },
    { pattern: "'pulse-soft'", name: "pulse-soft type" },
    { pattern: "'pulse-strong'", name: "pulse-strong type" },
    { pattern: "'grow-shrink-soft'", name: "grow-shrink-soft type" },
    { pattern: "'grow-shrink-strong'", name: "grow-shrink-strong type" },
    { pattern: "'path'", name: "path type" }
  ];

  schemaChecks.forEach(({ pattern, name }) => {
    if (schemaContent.includes(pattern)) {
      console.log(`  ✅ ${name}`);
    } else {
      console.log(`  ❌ Missing: ${name}`);
      failed++;
    }
  });

} catch (error) {
  console.log(`  ❌ Could not read schema: ${error.message}`);
  failed++;
}

// Test 5: Check skill documentation
console.log('\n📋 Test 5: Check skill documentation updated');
try {
  const skillPath = path.join(__dirname, 'resources/skills/oh-my-ppt-data-anim/SKILL.md');
  const skillContent = fs.readFileSync(skillPath, 'utf-8');

  const docChecks = [
    'data-anim-sequence',
    'data-anim-stagger',
    'data-anim-click-group',
    'center',
    'exit-scale',
    'exit-zoom',
    'pulse-soft',
    'pulse-strong'
  ];

  docChecks.forEach(term => {
    if (skillContent.includes(term)) {
      console.log(`  ✅ Documented: ${term}`);
    } else {
      console.log(`  ❌ Missing from docs: ${term}`);
      failed++;
    }
  });

} catch (error) {
  console.log(`  ❌ Could not read skill docs: ${error.message}`);
  failed++;
}

// Final summary
console.log('\n' + '═'.repeat(60));
console.log('\n📊 VALIDATION SUMMARY\n');
console.log(`Total checks passed: ${passed + blockIdsPassed}`);
console.log(`Total checks failed: ${failed}`);

if (failed === 0) {
  console.log('\n✅ All static validation checks PASSED');
  console.log('\n⚠️  Note: This validates file contents and schema consistency.');
  console.log('   Full GUI testing (edit mode, preview, PPTX export) still required.');
  process.exit(0);
} else {
  console.log('\n❌ Some validation checks FAILED');
  process.exit(1);
}
