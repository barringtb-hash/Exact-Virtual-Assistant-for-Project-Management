# Quick Wins - High Impact, Low Effort Refactorings

This document outlines the highest-priority refactoring tasks that can be completed quickly with significant impact. Start here before tackling the full refactoring plan.

---

## 🔥 Priority 1: Remove Redundant API Layer (2-3 hours)

**Impact**: HIGH | **Effort**: LOW | **Risk**: LOW

### What to Do
Delete the entire `/api/doc/` directory and update references.

### Steps
1. **Identify all references**:
   ```bash
   grep -r "api/doc/" src/ api/
   ```

2. **Delete directory**:
   ```bash
   rm -rf api/doc/
   ```

3. **Update charter routes** to directly import from `/api/documents/`:
   ```javascript
   // api/charter/extract.js
   // BEFORE
   export { default } from "../doc/extract.js";

   // AFTER
   export { default } from "../documents/extract.js";
   ```

4. **Update these files**:
   - `/api/charter/extract.js`
   - `/api/charter/validate.js`
   - `/api/charter/render.js`
   - `/api/charter/download.js`
   - `/api/charter/make-link.js`

5. **Run tests**: `npm test`

### Success Criteria
- ✅ No `/api/doc/` directory exists
- ✅ All tests pass
- ✅ No breaking changes to API

---

## 🚀 Priority 2: Consolidate `createId()` Utility (30 minutes)

**Impact**: MEDIUM | **Effort**: VERY LOW | **Risk**: VERY LOW

### What to Do
Create a single `createId()` function and replace all duplicates.

### Steps
1. **Create** `/src/utils/id.ts`:
   ```typescript
   let idCounter = 0;

   export function createId(): string {
     return `${Date.now()}-${idCounter++}`;
   }
   ```

2. **Replace in these files**:
   - `/src/chat/ChatComposer.tsx` (lines 11-16)
   - `/src/state/chatStore.ts` (lines 24-29)
   - `/src/state/voiceStore.ts` (lines 17-22)
   - `/src/state/syncStore.ts` (lines 28-33)

3. **Update imports**:
   ```typescript
   import { createId } from '../utils/id';
   ```

### Success Criteria
- ✅ Single `createId` implementation
- ✅ All stores use shared function
- ✅ Tests pass

---

## ⚡ Priority 3: Add React.memo to Large Components (1-2 hours)

**Impact**: HIGH | **Effort**: LOW | **Risk**: LOW

### What to Do
Wrap expensive components with `React.memo()` to prevent unnecessary re-renders.

### Steps
1. **Wrap CharterFieldSession**:
   ```typescript
   // src/chat/CharterFieldSession.tsx
   import { memo } from 'react';

   const CharterFieldSession = memo(({ /* props */ }) => {
     // existing code
   });

   export default CharterFieldSession;
   ```

2. **Wrap ChatComposer**:
   ```typescript
   // src/chat/ChatComposer.tsx
   import { memo } from 'react';

   const ChatComposer = memo(({ /* props */ }) => {
     // existing code
   });

   export default ChatComposer;
   ```

3. **Add useCallback to handlers**:
   ```typescript
   const handleSubmit = useCallback((data) => {
     // existing logic
   }, [/* dependencies */]);
   ```

4. **Test re-render behavior** using React DevTools Profiler

### Success Criteria
- ✅ 40%+ reduction in re-renders (measure with React DevTools)
- ✅ No functional changes
- ✅ Tests pass

---

## 🧹 Priority 4: Centralize Request Parsing (1 hour)

**Impact**: MEDIUM | **Effort**: LOW | **Risk**: LOW

### What to Do
Create a single request parsing utility to eliminate duplication.

### Steps
1. **Create** `/server/utils/requestParsing.js`:
   ```javascript
   export function parseRequestBody(req) {
     if (!req.body) {
       throw new Error('Request body is required');
     }
     return req.body;
   }

   export function extractDocumentPayload(body) {
     const { docType = 'charter', data, draft } = body;
     if (!docType) {
       throw new Error('docType is required');
     }
     return { docType, data, draft };
   }
   ```

2. **Replace in these files**:
   - `/api/documents/validate.js` (remove lines 9-35)
   - `/api/documents/render.js` (remove lines 95-153)
   - `/api/documents/extract.js` (remove lines 531-557)

3. **Update imports**:
   ```javascript
   import { parseRequestBody, extractDocumentPayload } from '../../server/utils/requestParsing.js';
   ```

### Success Criteria
- ✅ Single source of truth
- ✅ Consistent error handling
- ✅ Tests pass

---

## 📝 Priority 5: Extract Magic Constants (30 minutes)

