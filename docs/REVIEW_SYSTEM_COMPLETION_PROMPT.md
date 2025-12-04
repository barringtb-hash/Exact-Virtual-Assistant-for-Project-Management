# AI Agent Prompt: Complete Document Review System Implementation

## Context

A Document Review System has been implemented for the Exact Virtual Assistant project. The core functionality is complete across 5 phases, but there are integration and enhancement tasks remaining. Your job is to complete the implementation so the feature is fully usable.

## What Has Been Implemented

### Core Files Created:
- `lib/doc/review.js` - Review engine with LLM integration
- `api/documents/review.js` - POST /api/documents/review endpoint
- `api/documents/review-stream.js` - SSE streaming endpoint
- `api/assistant/review/start.js` - Interactive session start
- `api/assistant/review/messages.js` - Interactive session messages
- `server/knowledge/query.js` - Knowledge database query service
- `server/review/Orchestrator.ts` - Interactive session state machine
- `src/components/ReviewPanel.jsx` - React UI component
- `src/state/slices/reviewSession.ts` - State management slice
- `templates/charter/review_prompt.txt` - Charter review prompt
- `templates/charter/review_rules.json` - Charter review rules
- `templates/knowledge/` - Knowledge database entries (18 entries)
- Registry extended with review configuration

### Documentation:
- `docs/CHARTER_REVIEW_STRATEGY.md` - Architecture and strategy
- `docs/DOCUMENT_REVIEW_SYSTEM.md` - Feature documentation

## Tasks to Complete

### 1. UI Integration (Priority: High)

**Goal:** Wire the ReviewPanel component into the main application flow.

**Tasks:**
1. Add a "Review Charter" button to the charter editing interface in `src/App.jsx`
2. Create a hook or service to call the review API: `src/hooks/useCharterReview.ts`
3. Integrate ReviewPanel into the charter workflow (show after extraction or on-demand)
4. Add loading states and error handling for review API calls
5. Wire up the feedback accept/dismiss callbacks to update the document draft

**Files to modify:**
- `src/App.jsx` - Add review button and ReviewPanel integration
- Create `src/hooks/useCharterReview.ts` - API integration hook
- Potentially modify `src/features/charter/` components

**Reference patterns:**
- Look at how the guided charter chat is integrated
- Check `src/state/slices/voiceCharter.ts` for state slice patterns

### 2. Testing (Priority: High)

**Goal:** Add test coverage for the new review system.

**Tasks:**
1. Unit tests for `lib/doc/review.js`:
   - Test `reviewDocument()` with mock OpenAI responses
   - Test `parseReviewResponse()` with edge cases
   - Test `checkReviewThresholds()`

2. Unit tests for `server/knowledge/query.js`:
   - Test `queryKnowledge()` with different triggers
   - Test `evaluateCondition()` for all operators
   - Test `formatKnowledgeForPrompt()`

3. API endpoint tests:
   - Test `/api/documents/review` with valid/invalid inputs
   - Test error handling (missing docType, missing document, etc.)
   - Test `/api/assistant/review/start` and `/messages`

4. Component tests for `ReviewPanel.jsx`:
   - Test rendering with review data
   - Test accept/dismiss interactions
   - Test filtering by severity

**Files to create:**
- `tests/unit/lib/doc/review.test.js`
- `tests/unit/server/knowledge/query.test.js`
- `tests/api/documents/review.test.js`
- `tests/components/ReviewPanel.test.jsx`

**Testing patterns:**
- Use Node test module (see existing tests in `tests/`)
- Mock OpenAI using the pattern in existing extraction tests
- Use `tests/_stubs/` for browser API mocks

### 3. DDP Review Configuration (Priority: Medium)

**Goal:** Add review support for Design & Development Plan documents.

**Tasks:**
1. Create `templates/ddp/review_prompt.txt` - DDP-specific review prompt
2. Create `templates/ddp/review_rules.json` - DDP field rules
3. Create `templates/knowledge/ddp/` directory with:
   - `best_practices.json` - DDP best practices (5-8 entries)
   - `checklists.json` - DDP checklists (2-3 entries)
4. Update `templates/registry.js` to add review config to DDP manifest

**Reference:**
- Look at `templates/charter/review_prompt.txt` for prompt structure
- Look at `templates/charter/review_rules.json` for rules format
- Check DDP schema at `templates/doc-types/ddp/schema.json` for fields

### 4. Pre-Export Review Gate (Priority: Medium)

**Goal:** Optionally require review before document export.

**Tasks:**
1. Add configuration option: `VITE_REQUIRE_REVIEW_BEFORE_EXPORT=true`
2. Modify export flow to check review status
3. Show review summary if score is below threshold
4. Allow user to proceed or review first

**Files to modify:**
- `src/features/charter/` export-related components
- Potentially `api/documents/render.js`

### 5. Review History (Priority: Low)

**Goal:** Track review history for documents.

**Tasks:**
1. Create `src/state/slices/reviewHistory.ts` to store past reviews
2. Add comparison view to show improvement between reviews
3. Persist to localStorage or IndexedDB
4. Add "View History" option to ReviewPanel

### 6. Field-Level Hints (Priority: Low)

**Goal:** Show inline feedback icons next to charter fields.

**Tasks:**
1. Create a hook to map feedback items to fields
2. Add tooltip/icon component for field-level feedback
3. Integrate with charter form fields
4. Clicking icon should scroll to feedback in ReviewPanel

---

## Implementation Guidelines

### Code Style
- Follow existing patterns in the codebase
- Use JSDoc comments for functions
- TypeScript for state slices and orchestrator
- JavaScript for API endpoints and React components

### State Management
- Use tinyStore slices (see `src/state/core/createSlice.ts`)
- Actions should be pure functions that call setState
- Export hooks for component consumption

### API Patterns
- Use `formatErrorResponse()` for error responses
- Parse request body with validation
- Return structured JSON with consistent shape

### Testing Patterns
- Use Node test module (`node:test`)
- Mock external dependencies (OpenAI, file system)
- Test both success and error paths

### Knowledge Database
- Each entry needs unique `id`
- Use `triggers` to match entries to document content
- Categories: `best_practice`, `checklist`, `anti_pattern`, `rule`
- Priority: `high`, `medium`, `low`

---

## Commands to Run

```bash
# Development
npm run dev              # Start dev server

# Testing
npm test                 # Run unit tests
npm run test:e2e         # Run E2E tests

# Build
npm run build            # Full build

# Validate
npm run dep:check        # Check for circular dependencies
```

---

## Files to Reference

| Purpose | File |
|---------|------|
| State slice pattern | `src/state/slices/voiceCharter.ts` |
| API endpoint pattern | `api/documents/extract.js` |
| Component pattern | `src/components/AssistantFeedbackTemplate.jsx` |
| Test pattern | `tests/unit/` directory |
| Knowledge format | `templates/knowledge/charter/best_practices.json` |
| Registry pattern | `templates/registry.js` |

---

## Success Criteria

1. **UI Integration**: User can click "Review Charter" and see feedback in ReviewPanel
2. **Testing**: >80% coverage on new files, all tests passing
3. **DDP Support**: DDP documents can be reviewed with type-specific feedback
4. **Documentation**: All new code has JSDoc comments
5. **No Regressions**: Existing tests continue to pass

---

## Notes

- The review system uses OpenAI's API, so tests should mock responses
- The knowledge database is JSON-file based (no external database needed)
- The interactive review mode uses an in-memory session store (not persistent)
- Streaming uses Server-Sent Events (SSE), not WebSockets
- The ReviewPanel component uses Tailwind CSS for styling
