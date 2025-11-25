/**
 * Voice state slice - manages voice recording and transcription state.
 *
 * @module state/slices/voice
 */

import {
  createSlice,
  normalizedOps,
  type NormalizedCollection,
} from "../core/createSlice";
import { useStore } from "../../lib/tinyStore";
import { createId } from "../../utils/id";

/**
 * Voice recording status.
 */
export type VoiceStatus = "idle" | "listening" | "transcribing";

/**
 * A single voice transcript entry.
 */
export interface VoiceTranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
}

/**
 * Maximum number of recent transcripts to keep.
 */
const MAX_TRANSCRIPT_ENTRIES = 20;

/**
 * Voice slice state shape.
 */
export interface VoiceSliceState {
  status: VoiceStatus;
  streamId?: string;
  transcripts: NormalizedCollection<VoiceTranscriptEntry>;
}

const initialState: VoiceSliceState = {
  status: "idle",
  streamId: undefined,
  transcripts: { byId: {}, allIds: [] },
};

/**
 * Voice slice with normalized transcript storage.
 */
export const voiceSlice = createSlice({
  name: "voice",
  initialState,
  actions: (setState, getState, store) => ({
    /**
     * Hydrates the store with transcript entries.
     */
    hydrate(entries: VoiceTranscriptEntry[]) {
      setState({ transcripts: normalizedOps.setAll(entries) });
    },

    /**
     * Starts a voice stream with the given ID.
     */
    startVoiceStream(streamId: string) {
      setState({ status: "listening", streamId });
    },

    /**
     * Appends a transcript entry.
     */
    appendTranscript(text: string) {
      const trimmed = typeof text === "string" ? text.trim() : "";
      if (!trimmed) return;

      const entry: VoiceTranscriptEntry = {
        id: createId(),
        text: trimmed,
        timestamp: Date.now(),
      };

      setState((state) => {
        let transcripts = normalizedOps.add(state.transcripts, entry);

        // Keep only the most recent entries
        if (transcripts.allIds.length > MAX_TRANSCRIPT_ENTRIES) {
          const idsToRemove = transcripts.allIds.slice(
            0,
            transcripts.allIds.length - MAX_TRANSCRIPT_ENTRIES
          );
          transcripts = normalizedOps.removeMany(transcripts, idsToRemove);
        }

        return { transcripts };
      });
    },

    /**
     * Sets all transcript entries.
     */
    setTranscripts(entries: VoiceTranscriptEntry[]) {
      setState({ transcripts: normalizedOps.setAll(entries) });
    },

    /**
     * Ends the current voice stream.
     */
    endVoiceStream() {
      setState({ status: "idle", streamId: undefined });
    },

    /**
     * Sets the voice status.
     */
    setStatus(status: VoiceStatus) {
      setState({ status });
    },

    /**
     * Resets all transcripts.
     */
    resetTranscript() {
      setState({ transcripts: { byId: {}, allIds: [] } });
    },

    /**
     * Gets all transcripts as a combined string.
     */
    getCombinedText(): string {
      const transcripts = normalizedOps.selectAll(getState().transcripts);
      return transcripts.map((t) => t.text).join(" ");
    },
  }),
});

// Export actions for backwards compatibility
export const voiceActions = voiceSlice.actions;

// Selector hooks
export const useVoiceStatus = () =>
  useStore(voiceSlice.store, (state) => state.status);

export const useTranscript = () =>
  useStore(voiceSlice.store, (state) =>
    normalizedOps.selectAll(state.transcripts)
  );

export const useVoiceStreamId = () =>
  useStore(voiceSlice.store, (state) => state.streamId);

// Additional selectors
export const useTranscriptText = () =>
  useStore(voiceSlice.store, (state) =>
    normalizedOps
      .selectAll(state.transcripts)
      .map((t) => t.text)
      .join(" ")
  );

export const useTranscriptCount = () =>
  useStore(voiceSlice.store, (state) =>
    normalizedOps.selectCount(state.transcripts)
  );

export const useIsListening = () =>
  useStore(voiceSlice.store, (state) => state.status === "listening");

export const useIsTranscribing = () =>
  useStore(voiceSlice.store, (state) => state.status === "transcribing");

// Export store API for direct access
export const voiceStoreApi = voiceSlice.store;
