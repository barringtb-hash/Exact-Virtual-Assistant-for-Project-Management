# Comprehensive Refactoring Plan
## Exact Virtual Assistant for Project Management

**Date**: 2025-11-24
**Status**: Planning Phase
**Priority**: HIGH

---

## Executive Summary

This refactoring plan addresses critical architectural, performance, and code quality issues identified in the codebase audit. The plan is organized into 5 phases executed over a structured timeline, prioritizing high-impact improvements that enhance maintainability, performance, and code quality.

### Key Metrics
- **Total Issues Identified**: 37
- **High Severity**: 17 issues
- **Medium Severity**: 20 issues
- **Estimated Effort**: 15-20 development days
- **Expected Performance Improvement**: 30-50% reduction in re-renders and API response time

---

## Phase 1: Critical Architecture Cleanup (Days 1-3)
**Priority**: CRITICAL
**Impact**: High - Reduces maintenance burden and code complexity
**Dependencies**: None

### 1.1 Remove Redundant API Route Layer
**Issue**: Three-layer API routing (`/api/charter/` → `/api/doc/` → `/api/documents/`)

**Action Items**:
1. Delete entire `/api/doc/` directory
   - Files: `validate.js`, `render.js`, `extract.js`, `download.js`, `make-link.js`
2. Update `/api/charter/` routes to directly use `/api/documents/`
   - Modify: `/api/charter/extract.js`
   - Modify: `/api/charter/validate.js`
   - Modify: `/api/charter/render.js`
   - Modify: `/api/charter/download.js`
3. Update all frontend imports that reference `/api/doc/` routes
4. Update tests to reflect new route structure

**Files to Modify**:
- `/api/charter/extract.js` (change import from `../doc/extract` to `../documents/extract`)
- `/api/charter/validate.js`
- `/api/charter/render.js`
- `/api/charter/download.js`
- All test files referencing old routes

**Success Criteria**:
- Zero references to `/api/doc/` in codebase
- All tests passing
- No change in API functionality

---

### 1.2 Consolidate Charter Module Organization
**Issue**: Charter code scattered across 6 directories

**Current Structure**:
```
/src/features/charter/    - Frontend state & orchestration
/src/lib/charter/         - Frontend utilities
/lib/charter/             - Backend utilities
/server/charter/          - Server-side extraction
/api/charter/             - API endpoints
/api/assistant/charter/   - Assistant API
```

**Proposed Structure**:
```
/src/features/charter/    - All frontend charter code
  /components/            - React components
  /hooks/                 - Custom hooks
  /state/                 - State management
  /utils/                 - Frontend utilities

/server/charter/          - All backend charter code
  /api/                   - API route handlers
  /extraction/            - Extraction logic
  /validation/            - Validation logic
  /utils/                 - Backend utilities
```

**Action Items**:
1. Move `/src/lib/charter/` contents to `/src/features/charter/utils/`
2. Move `/lib/charter/` contents to `/server/charter/utils/`
3. Move `/api/charter/` and `/api/assistant/charter/` to `/server/charter/api/`
4. Update all imports across the codebase
5. Update build configuration if needed

**Files Affected**: 30+ files

**Success Criteria**:
- Charter code exists in only 2 top-level directories
- Clear separation of frontend and backend code
- All imports updated and working

---

### 1.3 Refactor `/api/documents/extract.js` (951 lines)
**Issue**: Massive single file with 107+ internal functions, mixed concerns

**Proposed Breakdown**:
```
/server/documents/
  extract.js              - Main handler (150 lines)
  /extraction/
    charter.js            - Charter-specific extraction
    ddp.js                - DDP extraction
    guided.js             - Guided mode handling
  /sanitization/
    sanitizers.js         - All sanitize* functions
    validators.js         - Validation helpers
  /formatting/
    formatters.js         - Format utilities
  /openai/
    client.js             - OpenAI integration
    prompts.js            - Prompt management
```

**Action Items**:
1. Create new directory structure under `/server/documents/`
2. Extract sanitization functions to `/server/documents/sanitization/sanitizers.js`
   - `sanitizeCharterMessagesForTool` (lines 314-339)
   - `sanitizeCharterAttachmentsForTool` (lines 341-370)
   - `sanitizeCharterVoiceForTool` (lines 372-402)
   - `sanitizeExtractionIssues` (lines 224-241)
