import { createStore, useStore } from "../lib/tinyStore.ts";

type VoiceStatus = "idle" | "listening" | "transcribing";

export type PauseReason = "typing" | "user" | "hold";

export interface VoiceTranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
}

type VoiceState = {
  status: VoiceStatus;
  streamId?: string;
  transcripts: VoiceTranscriptEntry[];
  pausedReasons: PauseReason[];
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const voiceStore = createStore<VoiceState>({
  status: "idle",
  streamId: undefined,
  transcripts: [],
  pausedReasons: [],
});

function ensureUniqueReasons(reasons: PauseReason[]): PauseReason[] {
  if (reasons.length <= 1) {
    return reasons;
  }
  const seen = new Set<PauseReason>();
  const next: PauseReason[] = [];
  for (const reason of reasons) {
    if (!seen.has(reason)) {
      seen.add(reason);
      next.push(reason);
    }
  }
  return next;
}

export const voiceActions = {
  hydrate(entries: VoiceTranscriptEntry[]) {
    voiceStore.setState({ transcripts: entries });
  },
  startVoiceStream(streamId: string) {
    voiceStore.setState((state) => ({
      status: "listening",
      streamId,
      pausedReasons: state.pausedReasons.length ? [] : state.pausedReasons,
    }));
  },
  appendTranscript(text: string) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return;
    const entry: VoiceTranscriptEntry = {
      id: createId(),
      text: trimmed,
      timestamp: Date.now(),
    };
    voiceStore.setState((state) => ({
      transcripts: [...state.transcripts, entry].slice(-20),
    }));
  },
  setTranscripts(entries: VoiceTranscriptEntry[]) {
    voiceStore.setState({ transcripts: entries });
  },
  endVoiceStream() {
    voiceStore.setState((state) => ({
      status: "idle",
      streamId: undefined,
      pausedReasons: state.pausedReasons.length ? [] : state.pausedReasons,
    }));
  },
  setStatus(status: VoiceStatus) {
    voiceStore.setState((state) => ({
      status,
      pausedReasons: status === "idle" && state.pausedReasons.length ? [] : state.pausedReasons,
    }));
  },
  resetTranscript() {
    voiceStore.setState({ transcripts: [] });
  },
  pause(reason: PauseReason) {
    voiceStore.setState((state) => {
      if (state.status === "idle") {
        return {};
      }
      if (state.pausedReasons.includes(reason)) {
        return {};
      }
      return {
        pausedReasons: ensureUniqueReasons([...state.pausedReasons, reason]),
      };
    });
  },
  resume(reason: PauseReason) {
    voiceStore.setState((state) => {
      if (!state.pausedReasons.includes(reason)) {
        return {};
      }
      const nextReasons = state.pausedReasons.filter((entry) => entry !== reason);
      return { pausedReasons: nextReasons };
    });
  },
  resumeAll() {
    voiceStore.setState((state) => {
      if (state.pausedReasons.length === 0) {
        return {};
      }
      return { pausedReasons: [] };
    });
  },
};

export const useVoiceStatus = () => useStore(voiceStore, (state) => state.status);
export const useTranscript = () => useStore(voiceStore, (state) => state.transcripts);
export const useVoiceStreamId = () => useStore(voiceStore, (state) => state.streamId);
export const useVoicePaused = () =>
  useStore(voiceStore, (state) => state.pausedReasons.length > 0);

export const voiceStoreApi = voiceStore;
