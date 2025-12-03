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
 * Field tracking event types for debugging desync issues.
 */
export type FieldTrackingEventType =
  | "ai_asked"          // AI started asking about a field
  | "transcript_received" // Raw transcript received
  | "value_captured"    // Value was captured for a field
  | "value_synced"      // Value was synced to draft/conversation store
  | "field_navigated"   // User navigated to a different field
  | "extraction_populated"; // Field was populated from document extraction

/**
 * A single field tracking log entry.
 */
export interface FieldTrackingEntry {
  id: string;
  timestamp: number;
  eventType: FieldTrackingEventType;
  /** The field the AI was asking about at this moment */
  askingFieldId: string | null;
  /** The field that received/will receive the value (may differ from askingFieldId in desync) */
  targetFieldId: string | null;
  /** The transcript text (for transcript_received events) */
  transcript?: string;
  /** The captured/synced value */
  value?: string;
  /** Source of the transcript (ai or user) */
  source?: "ai" | "user" | "unknown";
  /** Additional context for debugging */
  metadata?: Record<string, unknown>;
}

/**
 * Maximum number of field tracking entries to retain.
 */
const MAX_FIELD_TRACKING_ENTRIES = 200;

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
  /** Field tracking log for debugging desync issues */
  fieldTrackingLog: FieldTrackingEntry[];
  /** Current field the AI is asking about (mirrors VoiceCharterService.askingFieldId) */
  currentAskingFieldId: string | null;
}

const initialState: VoiceCharterSliceState = {
  mode: "inactive",
  aiSpeaking: false,
  startedAt: null,
  completedAt: null,
  capturedValues: {},
  fieldTrackingLog: [],
  currentAskingFieldId: null,
};

/**
 * Generate a unique ID for tracking entries.
 */