3. Extract OpenAI logic to `/server/documents/openai/client.js`
   - `buildOpenAIClient` and related functions
4. Extract guided mode logic to `/server/documents/extraction/guided.js`
   - Guided confirmation handling (lines 701-735)
5. Extract charter extraction to `/server/documents/extraction/charter.js`
   - `loadCharterExtraction` (lines 27-71)
   - Charter-specific processing
6. Create shared utilities in `/server/documents/utils/`
   - Body parsing functions
   - Text extraction helpers
7. Update main handler to orchestrate extracted modules
8. Update all tests

**Files to Create**: 8 new files
**Lines Reduced**: From 951 to ~150 in main handler

**Success Criteria**:
- Main extract.js under 200 lines
- Each module has single responsibility
- All existing tests pass
- No functionality changes

---

## Phase 2: Code Duplication Elimination (Days 4-5)
**Priority**: HIGH
**Impact**: Medium - Reduces maintenance burden
**Dependencies**: Phase 1 completion

### 2.1 Unify Body Parsing Logic
**Issue**: 3 copies of body parsing functions across API routes

**Action Items**:
1. Create `/server/utils/requestParsing.js`
2. Implement single `parseRequestBody(req)` function
3. Implement single `extractDocumentPayload(body)` function
4. Replace all instances:
   - `/api/documents/validate.js` (lines 9-35)
   - `/api/documents/render.js` (lines 95-153)
   - `/api/documents/extract.js` (lines 531-557)
5. Add comprehensive tests for edge cases

**Files to Modify**: 3 files
**Code Reduction**: ~120 lines eliminated

**Success Criteria**:
- Single source of truth for request parsing
- All tests passing
- Consistent error handling

---

### 2.2 Consolidate Sanitization Functions
**Issue**: 4 similar sanitization functions with duplicate patterns

**Action Items**:
1. Create generic `sanitizeForTool(data, type, options)` function
2. Replace specific sanitizers with configured generic version:
   - `sanitizeCharterMessagesForTool`
   - `sanitizeCharterAttachmentsForTool`
   - `sanitizeCharterVoiceForTool`
   - `sanitizeExtractionIssues`
3. Add configuration object for each data type
4. Add unit tests for all data types

**Files to Create**: `/server/utils/sanitization.js`
**Code Reduction**: ~90 lines eliminated

---

### 2.3 Extract Shared `createId()` Utility
**Issue**: `createId()` defined 4 times across stores

**Action Items**:
1. Create `/src/utils/id.ts`
2. Implement single `createId()` function
3. Replace all instances:
   - `/src/chat/ChatComposer.tsx` (lines 11-16)
   - `/src/state/chatStore.ts` (lines 24-29)
   - `/src/state/voiceStore.ts` (lines 17-22)
   - `/src/state/syncStore.ts` (lines 28-33)
4. Add tests

**Files to Modify**: 4 files
**Code Reduction**: ~24 lines eliminated

---

### 2.4 Consolidate Text Extraction Helpers
**Issue**: Multiple similar text extraction functions

**Action Items**:
1. Create `/server/utils/textExtraction.js`
2. Unify `extractMessageText` and `getLastUserMessageText`
3. Add comprehensive text extraction utilities
4. Update all consumers

**Files to Modify**: 1 primary file + consumers
**Code Reduction**: ~30 lines eliminated

---

## Phase 3: Performance Optimization (Days 6-9)
**Priority**: HIGH
**Impact**: High - Improves user experience
**Dependencies**: Phase 1-2 completion

### 3.1 Optimize React Component Re-renders
**Issue**: Missing memoization causing excessive re-renders

**Action Items**:

#### 3.1.1 Optimize `CharterFieldSession.tsx`
1. Wrap component with `React.memo()`
2. Add `useCallback` for all event handlers:
   - `handleSubmit` (line 225)
   - `handleEdit` (line 235)
   - Other callback props
3. Memoize `renderReview()` output (lines 258-320)
4. Memoize `renderConversation()` switch statement (lines 340-423)
5. Split into smaller sub-components for better memoization

**Files to Modify**: `/src/chat/CharterFieldSession.tsx`

