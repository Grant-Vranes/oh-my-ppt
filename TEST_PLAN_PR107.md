# Animation PR#107 Manual Test Plan

## Test Environment
- Branch: PR#107 (declarative animation contract expansion)
- Test file: `test-animation-pr107.html`

## Features to Test

### 1. data-anim-sequence="with"
**Location**: Subtitle below header
**Expected**: Subtitle should appear at the same time as the header (not after)
**Test in**:
- [ ] Preview mode (animation runtime)
- [ ] Edit mode (should be visible, no animation)
- [ ] After PPTX export/import roundtrip

### 2. data-anim-stagger (new declarative syntax)
**Location**: 3 green cards in grid
**Expected**: Cards appear in sequence with 90ms delay between each
**Test in**:
- [ ] Preview mode (staggered entrance)
- [ ] Edit mode (all visible)
- [ ] After PPTX export/import roundtrip

### 3. data-anim-sequence="after"
**Location**: Purple card below green cards
**Expected**: Purple card appears only after all 3 green cards finish animating
**Test in**:
- [ ] Preview mode (delayed until previous sequence finishes)
- [ ] Edit mode (visible)
- [ ] After PPTX export/import roundtrip

### 4. data-anim-from="center" (restored)
**Location**: Yellow "fly-in from center" card
**Expected**: Element flies in from center position (not from edge)
**Test in**:
- [ ] Preview mode (center origin)
- [ ] Edit mode (visible)
- [ ] After PPTX export/import roundtrip

### 5. New exit animations: exit-scale, exit-zoom
**Location**: Two red cards (click-triggered)
**Expected**: 
- exit-scale: soft scale-down (85%)
- exit-zoom: strong scale-down (75%)
**Test in**:
- [ ] Preview mode (click to trigger)
- [ ] Edit mode (visible before click)
- [ ] After PPTX export: click-triggered in PowerPoint

### 6. New emphasis: pulse-soft, pulse-strong, grow-shrink-soft, grow-shrink-strong
**Location**: Four orange cards
**Expected**: Different scale animation magnitudes
- pulse-soft: 1 → 1.03 → 1
- pulse-strong: 1 → 1.1 → 1
- grow-shrink-soft: 0.95 → 1.04 → 1
- grow-shrink-strong: 0.85 → 1.12 → 1
**Test in**:
- [ ] Preview mode (load animations)
- [ ] Edit mode (visible)
- [ ] After PPTX export/import roundtrip

### 7. data-anim-click-group
**Location**: Three indigo cards (first two grouped, third separate)
**Expected**: First two cards reveal on same click, third on next click
**Test in**:
- [ ] Preview mode (click testing)
- [ ] Edit mode (all visible)
- [ ] After PPTX export: verify grouped build in PowerPoint

### 8. data-anim="path" with linear path
**Location**: Pink card at bottom
**Expected**: Moves along linear path M 0 0 L 120 30 (120px right, 30px down)
**Test in**:
- [ ] Preview mode (diagonal motion)
- [ ] Edit mode (visible at start position)
- [ ] After PPTX export/import roundtrip

## Critical Integration Tests

### Preview Injection Scripts Compatibility
**Files**: `src/renderer/src/components/preview/edit-mode-script.ts`, `inspector-script.ts`

#### Edit Mode Test
1. [ ] Open test file in app
2. [ ] Enter edit mode
3. [ ] Verify all animated elements are visible (not hidden)
4. [ ] Click on each animated element
5. [ ] Verify element selection works (overlay appears)
6. [ ] Verify inspector shows correct element info
7. [ ] Try dragging animated elements
8. [ ] Verify drag works without errors

#### Inspector Mode Test
1. [ ] Open test file in app
2. [ ] Activate inspector tool
3. [ ] Hover over each animated element
4. [ ] Verify highlight overlay appears correctly
5. [ ] Click each animated element
6. [ ] Verify inspector captures correct selector and properties

### Validation Pipeline Test
**File**: `src/main/tools/html-utils.ts`

1. [ ] Open test file in app
2. [ ] Check console for validation errors (should be none)
3. [ ] Try invalid values:
   - [ ] `data-anim-from="start"` (invalid, should reject)
   - [ ] `data-anim-stagger="-10"` (invalid, should reject)
   - [ ] `data-anim="path" data-anim-path="M 0 0 C 10 20 30 40 50 60"` (curved path, should reject)
   - [ ] `data-anim-click-group` on non-click animation (should reject)

### PPTX Export/Import Roundtrip
**Files**: `src/main/utils/html-pptx/animation-writer.ts`, `browser-scripts.ts`

1. [ ] Export test file to PPTX
2. [ ] Open in PowerPoint
3. [ ] Verify all animations play correctly
4. [ ] Check Animation Pane for:
   - [ ] Click-group animations are in same build step
   - [ ] Stagger delays are applied
   - [ ] Emphasis animations use correct scale ranges
   - [ ] Exit animations use correct presets
5. [ ] Import PPTX back to app
6. [ ] Verify all data-anim attributes are preserved
7. [ ] Verify animation behavior matches original

## Regression Test

1. [ ] Open existing slides from `docs/local-research/anime-next-gen-pptx/samples/`
2. [ ] Verify old `data-anim-delay="stagger(N)"` still works
3. [ ] Verify old `data-anim-trigger="with|after"` still works
4. [ ] Verify no console errors
5. [ ] Verify animations play correctly

## Test Execution Checklist

- [ ] Run unit tests: `pnpm test -- tests/unit/html-pptx/animation-writer.test.ts tests/unit/tools/html-utils-animation-sequence.test.ts`
- [ ] Start dev server: `pnpm dev`
- [ ] Load test file: `test-animation-pr107.html`
- [ ] Execute all manual tests above
- [ ] Test PPTX export/import cycle
- [ ] Test with existing sample files
- [ ] Document any issues found

## Expected Results

All tests should pass with:
- ✅ No console errors
- ✅ All animations play correctly in preview
- ✅ All elements visible and selectable in edit mode
- ✅ Validation correctly accepts valid input and rejects invalid input
- ✅ PPTX export preserves animation semantics
- ✅ PPTX import reconstructs data-anim attributes
- ✅ No regression in existing animation features
