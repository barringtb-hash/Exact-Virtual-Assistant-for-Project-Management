import { createStore, useStore } from "../lib/tinyStore.ts";

export type DraftDoc = Record<string, unknown> | null;

type DraftState = {
  draft: DraftDoc;
  status: "idle" | "merging";
  autoExtractMode: "off" | "onUpload";
};

const draftStore = createStore<DraftState>({
  draft: null,
  status: "idle",
  autoExtractMode: "onUpload",
});

export const draftActions = {
  hydrate(draft: DraftDoc) {
    draftStore.setState({ draft });
  },
  setDraft(draft: DraftDoc) {
    draftStore.setState({ draft });
  },
  mergeDraft(patch: Record<string, unknown>) {
    draftStore.setState({ status: "merging" });
    draftStore.setState((state) => ({
      draft: {
        ...(state.draft ?? {}),
        ...patch,
      },
    }));
    draftStore.setState({ status: "idle" });
  },
  resetDraft() {
    draftStore.setState({ draft: null });
  },
  setAutoExtractMode(mode: DraftState["autoExtractMode"]) {
    draftStore.setState({ autoExtractMode: mode });
  },
  setStatus(status: DraftState["status"]) {
    draftStore.setState({ status });
  },
};

export const useDraft = () => useStore(draftStore, (state) => state.draft);
export const useDraftStatus = () => useStore(draftStore, (state) => state.status);
export const useAutoExtractMode = () => useStore(draftStore, (state) => state.autoExtractMode);

export const draftStoreApi = draftStore;
