/**
 * Draft state slice - manages draft document state.
 *
 * @module state/slices/draft
 */

import { createSlice } from "../core/createSlice";
import { useStore } from "../../lib/tinyStore";

/**
 * Draft document type.
 */
export type DraftDoc = Record<string, unknown> | null;

/**
 * Draft status type.
 */
export type DraftStatus = "idle" | "merging";

/**
 * Auto extract mode type.
 */
export type AutoExtractMode = "off" | "onUpload";

/**
 * Draft slice state shape.
 */
export interface DraftSliceState {
  draft: DraftDoc;
  status: DraftStatus;
  autoExtractMode: AutoExtractMode;
}

const initialState: DraftSliceState = {
  draft: null,
  status: "idle",
  autoExtractMode: "onUpload",
};

/**
 * Draft slice for managing document drafts.
 */
export const draftSlice = createSlice({
  name: "draft",
  initialState,
  actions: (setState, getState, store) => ({
    /**
     * Hydrates the store with a draft document.
     */
    hydrate(draft: DraftDoc) {
      setState({ draft });
    },

    /**
     * Sets the draft document.
     */
    setDraft(draft: DraftDoc) {
      setState({ draft });
    },

    /**
     * Merges a patch into the current draft.
     */
    mergeDraft(patch: Record<string, unknown>) {
      store.batch(() => {
        setState({ status: "merging" });
        setState((state) => ({
          draft: {
            ...(state.draft ?? {}),
            ...patch,
          },
        }));
        setState({ status: "idle" });
      });
    },

    /**
     * Resets the draft to null.
     */
    resetDraft() {
      setState({ draft: null });
    },

    /**
     * Sets the auto extract mode.
     */
    setAutoExtractMode(mode: AutoExtractMode) {
      setState({ autoExtractMode: mode });
    },

    /**
     * Sets the draft status.
     */
    setStatus(status: DraftStatus) {
      setState({ status });
    },

    /**
     * Gets a specific field from the draft.
     */
    getField<T = unknown>(fieldId: string): T | undefined {
      const draft = getState().draft;
      return draft ? (draft[fieldId] as T) : undefined;
    },

    /**
     * Sets a specific field in the draft.
     */
    setField(fieldId: string, value: unknown) {
      setState((state) => ({
        draft: {
          ...(state.draft ?? {}),
          [fieldId]: value,
        },
      }));
    },

    /**
     * Removes a specific field from the draft.
     */
    removeField(fieldId: string) {
      setState((state) => {
        if (!state.draft || !(fieldId in state.draft)) {
          return {};
        }
        const { [fieldId]: removed, ...rest } = state.draft;
        return { draft: Object.keys(rest).length > 0 ? rest : null };
      });
    },
  }),
});

// Export actions for backwards compatibility
export const draftActions = draftSlice.actions;

// Selector hooks
export const useDraft = () =>
  useStore(draftSlice.store, (state) => state.draft);

export const useDraftStatus = () =>
  useStore(draftSlice.store, (state) => state.status);

export const useAutoExtractMode = () =>
  useStore(draftSlice.store, (state) => state.autoExtractMode);

// Additional selectors
export const useDraftField = <T = unknown>(fieldId: string) =>
  useStore(draftSlice.store, (state) =>
    state.draft ? (state.draft[fieldId] as T) : undefined
  );

export const useDraftFieldCount = () =>
  useStore(draftSlice.store, (state) =>
    state.draft ? Object.keys(state.draft).length : 0
  );

export const useIsDraftEmpty = () =>
  useStore(draftSlice.store, (state) =>
    !state.draft || Object.keys(state.draft).length === 0
  );

export const useIsMerging = () =>
  useStore(draftSlice.store, (state) => state.status === "merging");

// Export store API for direct access
export const draftStoreApi = draftSlice.store;
