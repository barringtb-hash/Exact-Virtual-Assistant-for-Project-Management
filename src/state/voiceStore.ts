import { createStore, useStore } from "../lib/tinyStore.ts";
import { createId } from "../utils/id.js";

type VoiceStatus = "idle" | "listening" | "transcribing";

export interface VoiceTranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
}

type VoiceState = {
  status: VoiceStatus;
  streamId?: string;
  transcripts: VoiceTranscriptEntry[];
};

const voiceStore = createStore<VoiceState>({
  status: "idle",
  streamId: undefined,
  transcripts: [],
});

export const voiceActions = {
  hydrate(entries: VoiceTranscriptEntry[]) {
    voiceStore.setState({ transcripts: entries });
  },
  startVoiceStream(streamId: string) {
    voiceStore.setState({ status: "listening", streamId });
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
    voiceStore.setState({ status: "idle", streamId: undefined });
  },
  setStatus(status: VoiceStatus) {
    voiceStore.setState({ status });
  },
  resetTranscript() {
    voiceStore.setState({ transcripts: [] });
  },
};

export const useVoiceStatus = () => useStore(voiceStore, (state) => state.status);
export const useTranscript = () => useStore(voiceStore, (state) => state.transcripts);
export const useVoiceStreamId = () => useStore(voiceStore, (state) => state.streamId);

export const voiceStoreApi = voiceStore;