**Impact**: MEDIUM | **Effort**: VERY LOW | **Risk**: VERY LOW

### What to Do
Move hardcoded values to a configuration file.

### Steps
1. **Create** `/server/config/extraction.js`:
   ```javascript
   /**
    * Maximum characters to extract from a single attachment
    * Prevents memory exhaustion from large documents
    */
   export const ATTACHMENT_CHAR_LIMIT = 20_000;

   /**
    * Minimum text context length required for extraction
    * Ensures sufficient context for meaningful extraction
    */
   export const MIN_TEXT_CONTEXT_LENGTH = 25;

   /**
    * Valid roles for OpenAI tool calls
    */
   export const VALID_TOOL_ROLES = ['user', 'assistant', 'system', 'developer'];
   ```

2. **Update** `/api/documents/extract.js`:
   ```javascript
   import {
     ATTACHMENT_CHAR_LIMIT,
     MIN_TEXT_CONTEXT_LENGTH,
     VALID_TOOL_ROLES
   } from '../../server/config/extraction.js';

   // Remove lines 18-20 (old constants)
   ```

### Success Criteria
- ✅ All constants documented
- ✅ Single source of truth
- ✅ Easy to modify limits

---

## 🎯 Priority 6: Consolidate Type Definitions (1 hour)

**Impact**: MEDIUM | **Effort**: LOW | **Risk**: LOW

### What to Do
Create a single source of truth for chat message types.

### Steps
1. **Create** `/src/types/chat.ts`:
   ```typescript
   export type ChatRole = 'user' | 'assistant' | 'system' | 'developer';

   export interface ChatMessage {
     id: string;
     role: ChatRole;
     content: string;
     timestamp: number;
     metadata?: Record<string, unknown>;
   }

   export interface Attachment {
     id: string;
     name: string;
     type: string;
     size: number;
     content?: string;
   }
   ```

2. **Remove duplicate definitions**:
   - `/src/chat/ChatContext.tsx` (lines 5-13)
   - `/src/state/chatStore.ts` (lines 5-10)

3. **Update imports**:
   ```typescript
   import type { ChatMessage, ChatRole, Attachment } from '../types/chat';
   ```

### Success Criteria
- ✅ Single type definition
- ✅ No TypeScript errors
- ✅ Tests pass

---

## 🔧 Priority 7: Add Basic Logging Infrastructure (2 hours)

**Impact**: HIGH | **Effort**: MEDIUM | **Risk**: LOW

### What to Do
Replace console.log with a structured logger.

### Steps
1. **Create** `/src/utils/logger.ts`:
   ```typescript
   type LogLevel = 'debug' | 'info' | 'warn' | 'error';

   class Logger {
     private shouldLog(level: LogLevel): boolean {
       const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
       const minLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
       return levels.indexOf(level) >= levels.indexOf(minLevel);
     }

     debug(message: string, context?: object) {
       if (this.shouldLog('debug')) {
         console.log('[DEBUG]', message, context || '');
       }
     }

     info(message: string, context?: object) {
       if (this.shouldLog('info')) {
         console.log('[INFO]', message, context || '');
       }
     }

     warn(message: string, context?: object) {
       if (this.shouldLog('warn')) {
         console.warn('[WARN]', message, context || '');
       }
     }

     error(message: string, error?: Error | object) {
       if (this.shouldLog('error')) {
         console.error('[ERROR]', message, error || '');
       }
     }
   }

   export const logger = new Logger();
   ```

2. **Create** `/server/utils/logger.js`:
   ```javascript
   export const logger = {
     debug: (msg, ctx) => console.log('[DEBUG]', msg, ctx || ''),
     info: (msg, ctx) => console.log('[INFO]', msg, ctx || ''),
     warn: (msg, ctx) => console.warn('[WARN]', msg, ctx || ''),
     error: (msg, err) => console.error('[ERROR]', msg, err || ''),
   };
   ```

3. **Replace console.log in critical files** (start with API routes):
   ```javascript
   // BEFORE
   console.log('Extracting document', docType);

   // AFTER
   import { logger } from '../../server/utils/logger.js';
   logger.info('Extracting document', { docType });
   ```

### Success Criteria
- ✅ Logger infrastructure in place
- ✅ Environment-based filtering works
- ✅ Easy to extend (later add remote logging)

---

## 📊 Priority 8: Add Performance Monitoring (1 hour)

**Impact**: MEDIUM | **Effort**: LOW | **Risk**: VERY LOW

### What to Do
Add basic performance tracking to measure improvements.