#### 3.1.2 Optimize `ChatComposer.tsx`
1. Wrap component with `React.memo()`
2. Add `useCallback` for:
   - `handleSend`
   - `handleKeyDown`
   - `handleAttach`
   - All other callbacks
3. Memoize expensive computations
4. Consider extracting sub-components

**Files to Modify**: `/src/chat/ChatComposer.tsx`

#### 3.1.3 Add Memoization to Other Components
**Target Components**:
- `/src/preview/PreviewPanel.tsx`
- `/src/components/ChatMessage.tsx`
- `/src/components/AssistantMessage.tsx`

**Expected Impact**: 40-60% reduction in re-renders

---

### 3.2 Optimize Context Re-renders
**Issue**: Context updates trigger all consumer re-renders

**Action Items**:
1. Split `/src/chat/ChatContext.tsx` into multiple contexts:
   - `ChatMessagesContext` - Messages only
   - `ChatActionsContext` - Actions only
   - `ChatStateContext` - UI state
2. Create selector hooks:
   - `useChatMessages()`
   - `useChatActions()`
   - `useChatState()`
3. Update all consumers to use specific contexts
4. Add performance monitoring

**Files to Modify**: `/src/chat/ChatContext.tsx` + all consumers

**Expected Impact**: 50% reduction in context-related re-renders

---

### 3.3 Optimize State Management
**Issue**: Multiple state stores with inefficient update patterns

**Action Items**:

#### 3.3.1 Implement Efficient Store Updates
1. Add batching mechanism to `/src/lib/tinyStore.ts`
2. Implement selective notification (only notify affected subscribers)
3. Add `useStoreSelector(store, selector)` hook
4. Update all stores to use batching

**Files to Modify**: `/src/lib/tinyStore.ts`

#### 3.3.2 Optimize `syncStore.ts` Cloning
1. Replace manual cloning with `immer.js`
2. Eliminate `cloneWorkingState()` (lines 101-111)
3. Use immutable update patterns in:
   - `ingestInput()` (lines 313-349)
   - `applyPatch()` (lines 437-579)
4. Add performance benchmarks

**Files to Modify**: `/src/state/syncStore.ts`
**Dependencies**: Add `immer` to package.json

**Expected Impact**: 70% reduction in state update overhead

---

### 3.4 Optimize Template Loading
**Issue**: Templates loaded on every request despite caching

**Action Items**:
1. Create template preloader in `/server/utils/templatePreloader.js`
2. Preload all templates on server start
3. Implement in-memory LRU cache
4. Update `/api/documents/render.js` to use preloaded templates
5. Add cache invalidation mechanism

**Files to Modify**: `/api/documents/render.js`

**Expected Impact**: 80% reduction in first-request latency

---

### 3.5 Optimize Dynamic Compilation
**Issue**: TypeScript compilation in `loadCharterExtraction()`

**Action Items**:
1. Pre-compile TypeScript files during build
2. Remove esbuild runtime compilation
3. Import compiled modules directly
4. Update build process

**Files to Modify**:
- `/api/documents/extract.js`
- `vite.config.js`
- Build scripts

**Expected Impact**: 90% reduction in extraction initialization time

---

## Phase 4: Code Quality Improvements (Days 10-13)
**Priority**: MEDIUM
**Impact**: Medium - Improves maintainability
**Dependencies**: Phase 1-3 completion

### 4.1 Eliminate TypeScript `any` Types
**Issue**: 10+ instances of `any` losing type safety

**Action Items**:
1. Create proper type definitions:
   ```typescript
   // /src/types/audio.ts
   interface AudioContextType {
     createMediaStreamSource(stream: MediaStream): MediaStreamAudioSourceNode;
     createAnalyser(): AnalyserNode;
     // ... other methods
   }
   ```
2. Replace all `any` with specific types:
   - `/src/audio/micLevelEngine.ts` (line 37)
   - `/src/hooks/useSpeechInput.ts` (line 196)
   - `/src/hooks/useMicLevel.ts` (lines 50, 74)
   - `/src/features/charter/schema.ts`
   - `/src/lib/forms/validation.ts` (line 193)
3. Enable stricter TypeScript compiler options
4. Add type tests

**Files to Create**: `/src/types/audio.ts`, `/src/types/api.ts`
**Files to Modify**: 6 files

---

### 4.2 Implement Centralized Logging
**Issue**: 164+ console.log calls across 37 files

