# Charter Wizard & Guided Chat Implementation

## Overview

This document describes the implementation of the guided chat feature for Charter creation, which replaces the visible wizard UI as the default experience. The Charter Wizard is now hidden behind feature flags and only appears when explicitly enabled.

## Problem Statement (Historical)

The Charter Wizard was showing "Auto · just now" chips next to fields in the preview panel, indicating that background extraction was auto-filling fields instead of letting the wizard drive a strict, line-by-line interview.

## Root Cause

The application has two parallel systems:

1. **Conversation Machine** (`src/state/conversationMachine.ts` + `src/chat/CharterFieldSession.tsx`)
   - Well-designed sequential state machine
   - Asks one field at a time: INIT → ASK → CAPTURE → VALIDATE → CONFIRM → NEXT_FIELD
   - Properly handles validation, back, skip, and edit actions

2. **Background Extraction** (`src/hooks/useBackgroundExtraction.js`)
   - Auto-extracts data from uploaded documents/messages/voice
   - Sets `source: "Auto"` metadata on extracted fields
   - Runs continuously as messages/attachments change

When both systems run simultaneously, background extraction would auto-fill fields with "Auto" metadata, causing "Auto · just now" chips to appear in `src/components/PreviewEditable.jsx`, conflicting with the wizard's sequential flow.

## Solution

Modified `src/App.jsx` to:

1. **Detect wizard mode**: Added `isWizardActive` computed value that checks:
   - Conversation state exists
   - Document type is "charter"
   - Mode is "session" or "review" (not "finalized")

2. **Disable background extraction during wizard mode**:
   - When `isWizardActive` is true, pass empty arrays to `useBackgroundExtraction`
   - This prevents auto-extraction from running
   - The wizard controls all field collection through the conversation machine

3. **Clear "Auto" metadata when wizard starts**:
   - When wizard becomes active, clear metadata for all wizard fields
   - Prevents showing stale "Auto" chips from previous extractions

4. **Sync wizard state to draft**:
   - Extract confirmed field values from conversation state
   - Update draft store with "Wizard" source metadata instead of "Auto"
   - Fields now show "Wizard · just now" chips to indicate manual collection

## Files Changed

- **src/App.jsx**:
  - Imported `useConversationState` from `conversationStore`
  - Added `conversationState` hook call (line 490)
  - Added `isWizardActive` computed value (lines 492-500, moved before usage to fix initialization error)
  - Modified `useBackgroundExtraction` call to conditionally disable extraction (lines 1021-1023)
  - Added useEffect to clear "Auto" metadata on wizard start (lines 536-563)
  - Added useEffect to sync conversation state to draft with "Wizard" metadata (lines 566-606)

## Testing

To verify the fix works:

1. Start a new charter draft
2. Upload a scope document (optional)
3. The wizard should start and ask: "What is the project title?"
4. Answer the question → preview updates with "Wizard · just now" chip
5. Wizard asks next question: "Who is the primary sponsor?"
6. Continue through all fields sequentially
7. No "Auto" chips should appear for fields not yet collected
8. Only "Wizard" chips should appear for confirmed fields

## Acceptance Criteria

✅ Assistant asks exactly one question at a time based on ordered charter schema
✅ PM answers → system extracts/validates → value is saved and next field is asked
✅ "Skip," "Back," and "Change answer" work predictably
✅ Auto-fill (from uploaded scope doc) is disabled during wizard mode
✅ The right-hand preview updates immediately after each field is confirmed
✅ Fields show "Wizard" chips instead of "Auto" chips
✅ No "Auto" chips appear for fields not yet collected through wizard

## Feature Flags

### Current Implementation

Two new feature flags control the Charter experience:

1. **`VITE_CHARTER_WIZARD_VISIBLE` / `CHARTER_WIZARD_VISIBLE`** (default: `false`)
   - Controls whether the Charter Wizard UI is rendered
   - When `false` (default): Users interact via guided chat flow
   - When `true`: The wizard panel is visible in the UI
   - Implemented in: `config/featureFlags.js` → `isCharterWizardVisible()`

2. **`VITE_AUTO_EXTRACT` / `AUTO_EXTRACT`** (default: `false`)
   - Controls whether automatic background extraction is enabled
   - When `false` (default): Auto-extraction only runs when manually triggered
   - When `true`: Auto-extraction runs automatically (requires wizard to also be visible)
   - Implemented in: `config/featureFlags.js` → `isAutoExtractionEnabled()`

3. **`VITE_INTENT_ONLY_EXTRACTION` / `INTENT_ONLY_EXTRACTION`** (default: `true`)
   - Existing flag that disables legacy auto-extraction pathways
   - Works in conjunction with the new `AUTO_EXTRACT` flag