### Steps
1. **Create** `/src/utils/performance.ts`:
   ```typescript
   export class PerformanceMonitor {
     private marks: Map<string, number> = new Map();

     start(label: string) {
       this.marks.set(label, performance.now());
     }

     end(label: string): number {
       const start = this.marks.get(label);
       if (!start) {
         console.warn(`No start mark for: ${label}`);
         return 0;
       }
       const duration = performance.now() - start;
       this.marks.delete(label);
       console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
       return duration;
     }
   }

   export const perf = new PerformanceMonitor();
   ```

2. **Add to key operations**:
   ```typescript
   // In API routes
   perf.start('document-extraction');
   await extractDocument(data);
   perf.end('document-extraction');

   // In React components
   perf.start('component-render');
   // component logic
   perf.end('component-render');
   ```

### Success Criteria
- ✅ Track key operation timings
- ✅ Identify performance bottlenecks
- ✅ Baseline metrics established

---

## 🧪 Priority 9: Add Component Tests for Critical Paths (2-3 hours)

**Impact**: HIGH | **Effort**: MEDIUM | **Risk**: LOW

### What to Do
Add tests for the most critical components.

### Steps
1. **Install testing dependencies** (if not already):
   ```bash
   npm install --save-dev @testing-library/react @testing-library/jest-dom
   ```

2. **Create test file** for `ChatComposer`:
   ```typescript
   // src/chat/ChatComposer.test.tsx
   import { render, screen, fireEvent } from '@testing-library/react';
   import ChatComposer from './ChatComposer';

   describe('ChatComposer', () => {
     it('should render message input', () => {
       render(<ChatComposer />);
       expect(screen.getByRole('textbox')).toBeInTheDocument();
     });

     it('should call onSend when message is submitted', () => {
       const onSend = jest.fn();
       render(<ChatComposer onSend={onSend} />);

       const input = screen.getByRole('textbox');
       fireEvent.change(input, { target: { value: 'Test message' } });
       fireEvent.submit(input);

       expect(onSend).toHaveBeenCalledWith('Test message');
     });
   });
   ```

3. **Create tests for**:
   - `ChatComposer` - Message input/send
   - `CharterFieldSession` - Field interactions
   - `PreviewPanel` - Preview rendering

### Success Criteria
- ✅ Critical components have basic tests
- ✅ Tests pass
- ✅ Coverage baseline established

---

## 📦 Implementation Order

For maximum impact with minimal risk, implement in this order:

1. ✅ **Remove Redundant API Layer** (Priority 1) - 2-3 hours
2. ✅ **Consolidate createId()** (Priority 2) - 30 min
3. ✅ **Extract Magic Constants** (Priority 5) - 30 min
4. ✅ **Consolidate Type Definitions** (Priority 6) - 1 hour
5. ✅ **Centralize Request Parsing** (Priority 4) - 1 hour
6. ✅ **Add Basic Logging** (Priority 7) - 2 hours
7. ✅ **Add React.memo** (Priority 3) - 1-2 hours
8. ✅ **Add Performance Monitoring** (Priority 8) - 1 hour
9. ✅ **Add Component Tests** (Priority 9) - 2-3 hours

**Total Time: ~12-14 hours of focused work**

---

## 🎉 Expected Results After Quick Wins

### Code Quality
- **20% reduction** in code duplication
- **50+ files** with cleaner imports
- **Unified** type definitions
- **Consistent** logging

### Performance
- **30-40% reduction** in unnecessary re-renders
- **Baseline metrics** established
- **Performance bottlenecks** identified

### Maintainability
- **Clear** API structure
- **Documented** constants
- **Reusable** utilities
- **Better** error tracking

### Testing
- **Baseline coverage** established
- **Critical paths** tested
- **Regression** protection

---

## 🚨 Common Pitfalls to Avoid

1. **Don't skip tests** - Always run `npm test` after each change
2. **Don't optimize prematurely** - Measure first, then optimize
3. **Don't break API contracts** - Maintain backwards compatibility
4. **Don't remove console.log everywhere** - Start with critical paths
5. **Don't over-engineer** - Keep solutions simple

---

## 📈 Measuring Success

Track these metrics before and after:

### Before Quick Wins
```bash
# Count duplicated code
npx jscpd src/ api/ --min-tokens 50

# Count console.log usage
grep -r "console\." src/ api/ | wc -l

# Measure bundle size
npm run build && ls -lh dist/

# Count TypeScript errors
npx tsc --noEmit
```

### After Quick Wins
Run the same commands and compare results.

---

## Next Steps After Quick Wins

Once these quick wins are complete:
1. Review the full [REFACTORING_PLAN.md](./REFACTORING_PLAN.md)
2. Prioritize Phase 1 (Architecture Cleanup)
3. Set up proper project tracking
4. Begin systematic refactoring

---

**Good luck! Start with Priority 1 and work your way down the list.**