**Action Items**:
1. Create `/src/utils/logger.ts` and `/server/utils/logger.js`
2. Implement structured logging with levels:
   ```typescript
   logger.debug(message, context)
   logger.info(message, context)
   logger.warn(message, context)
   logger.error(message, context)
   ```
3. Add environment-based log filtering
4. Replace all `console.log/warn/error` with logger
5. Add log aggregation support (optional)

**Files to Create**: 2 logger files
**Files to Modify**: 37+ files

**Expected Impact**: Better debugging and production monitoring

---

### 4.3 Add Comprehensive Error Handling
**Issue**: Missing error handling in multiple locations

**Action Items**:
1. Create error boundary components:
   - `/src/components/ErrorBoundary.tsx`
   - `/src/components/ChatErrorBoundary.tsx`
2. Add error boundaries to component tree
3. Implement proper error handling in:
   - `/src/lib/forms/validation.ts`
   - `/src/state/syncStore.ts` (lines 93-98)
   - `/src/chat/ChatComposer.tsx` (lines 104-108)
   - `/api/documents/extract.js` (line 84)
4. Create error reporting service
5. Add error recovery mechanisms

**Files to Create**: 3 new files
**Files to Modify**: 10+ files

---

### 4.4 Consolidate Type Definitions
**Issue**: Duplicate type definitions across files

**Action Items**:
1. Create `/src/types/chat.ts`:
   ```typescript
   export interface ChatMessage {
     id: string;
     role: 'user' | 'assistant' | 'system';
     content: string;
     timestamp: number;
   }
   ```
2. Remove duplicate definitions:
   - `/src/chat/ChatContext.tsx` (lines 5-13)
   - `/src/state/chatStore.ts` (lines 5-10)
3. Export from single source
4. Update all imports

**Files to Create**: `/src/types/chat.ts`
**Files to Modify**: 10+ files

---

### 4.5 Extract Magic Constants
**Issue**: Hardcoded values without explanation

**Action Items**:
1. Create configuration files:
   - `/server/config/extraction.js`
   - `/server/config/limits.js`
2. Extract constants:
   ```javascript
   export const EXTRACTION_LIMITS = {
     ATTACHMENT_CHAR_LIMIT: 20_000,
     MIN_TEXT_CONTEXT_LENGTH: 25,
     VALID_TOOL_ROLES: ['user', 'assistant', 'system', 'developer']
   };
   ```
3. Add documentation for each constant
4. Update all references

**Files to Create**: 2 config files
**Files to Modify**: 5+ files

---

### 4.6 Add Code Documentation
**Issue**: Complex logic lacks explanation

**Action Items**:
1. Add JSDoc comments to:
   - All public functions
   - Complex algorithms
   - API routes
2. Document intent detection logic
3. Document guided confirmation flow
4. Document batch extraction logic
5. Generate API documentation

**Files to Modify**: 50+ files

---

## Phase 5: API Improvements & Testing (Days 14-17)
**Priority**: MEDIUM
**Impact**: Medium - Improves API quality and reliability
**Dependencies**: Phase 1-4 completion

### 5.1 Standardize API Error Responses
**Issue**: Inconsistent error response formats

**Action Items**:
1. Create standard error response format:
   ```javascript
   {
     error: {
       code: 'ERROR_CODE',
       message: 'Human-readable message',
       details: { /* additional context */ }
     },
     timestamp: '2025-11-24T10:00:00Z',
     path: '/api/documents/extract'
   }
   ```
2. Create error response middleware
3. Update all API routes to use standard format:
   - `/api/documents/validate.js`
   - `/api/documents/render.js`
   - `/api/documents/extract.js`
4. Update frontend error handling
5. Document error codes

**Files to Modify**: All API route files

---

### 5.2 Fix HTTP Status Code Usage
**Issue**: Non-standard status codes

**Action Items**:
1. Update status codes in `/api/documents/extract.js`:
   - Line 647: Change 200 to 204 for skipped operations
   - Line 691: Change 422 to 400 for invalid input
   - Line 853: Change 202 to 200 for completed extraction
2. Document status code usage
3. Add tests for each status code

**Files to Modify**: `/api/documents/extract.js`

---

### 5.3 Add Input Validation to All Routes
**Issue**: Some routes lack validation

