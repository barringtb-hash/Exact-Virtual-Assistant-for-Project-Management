# Readability Upgrade v1

## Overview

The Readability Upgrade v1 improves text legibility, contrast, and overall user experience across the EVA application. This upgrade focuses on making the Chat panel and Document Preview easier to scan while maintaining the current design language.

## Goals

- **Increase text legibility and contrast** to meet WCAG AA standards
- **Make Chat and Document Preview easier to scan** with improved visual hierarchy
- **Reduce button/CTA clutter** by emphasizing primary actions
- **Keep changes reversible** through feature flags

## What Changed

### Design Tokens (src/index.css)

Added CSS custom properties for consistent theming:

```css
--eva-text-strong: #1f2937;     /* gray-800 */
--eva-text-default: #374151;    /* gray-700 */
--eva-text-subtle: #6b7280;     /* gray-500 */
--eva-text-placeholder: #9ca3af;/* gray-400 */
--eva-surface: #ffffff;
--eva-surface-muted: #f6f7f9;
--eva-border-subtle: #e5e7eb;
--eva-accent: #4f46e5;
--eva-accent-strong: #4338ca;
```

### Typography

- **Base font size**: 16px (html element)
- **Chat messages**: 16px with line-height 1.6
- **Preview labels**: text-sm (14px)
- **Preview inputs**: text-base (16px)
- **Minimum text size**: 16px (no text below this threshold)

### Chat Panel Improvements

1. **Message bubbles**:
   - Increased font size to 16px
   - Better contrast with borders
   - Assistant messages: gray-100 background with gray-300 border
   - User messages: gray-900 background

2. **Line length constraint**:
   - Content limited to max-width of 70ch for optimal readability
   - Prevents text from stretching too wide on large screens

### Document Preview Improvements

1. **Field labels**:
   - Increased from text-xs to text-sm
   - Changed from slate-500 to gray-600 for better contrast

2. **Input fields**:
   - Larger text (16px instead of 14px)
   - Increased padding (px-4 py-3 instead of px-3 py-2)
   - Clear borders (gray-300)
   - Better focus states (indigo-400 ring)

3. **Section grouping**:
   - Sections now have visible borders and padding
   - Creates clear visual separation
   - Reduces the "one long form" feel

4. **Spacing**:
   - Increased vertical spacing from space-y-2 to space-y-3
   - Row gaps increased from gap-3 to gap-4

## Feature Flags

Two feature flags control the readability improvements:

### READABILITY_V1

Controls the overall readability upgrade features.

- **Default**: `true`
- **Environment variable**: `VITE_READABILITY_V1`
- **Location**: `src/config/flags.ts`

### READABILITY_HIDE_FIELD_TIMESTAMPS

Optionally hides field timestamps to reduce visual clutter.

- **Default**: `false`
- **Environment variable**: `VITE_READABILITY_HIDE_FIELD_TIMESTAMPS`
- **Location**: `src/config/flags.ts`

## Usage

### Enabling/Disabling

To disable readability features, set the environment variable:

```bash
VITE_READABILITY_V1=false pnpm dev
```

To hide field timestamps:

```bash
VITE_READABILITY_HIDE_FIELD_TIMESTAMPS=true pnpm dev
```

### Testing

Run the Cypress readability tests:

```bash
pnpm e2e:ci
```

The test file `cypress/e2e/readability_layout.cy.ts` verifies:
- Chat message font sizes (≥16px)
- Line length constraints (max-w-[70ch])
- Input border colors
- Section styling

## Rollback

If issues arise, the upgrade can be rolled back by:

1. Setting `VITE_READABILITY_V1=false` in environment variables
2. Redeploying the application

No data migrations or destructive changes are involved, making rollback safe and instant.

## Browser Compatibility

The readability improvements use standard CSS properties and are compatible with:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Accessibility

All changes maintain or improve accessibility:
- Contrast ratios meet WCAG AA standards (4.5:1 for normal text)
- Focus states are clearly visible
- Keyboard navigation remains functional
- Screen reader compatibility is preserved

## Future Enhancements (Out of Scope for v1)

- New component libraries or complex tooltips
- Complete visual redesign
- Layout restructuring (2/3 vs 1/3 split - Phase 4)
- CTA simplification (Phase 4)

## References

- Epic specification: See project root for full Epic documentation
- WCAG AA guidelines: https://www.w3.org/WAI/WCAG21/quickref/
- CSS custom properties: https://developer.mozilla.org/en-US/docs/Web/CSS/--*