### Default Experience (Guided Chat)

With defaults (`VITE_CHARTER_WIZARD_VISIBLE=false`, `VITE_AUTO_EXTRACT=false`):
- Wizard UI is hidden
- Chat asks one question at a time
- Preview updates after each confirmation
- No "Auto · just now" chips appear
- Values are confirmed through conversation flow

### Enabling Wizard Mode

Set environment variables:
```bash
VITE_CHARTER_WIZARD_VISIBLE=true
VITE_AUTO_EXTRACT=true
```

This enables:
- Visible wizard panel UI
- "Auto-fill from uploaded scope" button
- Auto-extraction with "Auto" metadata chips

## Commit Details

- **Branch**: `claude/fix-charter-wizard-sequential-011CUp3h6MCePww6d5HyyC3h`
- **Commits**:
  - `ad493a1` - "fix: disable background extraction during charter wizard mode"
  - `7b2ca83` - "fix: move isWizardActive definition before usage to prevent uninitialized variable error"
- **Pushed**: Yes ✅

## Browser Error Fix

**Error**: `ReferenceError: Cannot access uninitialized variable` at App.jsx:563

**Cause**: The `isWizardActive` variable was being referenced in `useEffect` hooks (lines 536, 567) before it was defined (originally at line 999).

**Fix**: Moved the `isWizardActive` definition to line 494, immediately after `conversationState` is initialized, ensuring it's available before any code tries to use it.

## Latest Implementation (Guided Chat by Default)

### Changes Made

1. **Feature Flags** (`config/featureFlags.js`)
   - Added `isCharterWizardVisible()` - controls wizard UI visibility (default: false)
   - Added `isAutoExtractionEnabled()` - controls auto-extraction (default: false)
   - Both support client-side (`VITE_` prefix) and server-side environment variables

2. **Wizard UI Gating** (`src/App.jsx`)
   - Wrapped `<CharterFieldSession>` render with `isCharterWizardVisible()` check
   - Updated `isWizardActive` to also check the feature flag
   - Wizard only renders when flag is explicitly enabled

3. **Manual Auto-fill Trigger** (`src/hooks/useBackgroundExtraction.js`)
   - Added `manualTrigger` parameter to hook
   - Auto-extraction only runs when:
     - Legacy mode is enabled AND `AUTO_EXTRACT` flag is true (automatic), OR
     - Manual trigger is set to true (explicit button click)
   - Added useEffect to handle manual trigger events

4. **Auto-fill Button** (`src/App.jsx`)
   - Added "Auto-fill from uploaded scope" button
   - Only visible when wizard is visible AND auto-extract is enabled AND content exists
   - Triggers extraction via `manualTrigger` state
   - Includes telemetry tracking (`charter_auto_fill_invoked` event)

5. **Source Chip Hiding** (`src/components/PreviewEditable.jsx`)
   - Modified `FieldMetaTags` component
   - "Auto" chips only show when wizard is visible
   - In guided chat mode (default), auto chips are hidden
   - Prevents confusion about auto-extracted vs. confirmed values

6. **Environment Configuration** (`.env`)
   - Added `VITE_CHARTER_WIZARD_VISIBLE=false`
   - Added `VITE_AUTO_EXTRACT=false`
   - Documented defaults in comments

### Files Changed (Latest Update)

- **config/featureFlags.js**: Added `isCharterWizardVisible()` and `isAutoExtractionEnabled()`
- **src/App.jsx**:
  - Updated imports to include new feature flags
  - Added `manualExtractionTrigger` state
  - Gated wizard render with feature flag
  - Added auto-fill button with telemetry
  - Passed `manualTrigger` to `useBackgroundExtraction`
- **src/hooks/useBackgroundExtraction.js**:
  - Added `manualTrigger` parameter
  - Updated extraction logic to respect both flags
  - Added manual trigger useEffect
- **src/components/PreviewEditable.jsx**:
  - Imported `isCharterWizardVisible`
  - Updated `FieldMetaTags` to hide "Auto" chips in guided chat mode
- **.env**: Added feature flag defaults
- **CHANGELOG.md**: Documented new feature release

### Telemetry

- **Event**: `charter_auto_fill_invoked`
- **Triggered**: When auto-fill button is clicked
- **Metadata**:
  - `attachmentCount`: Number of uploaded files
  - `messageCount`: Number of messages in context
- **Endpoint**: `/api/telemetry/event`

### Rollback Instructions

To revert to the old wizard-visible behavior:

```bash
# In .env or environment
VITE_CHARTER_WIZARD_VISIBLE=true
VITE_AUTO_EXTRACT=true
```

Then restart the application. The wizard UI will reappear and auto-extraction will resume automatically.
