import { createStore, useStore } from "../lib/tinyStore.ts";

type VoiceStatus = "idle" | "listening" | "transcribing";

export interface VoiceTranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
}

type VoiceState = {
  status: VoiceStatus;
  isMicActive: boolean;
  streamId?: string;
  transcripts: VoiceTranscriptEntry[];
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const voiceStore = createStore<VoiceState>({
  status: "idle",
  isMicActive: false,
  streamId: undefined,
  transcripts: [],
});

export const voiceActions = {
  hydrate(entries: VoiceTranscriptEntry[]) {
    voiceStore.setState({ transcripts: entries });
  },
  startVoiceStream(streamId: string) {
    voiceStore.setState({ status: "listening", isMicActive: true, streamId });
  },
  appendTranscript(text: string) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) return;
    const entry: VoiceTranscriptEntry = {
      id: createId(),
      text: trimmed,
      timestamp: Date.now(),
    };
    voiceStore.setState((state) => ({ transcripts: [...state.transcripts, entry].slice(-20) }));
  },
  setTranscripts(entries: VoiceTranscriptEntry[]) {
    voiceStore.setState({ transcripts: entries });
  },
  endVoiceStream() {
    voiceStore.setState({ status: "idle", isMicActive: false, streamId: undefined });
  },
  setStatus(status: VoiceStatus) {
    voiceStore.setState({ status, isMicActive: status === "listening" });
  },
  setMicActive(isMicActive: boolean) {
    voiceStore.setState({ isMicActive });
  },
  resetTranscript() {
    voiceStore.setState({ transcripts: [] });
  },
};

export const useVoiceStatus = () => useStore(voiceStore, (state) => state.status);
export const useIsMicActive = () => useStore(voiceStore, (state) => state.isMicActive);
export const useTranscript = () => useStore(voiceStore, (state) => state.transcripts);
export const useVoiceStreamId = () => useStore(voiceStore, (state) => state.streamId);

export const voiceStoreApi = voiceStore;