**Action Items**:
1. Create validation middleware
2. Add validation to:
   - `/api/voice/sdp.js`
   - `/api/files/text.js`
   - `/api/charter/health.js`
3. Use AJV schemas for validation
4. Add validation tests

**Files to Modify**: 5+ API files

---

### 5.4 Implement Template Preloading
**Issue**: Templates loaded on demand

**Action Items**:
1. Add template preloading to server startup
2. Implement cache warming
3. Add cache metrics
4. Monitor cache hit rates

**Files to Modify**:
- Server initialization
- `/api/documents/render.js`

---

### 5.5 Comprehensive Testing Strategy

#### 5.5.1 Unit Tests (Days 14-15)
**Goal**: Achieve 70%+ code coverage

**Action Items**:
1. Add tests for React components:
   - `CharterFieldSession.test.tsx`
   - `ChatComposer.test.tsx`
   - `PreviewPanel.test.tsx`
   - All UI components
2. Add tests for hooks:
   - `useBackgroundExtraction.test.ts`
   - `useSpeechInput.test.ts`
   - `useMicLevel.test.ts`
3. Add tests for state management:
   - `chatStore.test.ts`
   - `draftStore.test.ts`
   - Enhanced `syncStore.test.ts`
4. Add tests for utilities:
   - All new utility modules
   - Sanitization functions
   - Text extraction

**Files to Create**: 30+ test files

#### 5.5.2 Integration Tests (Days 15-16)
**Goal**: Test critical workflows end-to-end

**Action Items**:
1. Add API integration tests:
   - Charter creation flow
   - Document extraction flow
   - Validation flow
   - Rendering flow
2. Add component integration tests:
   - Chat message flow
   - Voice input flow
   - Preview sync flow
3. Add state integration tests:
   - Multi-store interactions
   - State synchronization

**Files to Create**: 15+ integration test files

#### 5.5.3 E2E Tests (Day 16-17)
**Goal**: Expand Cypress/Playwright coverage

**Action Items**:
1. Add E2E tests for:
   - Complete charter creation
   - DDP creation
   - Voice-to-charter flow
   - Error recovery flows
2. Add visual regression tests
3. Add performance tests
4. Add accessibility tests

**Files to Create**: 10+ E2E test files

---

## Phase 6: State Management Unification (Days 18-20)
**Priority**: MEDIUM
**Impact**: High - Simplifies architecture
**Dependencies**: Phase 1-5 completion

### 6.1 Choose State Management Strategy
**Issue**: Dual patterns (Context API + Custom Stores)

**Recommended Approach**: Standardize on custom store pattern

**Rationale**:
- Already extensively used
- Better performance than Context
- More control over updates
- Easier to optimize

**Alternative**: Migrate to Zustand or similar library

---

### 6.2 Unify State Stores
**Issue**: 7+ fragmented stores

**Action Items**:
1. Create unified store structure:
   ```typescript
   /src/state/
     index.ts              - Main store exports
     /slices/
       chat.ts             - Chat state slice
       conversation.ts     - Conversation slice
       draft.ts            - Draft slice
       voice.ts            - Voice slice
       sync.ts             - Sync slice
     /selectors/
       chat.ts             - Chat selectors
       conversation.ts     - Other selectors
     /actions/
       chat.ts             - Chat actions
       conversation.ts     - Other actions
   ```
2. Implement store composition
3. Add cross-slice actions
4. Migrate existing stores
5. Update all consumers

**Files to Modify**: All state files + consumers

---

### 6.3 Implement Normalized State
**Issue**: Nested state structures

**Action Items**:
1. Normalize conversation fields:
   ```typescript
   {
     fields: {
       byId: { [id: string]: Field },
       allIds: string[]
     }
   }
   ```
2. Normalize messages, attachments, etc.
3. Create selector functions for denormalization
4. Update all state access

**Expected Impact**: 40% reduction in state update overhead

---

### 6.4 Add State Persistence
**Action Items**:
1. Implement state persistence middleware
2. Add rehydration logic
3. Add migration support for schema changes
4. Add encryption for sensitive data

---

## Timeline & Resource Allocation

