/**
 * Voice charter state slice - manages voice charter session mode.
 *
 * @module state/slices/voiceCharter
 */

import { createSlice } from "../core/createSlice";
import { useStore } from "../../lib/tinyStore";

/**
 * Voice charter mode.
 */
export type VoiceCharterMode = "inactive" | "active" | "completed";

/**
 * Voice charter slice state shape.
 */
export interface VoiceCharterSliceState {
  /** Current mode of the voice charter session */
  mode: VoiceCharterMode;
  /** Whether the AI is currently speaking */
  aiSpeaking: boolean;
  /** Timestamp when voice charter was started */
  startedAt: number | null;
  /** Timestamp when voice charter was completed */
  completedAt: number | null;
  /** Captured field values from voice session */
  capturedValues: Record<string, string>;
}

const initialState: VoiceCharterSliceState = {
  mode: "inactive",
  aiSpeaking: false,
  startedAt: null,
  completedAt: null,
  capturedValues: {},
};

/**
 * Voice charter slice.
 */
export const voiceCharterSlice = createSlice({
  name: "voiceCharter",
  initialState,
  actions: (setState, getState) => ({
    /**
     * Start voice charter mode.
     */
    start() {
      setState({
        mode: "active",
        aiSpeaking: false,
        startedAt: Date.now(),
        completedAt: null,
        capturedValues: {},
      });
    },

    /**
     * Set AI speaking state.
     */
    setAiSpeaking(speaking: boolean) {
      setState({ aiSpeaking: speaking });
    },

    /**
     * Update captured values.
     */
    setCapturedValues(values: Record<string, string>) {
      setState({ capturedValues: values });
    },

    /**
     * Merge new captured values with existing ones.
     */
    mergeCapturedValues(values: Record<string, string>) {
      const current = getState().capturedValues;
      setState({
        capturedValues: { ...current, ...values },
      });
    },

    /**
     * Complete voice charter mode.
     */
    complete(values: Record<string, string>) {
      setState({
        mode: "completed",
        completedAt: Date.now(),
        capturedValues: values,
      });
    },

    /**
     * Exit voice charter mode (reset to inactive).
     */
    exit() {
      setState({
        mode: "inactive",
        aiSpeaking: false,
        startedAt: null,
        completedAt: null,
      });
    },

    /**
     * Reset to initial state.
     */
    reset() {
      setState(initialState);
    },
  }),
});

// Export actions
export const voiceCharterActions = voiceCharterSlice.actions;

// Selector hooks
export const useVoiceCharterMode = () =>
  useStore(voiceCharterSlice.store, (state) => state.mode);

export const useVoiceCharterActive = () =>
  useStore(voiceCharterSlice.store, (state) => state.mode === "active");

export const useAiSpeaking = () =>
  useStore(voiceCharterSlice.store, (state) => state.aiSpeaking);

export const useVoiceCharterCapturedValues = () =>
  useStore(voiceCharterSlice.store, (state) => state.capturedValues);

export const useVoiceCharterState = () =>
  useStore(voiceCharterSlice.store, (state) => state);

// Store API for direct access
export const voiceCharterStoreApi = voiceCharterSlice.store;