let trackingEntryCounter = 0;
function generateTrackingId(): string {
  return `ft_${Date.now()}_${++trackingEntryCounter}`;
}

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
      trackingEntryCounter = 0; // Reset counter for new session
      setState({
        mode: "active",
        aiSpeaking: false,
        startedAt: Date.now(),
        completedAt: null,
        capturedValues: {},
        fieldTrackingLog: [],
        currentAskingFieldId: null,
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
      trackingEntryCounter = 0;
      setState(initialState);
    },

    /**
     * Set the current field being asked about by the AI.
     */
    setAskingField(fieldId: string | null) {
      const state = getState();
      const prevFieldId = state.currentAskingFieldId;

      // Only log if field actually changed
      if (prevFieldId !== fieldId) {
        const entry: FieldTrackingEntry = {
          id: generateTrackingId(),
          timestamp: Date.now(),
          eventType: "ai_asked",
          askingFieldId: fieldId,
          targetFieldId: fieldId,
          metadata: { previousFieldId: prevFieldId },
        };

        // Console log for debugging
        console.log(
          "%c[FieldTracking] AI_ASKED",
          "color: #4CAF50; font-weight: bold",
          { fieldId, previousFieldId: prevFieldId, entryId: entry.id }
        );

        const newLog = [...state.fieldTrackingLog, entry].slice(-MAX_FIELD_TRACKING_ENTRIES);
        setState({
          currentAskingFieldId: fieldId,
          fieldTrackingLog: newLog,
        });
      }
    },

    /**
     * Log a transcript received event.
     */
    logTranscriptReceived(params: {
      transcript: string;
      askingFieldId: string | null;
      targetFieldId: string | null;
      source: "ai" | "user" | "unknown";
      metadata?: Record<string, unknown>;
    }) {
      const state = getState();
      const entry: FieldTrackingEntry = {
        id: generateTrackingId(),
        timestamp: Date.now(),
        eventType: "transcript_received",
        askingFieldId: params.askingFieldId,
        targetFieldId: params.targetFieldId,
        transcript: params.transcript.substring(0, 200), // Truncate for storage
        source: params.source,
        metadata: params.metadata,
      };

      // Console log for debugging
      const sourceColor = params.source === "ai" ? "#9C27B0" : params.source === "user" ? "#2196F3" : "#607D8B";
      console.log(
        `%c[FieldTracking] TRANSCRIPT_RECEIVED (${params.source})`,
        `color: ${sourceColor}; font-weight: bold`,
        {
          transcript: params.transcript.substring(0, 50) + (params.transcript.length > 50 ? "..." : ""),
          askingFieldId: params.askingFieldId,
          targetFieldId: params.targetFieldId,
          entryId: entry.id,
        }
      );

      const newLog = [...state.fieldTrackingLog, entry].slice(-MAX_FIELD_TRACKING_ENTRIES);
      setState({ fieldTrackingLog: newLog });
    },

    /**
     * Log a value captured event.
     */
    logValueCaptured(params: {
      fieldId: string;
      value: string;
      askingFieldId: string | null;
      source?: "ai" | "user" | "unknown";
      metadata?: Record<string, unknown>;
    }) {
      const state = getState();
      const potentialDesync = params.askingFieldId !== null && params.askingFieldId !== params.fieldId;
      const entry: FieldTrackingEntry = {
        id: generateTrackingId(),
        timestamp: Date.now(),
        eventType: "value_captured",
        askingFieldId: params.askingFieldId,
        targetFieldId: params.fieldId,
        value: params.value.substring(0, 200), // Truncate for storage
        source: params.source,
        metadata: {
          ...params.metadata,
          // Flag potential desync for easy debugging
          potentialDesync,
        },
      };

      // Console log for debugging - highlight desyncs in red
      const logColor = potentialDesync ? "#F44336" : "#FF9800";
      const logLabel = potentialDesync
        ? "[FieldTracking] VALUE_CAPTURED ⚠️ DESYNC DETECTED"
        : "[FieldTracking] VALUE_CAPTURED";
      console.log(
        `%c${logLabel}`,
        `color: ${logColor}; font-weight: bold`,
        {
          targetFieldId: params.fieldId,
          askingFieldId: params.askingFieldId,
          value: params.value.substring(0, 30) + (params.value.length > 30 ? "..." : ""),
          potentialDesync,
          entryId: entry.id,
        }
      );

      const newLog = [...state.fieldTrackingLog, entry].slice(-MAX_FIELD_TRACKING_ENTRIES);
      setState({ fieldTrackingLog: newLog });
    },

    /**
     * Log a value synced event.
     */
    logValueSynced(params: {
      fieldId: string;
      value: string;
      askingFieldId: string | null;
      metadata?: Record<string, unknown>;
    }) {
      const state = getState();
      const entry: FieldTrackingEntry = {
        id: generateTrackingId(),
        timestamp: Date.now(),
        eventType: "value_synced",
        askingFieldId: params.askingFieldId,
        targetFieldId: params.fieldId,
        value: params.value.substring(0, 200),
        metadata: params.metadata,
      };

      // Console log for debugging
      console.log(
        "%c[FieldTracking] VALUE_SYNCED",
        "color: #00BCD4; font-weight: bold",
        {
          fieldId: params.fieldId,
          askingFieldId: params.askingFieldId,
          value: params.value.substring(0, 30) + (params.value.length > 30 ? "..." : ""),
          entryId: entry.id,
        }
      );

      const newLog = [...state.fieldTrackingLog, entry].slice(-MAX_FIELD_TRACKING_ENTRIES);
      setState({ fieldTrackingLog: newLog });
    },

    /**
     * Log a field navigation event.
     */
    logFieldNavigated(params: {
      fromFieldId: string | null;
      toFieldId: string;
      direction: "next" | "previous" | "jump";
      metadata?: Record<string, unknown>;
    }) {
      const state = getState();
      const entry: FieldTrackingEntry = {
        id: generateTrackingId(),
        timestamp: Date.now(),
        eventType: "field_navigated",
        askingFieldId: params.fromFieldId,
        targetFieldId: params.toFieldId,
        metadata: { direction: params.direction, ...params.metadata },
      };

      // Console log for debugging
      const directionIcon = params.direction === "next" ? "→" : params.direction === "previous" ? "←" : "↗";
      console.log(
        `%c[FieldTracking] FIELD_NAVIGATED ${directionIcon}`,
        "color: #673AB7; font-weight: bold",
        {
          direction: params.direction,
          fromFieldId: params.fromFieldId,
          toFieldId: params.toFieldId,
          entryId: entry.id,
        }
      );

      const newLog = [...state.fieldTrackingLog, entry].slice(-MAX_FIELD_TRACKING_ENTRIES);
      setState({
        currentAskingFieldId: params.toFieldId,
        fieldTrackingLog: newLog,
      });
    },

    /**
     * Log an extraction populated event.
     */
    logExtractionPopulated(params: {
      fieldId: string;
      value: string;
      metadata?: Record<string, unknown>;
    }) {
      const state = getState();
      const entry: FieldTrackingEntry = {
        id: generateTrackingId(),
        timestamp: Date.now(),
        eventType: "extraction_populated",
        askingFieldId: state.currentAskingFieldId,
        targetFieldId: params.fieldId,
        value: params.value.substring(0, 200),
        metadata: params.metadata,
      };

      // Console log for debugging
      console.log(
        "%c[FieldTracking] EXTRACTION_POPULATED",
        "color: #8BC34A; font-weight: bold",
        {
          fieldId: params.fieldId,
          value: params.value.substring(0, 30) + (params.value.length > 30 ? "..." : ""),
          entryId: entry.id,
        }
      );

      const newLog = [...state.fieldTrackingLog, entry].slice(-MAX_FIELD_TRACKING_ENTRIES);
      setState({ fieldTrackingLog: newLog });
    },

    /**
     * Get the full field tracking log.
     */
    getFieldTrackingLog(): FieldTrackingEntry[] {
      return getState().fieldTrackingLog;
    },

    /**
     * Get entries that may indicate a desync (askingFieldId !== targetFieldId).
     */
    getPotentialDesyncs(): FieldTrackingEntry[] {
      return getState().fieldTrackingLog.filter(
        (entry) =>
          entry.eventType === "value_captured" &&
          entry.metadata?.potentialDesync === true
      );
    },

    /**
     * Clear the field tracking log.
     */
    clearFieldTrackingLog() {
      setState({ fieldTrackingLog: [] });
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

// Field tracking selector hooks
export const useFieldTrackingLog = () =>
  useStore(voiceCharterSlice.store, (state) => state.fieldTrackingLog);

export const useCurrentAskingFieldId = () =>
  useStore(voiceCharterSlice.store, (state) => state.currentAskingFieldId);

export const usePotentialDesyncs = () =>
  useStore(voiceCharterSlice.store, (state) =>
    state.fieldTrackingLog.filter(
      (entry) =>
        entry.eventType === "value_captured" &&
        entry.metadata?.potentialDesync === true
    )
  );

export const useRecentFieldEvents = (fieldId: string) =>
  useStore(voiceCharterSlice.store, (state) =>
    state.fieldTrackingLog.filter(
      (entry) => entry.targetFieldId === fieldId || entry.askingFieldId === fieldId
    ).slice(-10)
  );

// Store API for direct access
export const voiceCharterStoreApi = voiceCharterSlice.store;