| Phase | Duration | Developer Days | Priority |
|-------|----------|----------------|----------|
| Phase 1: Architecture Cleanup | Days 1-3 | 3 days | CRITICAL |
| Phase 2: Duplication Elimination | Days 4-5 | 2 days | HIGH |
| Phase 3: Performance Optimization | Days 6-9 | 4 days | HIGH |
| Phase 4: Code Quality | Days 10-13 | 4 days | MEDIUM |
| Phase 5: API & Testing | Days 14-17 | 4 days | MEDIUM |
| Phase 6: State Unification | Days 18-20 | 3 days | MEDIUM |
| **Total** | **20 days** | **20 days** | - |

---

## Success Metrics

### Code Quality Metrics
- [ ] Lines of Code: Reduce by 15-20%
- [ ] Code Duplication: Reduce to <3%
- [ ] Cyclomatic Complexity: Average <10
- [ ] TypeScript Coverage: 95%+
- [ ] Test Coverage: 70%+

### Performance Metrics
- [ ] Initial Load Time: <2s (50% improvement)
- [ ] Re-render Count: Reduce by 40%
- [ ] API Response Time: <500ms average
- [ ] Bundle Size: Reduce by 20%
- [ ] Lighthouse Score: 90+

### Maintainability Metrics
- [ ] File Length: No file >500 lines
- [ ] Function Length: No function >50 lines
- [ ] Module Coupling: <30%
- [ ] Documentation Coverage: 80%+

---

## Risk Assessment

### High Risk Items
1. **State Management Unification (Phase 6)**
   - Risk: Breaking changes to all components
   - Mitigation: Incremental migration, extensive testing

2. **API Route Consolidation (Phase 1.1)**
   - Risk: Breaking API clients
   - Mitigation: Maintain backwards compatibility layer temporarily

### Medium Risk Items
1. **Extract.js Refactoring (Phase 1.3)**
   - Risk: Logic errors during extraction
   - Mitigation: Comprehensive test coverage before refactoring

2. **Performance Optimization (Phase 3)**
   - Risk: Over-optimization causing bugs
   - Mitigation: Benchmark before/after, gradual rollout

---

## Dependencies & Prerequisites

### External Dependencies to Add
```json
{
  "immer": "^10.0.0",           // For immutable state updates
  "zustand": "^4.0.0",          // Optional: state management
  "winston": "^3.11.0"          // Server-side logging
}
```

### Build Tool Updates
- Enable stricter TypeScript checks
- Add bundle analyzer
- Add performance monitoring

---

## Rollback Strategy

Each phase should be completed in a feature branch with:
1. Comprehensive tests
2. Performance benchmarks
3. Rollback plan documented

### Rollback Triggers
- Test coverage drops below 60%
- Performance degrades >10%
- Critical bugs in production
- User-facing functionality breaks

---

## Next Steps

1. **Review this plan** with the development team
2. **Prioritize phases** based on business needs
3. **Set up tracking** (GitHub Projects, Jira, etc.)
4. **Create feature branches** for each phase
5. **Begin Phase 1** after approval

---

## Appendix A: File Structure After Refactoring

```
/src/
  /components/          - All React components
  /features/
    /charter/          - Charter feature (consolidated)
      /components/
      /hooks/
      /state/
      /utils/
  /hooks/              - Shared hooks
  /state/              - Unified state management
    /slices/
    /selectors/
    /actions/
  /types/              - TypeScript type definitions
  /utils/              - Shared utilities
    id.ts
    logger.ts

/server/
  /charter/            - Charter backend (consolidated)
    /api/
    /extraction/
    /validation/
    /utils/
  /documents/          - Document processing
    /extraction/
    /sanitization/
    /formatting/
    /openai/
  /utils/              - Shared server utilities
    logger.js
    requestParsing.js
    templatePreloader.js

/api/
  /documents/          - Main API routes
  /charter/            - Charter-specific routes (simplified)
  /chat/
  /voice/
  /files/
  /telemetry/
```

---

## Appendix B: Testing Strategy Detail

### Test Coverage Goals
- Unit Tests: 70% coverage
- Integration Tests: Critical paths covered
- E2E Tests: All user flows covered

### Test Categories
1. **Component Tests**: React Testing Library
2. **Hook Tests**: React Hooks Testing Library
3. **State Tests**: Direct store testing
4. **API Tests**: Supertest or similar
5. **E2E Tests**: Cypress/Playwright

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Claude | Initial refactoring plan |

---

**End of Refactoring Plan**
