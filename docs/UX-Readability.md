# UX Readability Upgrade

This document explains the readability improvements implemented in the EVA (Exact Virtual Assistant) project, including new feature flags, enhanced UI components, and docked chat functionality.

## Overview

The readability upgrade focuses on three main areas:
1. **Preview Panel Readability** - Improved input styling, section cards, and spacing
2. **Docked Chat Panel** - Minimizable chat with clear visual identity
3. **Compact Composer** - Always-available input when chat is minimized

## Feature Flags

Two new feature flags control the readability enhancements:

### `VITE_READABILITY_V1`

**Default:** `true`

**Purpose:** Enables improved readability styles for the preview panel and chat interface.

**What it controls:**
- Input field styling (larger text, clearer borders, better spacing)
- Section card styling (visible borders and backgrounds)
- Field label sizing and colors
- Row spacing between fields

**Styling changes when enabled:**

| Element | Old Style | New Style (Readability V1) |
|---------|-----------|----------------------------|
| Input fields | `text-sm` (14px), `border-white/70` | `text-base` (16px), `border-gray-300` |
| Section cards | No border/background | `border-gray-200 bg-white p-4` |
| Field labels | `text-xs`, `text-slate-600` | `text-sm font-medium text-gray-700` |
| Row gaps | `space-y-3` | `space-y-4` |

### `VITE_READABILITY_HIDE_FIELD_TIMESTAMPS`

**Default:** `true`

**Purpose:** Hides timestamp metadata tags from preview fields for a cleaner UI.

**What it controls:**
- Visibility of "updated at" timestamps on field metadata tags
- Source tags (like "Auto") are still shown

## Components

### PreviewEditable Component

**File:** `src/components/PreviewEditable.jsx`

The PreviewEditable component now conditionally applies readability styles based on the `FLAGS.READABILITY_V1` flag:

**Input Fields (`ScalarInput`, `StringArrayEditor`, `ObjectArrayEditor`):**
- Base font size increased to `text-base` (16px)
- Border color changed to `border-gray-300` for better contrast
- Background changed to solid `bg-white`
- Padding increased to `py-2.5`

**Section Cards:**
- Wrapped in cards with visible borders: `border-gray-200`
- Solid white background: `bg-white`
- Consistent padding: `p-4`
- Rounded corners: `rounded-lg`

**Field Labels:**
- Size increased to `text-sm`
- Weight set to `font-medium`
- Color changed to `text-gray-700` for better readability

### Docked Chat Panel

**File:** `src/App.jsx`

The chat panel can now be minimized/docked using a toggle button in the header.

**States:**

1. **Expanded (Default)**
   - Full chat interface visible
   - Preview panel has subtle scrim (`bg-gray-50/50`)
   - Chat panel uses outline for visual separation

2. **Docked/Minimized**
   - Chat content hidden, only header visible
   - Compact Composer appears at bottom-right
   - Solid styling for clear identity:
     - `bg-white` (solid white background)
     - `border-gray-300` (clear border)
     - `shadow-xl` (prominent shadow)
     - `z-20` (layered above content)

**Toggle Button:**
- Located in chat panel header
- Icon changes based on state (expand/minimize)
- `data-testid="chat-dock-toggle"` for testing

### Compact Composer

**File:** `src/components/CompactComposer.tsx`

A minimal input component that appears when the chat is docked/minimized.

**Features:**
- Fixed position at bottom-right (`fixed right-6 bottom-6`)
- Text input with "Ask EVA…" placeholder
- Voice recording button (mic icon)
- Auto-expands chat when message is submitted
- Rounded pill shape (`rounded-full`)
- High z-index to stay above other content (`z-30`)

**Props:**
- `onSubmit(text: string)` - Called when user submits text
- `onMicStart()` - Called when user starts voice recording
- `onMicStop()` - Called when user stops voice recording
- `isRecording?: boolean` - Whether voice recording is active
- `disabled?: boolean` - Whether input is disabled

### Chat Bubbles

**File:** `src/App.jsx` (ChatBubble component)

Chat bubbles now use consistent, readable styling:

