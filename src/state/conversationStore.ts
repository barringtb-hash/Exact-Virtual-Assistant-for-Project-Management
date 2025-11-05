import { createStore, useStore } from "../lib/tinyStore.ts";
import type { CharterFormSchema } from "../lib/charter/formSchema.ts";
import {
  applyConversationEvent,
  createConversationState,
  getConversationSnapshot,
  mergeConversationSnapshot,
  type ConversationAction,
  type ConversationEvent,
  type ConversationMachineOptions,
  type ConversationState,
} from "./conversationMachine.ts";

interface ConversationStoreState {
  schema: CharterFormSchema | null;
  state: ConversationState | null;
  lastActions: ConversationAction[];
}

const conversationStore = createStore<ConversationStoreState>({
  schema: null,
  state: null,
  lastActions: [],
});

let machineOptions: ConversationMachineOptions = {};

function schemasMatch(a: CharterFormSchema | null, b: CharterFormSchema | null): boolean {
  if (!a || !b) return false;
  if (a.document_type !== b.document_type) return false;
  if (a.version !== b.version) return false;
  if (a.fields.length !== b.fields.length) return false;
  return a.fields.every((field, index) => field.id === b.fields[index]?.id);
}

function dispatchEvent(event: ConversationEvent): ConversationAction[] {
  const { schema, state } = conversationStore.getState();
  if (!schema || !state) {
    return [];
  }
  const { state: nextState, actions } = applyConversationEvent(
    schema,
    state,
    event,
    machineOptions,
  );
  conversationStore.setState({ state: nextState, lastActions: actions });
  return actions;
}

function requireCurrentField(): { fieldId: string | null; state: ConversationState | null } {
  const { state } = conversationStore.getState();
  return { fieldId: state?.currentFieldId ?? null, state: state ?? null };
}

export const conversationActions = {
  reset() {
    conversationStore.setState({ schema: null, state: null, lastActions: [] });
  },
  ensureSession(schema: CharterFormSchema) {
    const { schema: existingSchema, state } = conversationStore.getState();
    if (state && schemasMatch(existingSchema, schema)) {
      return state;
    }
    const initialState = createConversationState(schema);
    conversationStore.setState({ schema, state: initialState, lastActions: [] });
    return initialState;
  },
  hydrate(schema: CharterFormSchema, snapshot: ConversationState) {
    const merged = mergeConversationSnapshot(schema, snapshot);
    conversationStore.setState({ schema, state: merged, lastActions: [] });
    return merged;
  },
  dispatch(event: ConversationEvent) {
    return dispatchEvent(event);
  },
  capture(value: string) {
    const { fieldId } = requireCurrentField();
    if (!fieldId) {
      return [];
    }
    const allActions = [];

    // Dispatch CAPTURE to store the value
    const captureActions = dispatchEvent({ type: "CAPTURE", fieldId, value });
    allActions.push(...captureActions);

    // Dispatch VALIDATE to check the value
    const validationActions = dispatchEvent({ type: "VALIDATE", fieldId });
    allActions.push(...validationActions);

    // Check if validation succeeded (state.step === "CONFIRM")
    const currentState = conversationStore.getState().state;
    if (currentState?.step === "CONFIRM") {
      // Auto-confirm the field
      const confirmActions = dispatchEvent({ type: "CONFIRM", fieldId });
      allActions.push(...confirmActions);

      // Auto-advance to next field
      const nextActions = dispatchEvent({ type: "NEXT_FIELD" });
      allActions.push(...nextActions);
    }

    return allActions;
  },
  validate(fieldId?: string) {
    const targetFieldId = fieldId ?? requireCurrentField().fieldId;
    if (!targetFieldId) {
      return [];
    }
    return dispatchEvent({ type: "VALIDATE", fieldId: targetFieldId });
  },
  confirm(fieldId?: string) {
    const targetFieldId = fieldId ?? requireCurrentField().fieldId;
    if (!targetFieldId) {
      return [];
    }
    return dispatchEvent({ type: "CONFIRM", fieldId: targetFieldId });
  },
  nextField() {
    return dispatchEvent({ type: "NEXT_FIELD" });
  },
  back() {
    return dispatchEvent({ type: "BACK" });
  },
  edit(fieldId: string) {
    return dispatchEvent({ type: "EDIT", fieldId });
  },
  skip(reason?: string) {
    const { fieldId } = requireCurrentField();
    if (!fieldId) {
      return [];
    }
    return dispatchEvent({ type: "SKIP", fieldId, reason });
  },
  preview() {
    return dispatchEvent({ type: "PREVIEW" });
  },
  endReview() {
    return dispatchEvent({ type: "END_REVIEW" });
  },
  finalize() {
    return dispatchEvent({ type: "FINALIZE" });
  },
};

export type ConversationSnapshot = ConversationState;

export function serializeConversationState(): ConversationSnapshot | null {
  const { state } = conversationStore.getState();
  if (!state) {
    return null;
  }
  return getConversationSnapshot(state);
}

export function getConversationStateSnapshot(): ConversationState | null {
  const { state } = conversationStore.getState();
  return state ? getConversationSnapshot(state) : null;
}

export function hydrateConversationState(
  schema: CharterFormSchema,
  snapshot: ConversationSnapshot
): ConversationState {
  return conversationActions.hydrate(schema, snapshot);
}

export const useConversationSchema = () => useStore(conversationStore, (store) => store.schema);
export const useConversationState = () => useStore(conversationStore, (store) => store.state);
export const useConversationActions = () => conversationActions;
export const useConversationLastActions = () =>
  useStore(conversationStore, (store) => store.lastActions);

export const conversationStoreApi = conversationStore;

export function configureConversationMachineOptions(
  options: ConversationMachineOptions | null,
) {
  machineOptions = options ?? {};
}
