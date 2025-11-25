# State Management Strategy

## Decision: Custom Store Pattern (tinyStore)

**Date:** 2025-11-24
**Status:** Adopted

## Overview

This application standardizes on the custom `tinyStore` pattern for all state management needs.

## Rationale

1. **Already extensively used** - 5 of 7 stores already use this pattern
2. **Better performance than Context** - Avoids React re-render cascade
3. **More control over updates** - Batching support, selective subscriptions
4. **Easier to optimize** - Selector-based subscriptions prevent unnecessary re-renders
5. **Simpler mental model** - No provider hierarchy needed
6. **Lightweight** - No external dependencies required

## Architecture

```
/src/state/
├── index.ts              # Unified store API and exports
├── README.md             # This document
├── /core/
│   └── createSlice.ts    # Slice factory with standard patterns
├── /slices/
│   ├── chat.ts           # Chat messages and streaming state
│   ├── voice.ts          # Voice recording and transcription
│   ├── draft.ts          # Draft document state
│   ├── sync.ts           # Document sync and patches
│   ├── conversation.ts   # Charter conversation flow
│   ├── docType.ts        # Document type selection
│   └── docTemplate.ts    # Template loading and caching
├── /selectors/
│   ├── index.ts          # All selector exports
│   └── derived.ts        # Cross-slice derived selectors
├── /actions/
│   └── index.ts          # Cross-slice coordinated actions
└── /persistence/
    ├── middleware.ts     # Persistence middleware
    ├── storage.ts        # Storage abstraction
    └── migrations.ts     # Schema migration support
```

## Core Principles

### 1. Single Source of Truth
Each domain has exactly one slice managing its state.

### 2. Normalized State
Entity collections use normalized structure:
```typescript
{
  byId: { [id: string]: Entity },
  allIds: string[]
}
```

### 3. Selector-Based Subscriptions
Components subscribe via selectors to minimize re-renders:
```typescript
const userName = useStore(userStore, (state) => state.name);
```

### 4. Batched Updates
Multiple state changes can be batched:
```typescript
store.batch(() => {
  actions.setA(1);
  actions.setB(2);
});
```

### 5. Immutable Updates
All state updates must be immutable. Use `immer` for complex updates:
```typescript
import { produce } from "immer";
store.setState((state) => produce(state, (draft) => {
  draft.items.push(newItem);
}));
```

## Slice Structure

Each slice follows this pattern:

```typescript
// /src/state/slices/example.ts
import { createStore, useStore } from "../../lib/tinyStore";

// 1. Types
interface ExampleState {
  items: { byId: Record<string, Item>; allIds: string[] };
  status: "idle" | "loading" | "error";
}

// 2. Initial State
const initialState: ExampleState = {
  items: { byId: {}, allIds: [] },
  status: "idle",
};

// 3. Store
const store = createStore(initialState);

// 4. Actions
export const exampleActions = {
  addItem(item: Item) {
    store.setState((state) => ({
      items: {
        byId: { ...state.items.byId, [item.id]: item },
        allIds: [...state.items.allIds, item.id],
      },
    }));
  },
  reset() {
    store.setState(initialState, true);
  },
};

// 5. Selectors
export const useExampleItems = () =>
  useStore(store, (state) => state.items.allIds.map((id) => state.items.byId[id]));

export const useExampleStatus = () =>
  useStore(store, (state) => state.status);

// 6. API Export
export const exampleStoreApi = store;
```

## Migration from Context

When migrating Context-based state:

1. Create a new slice following the pattern above
2. Export the same hook names for backwards compatibility
3. Update providers to use the store-based implementation
4. Remove Context providers once migration is complete

## Cross-Slice Actions

For actions that affect multiple slices, use the unified action system:

```typescript
// /src/state/actions/index.ts
import { chatActions } from "../slices/chat";
import { voiceActions } from "../slices/voice";

export const coordinatedActions = {
  async submitVoiceToChat() {
    const transcript = voiceStoreApi.getState().transcripts;
    chatActions.pushUser(transcript.map((t) => t.text).join(" "));
    voiceActions.resetTranscript();
  },
};
```

## Testing

Stores can be tested by:

1. **Direct state manipulation:**
```typescript
store.setState(testState, true);
expect(store.getState()).toEqual(expectedState);
```

2. **Action testing:**
```typescript
actions.addItem(testItem);
expect(store.getState().items.byId[testItem.id]).toEqual(testItem);
```

3. **Reset between tests:**
```typescript
beforeEach(() => {
  resetStore();
});
```

## Performance Considerations

1. **Use selectors** - Always use selectors with `useStore` to minimize re-renders
2. **Batch updates** - Use `store.batch()` for multiple synchronous updates
3. **Normalize data** - Use normalized state to enable efficient updates
4. **Memoize selectors** - Use `useMemo` for derived data in components
