# Charter Wizard Sequential Flow Fix

## Problem Statement

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

The fix respects the existing `isIntentOnlyExtractionEnabled()` feature flag (defaults to `true`), which already disables legacy auto-extraction. The wizard fix adds an additional layer of protection by explicitly disabling background extraction when the wizard is active.

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

## Future Improvements

- Consider adding a "Auto-fill from scope" button that allows the PM to opt-in to auto-extraction
- When auto-fill is used, still walk the PM through confirmations in sequence
- Add telemetry to track wizard completion rates and field skip patterns