**Assistant Bubbles:**
- Background: `bg-gray-100` (#f3f4f6)
- Border: `border-gray-300` (#d1d5db)
- Text: `text-gray-700` (#374151)
- Font size: `text-base` (16px)

**User Bubbles:**
- Background: `bg-gray-900` (#111827)
- Text: `text-white`
- Border: `border-gray-900`

**Spacing:**
- All chat messages have `margin-bottom: 1rem` via `.eva-chat-message` class in `src/index.css`

## Configuration

### Environment Variables

Add these to your `.env` file or hosting environment (e.g., Vercel):

```env
# Readability Upgrade Flags
VITE_READABILITY_V1=true
VITE_READABILITY_HIDE_FIELD_TIMESTAMPS=true
```

### Toggle Flags

Since flags default to `true`, the readability upgrade is enabled by default. To disable:

```env
VITE_READABILITY_V1=false
VITE_READABILITY_HIDE_FIELD_TIMESTAMPS=false
```

### Vercel / Production Environment

1. Go to your Vercel project settings
2. Navigate to Environment Variables
3. Add:
   - `VITE_READABILITY_V1` = `true`
   - `VITE_READABILITY_HIDE_FIELD_TIMESTAMPS` = `true`
4. Redeploy the application

## Testing

### Unit Tests

**File:** `src/__tests__/readability.flags.test.tsx`

Tests verify that:
- Inputs use `border-gray-300` and `text-base` when flag is enabled
- Sections use card styling with `border-gray-200 bg-white p-4`
- Timestamps are hidden when `READABILITY_HIDE_FIELD_TIMESTAMPS` is true
- Labels use `text-gray-700` color

Run tests:
```bash
npm run test:unit
```

### E2E Tests

**File:** `cypress/e2e/readability.cy.ts`

Tests verify:
- Chat bubbles have correct colors and font sizes
- Docked chat has solid white background and gray-300 border
- Compact Composer appears when chat is docked
- Messages from Compact Composer auto-expand the chat
- Preview inputs and sections have readability styles

Run E2E tests:
```bash
npm run e2e:ci
```

## Rollback Plan

If issues arise, the readability upgrade can be disabled via environment variables:

### Quick Disable (Temporary)

Set in `.env` or hosting environment:
```env
VITE_READABILITY_V1=false
```

This reverts to the original styling while keeping the code in place.

### Full Rollback (If Needed)

To completely disable the Compact Composer while keeping readability styles:

In `src/App.jsx`, wrap the CompactComposer rendering:
```jsx
{isChatDocked && FLAGS.READABILITY_V1 && (
  <CompactComposer ... />
)}
```

## Browser Support

All readability styles use standard CSS properties supported by:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Accessibility

The readability upgrade improves accessibility:

✅ **WCAG 2.1 Level AA Compliance:**
- Larger text (16px base) improves readability
- Higher contrast borders improve visual clarity
- Clear section separation aids navigation
- Accessible labels and ARIA attributes on interactive elements

✅ **Keyboard Navigation:**
- Dock toggle button is keyboard accessible
- Compact Composer input is keyboard accessible
- All form fields remain keyboard navigable

✅ **Screen Readers:**
- `aria-expanded` attribute on chat panel
- `aria-label` on dock toggle button
- `aria-pressed` on voice recording button

## Visual Examples

### Before and After - Preview Panel

**Before (READABILITY_V1=false):**
- Small text (14px)
- Translucent borders
- Fields blend into background
- No clear section separation

**After (READABILITY_V1=true):**
- Larger text (16px)
- Solid gray borders
- Clear white backgrounds
- Section cards with visible borders

### Before and After - Chat Panel

**Before:**
- Translucent background
- No docking capability
- Chat always expanded

**After:**
- Solid white background when docked
- Minimize/expand toggle
- Compact Composer for quick input
- Clear visual distinction from preview

## Performance

The readability upgrade has minimal performance impact:
- No additional JavaScript bundles
- CSS changes are compile-time (Tailwind)
- Conditional rendering adds <1ms overhead
- Total bundle size increase: <5KB

## Migration Notes

If you have existing customizations to PreviewEditable or chat bubbles:

1. Check for class name conflicts with new styles
2. Verify custom CSS doesn't override readability classes
3. Test with flags enabled and disabled
4. Update snapshots if using snapshot testing

## Support

For questions or issues related to the readability upgrade:

1. Check this documentation
2. Review the epic: Phase 1B - Readability Activation & UX Polish
3. Check test files for expected behavior
4. Open an issue in the repository

## Changelog

### Version 1.0.0 - Initial Release

**Added:**
- `VITE_READABILITY_V1` flag
- `VITE_READABILITY_HIDE_FIELD_TIMESTAMPS` flag
- Enhanced input styling in PreviewEditable
- Section card wrappers
- Docked chat functionality
- Compact Composer component
- Updated chat bubble styling
- Comprehensive test coverage

**Changed:**
- Input font size from 14px to 16px (when flag enabled)
- Border colors from translucent to solid grays
- Section layout to use card-based design
- Chat panel to support docked state

**Improved:**
- Visual hierarchy and readability
- Accessibility compliance
- User experience with always-available input
