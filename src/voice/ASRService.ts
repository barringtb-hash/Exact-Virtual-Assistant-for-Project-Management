import { InputGateway } from "../sync/InputGateway.ts";
import { voiceActions, voiceStoreApi } from "../state/voiceStore.ts";

interface RecognitionHooks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onStop?: () => void;
  onError?: (error: unknown) => void;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ASRService {
  private streamId: string | undefined;
  private hooks: RecognitionHooks = {};

  registerHooks(hooks: RecognitionHooks) {
    this.hooks = hooks;
  }

  start() {
    if (this.streamId) {
      return this.streamId;
    }
    try {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        throw new Error("Microphone access is not supported in this environment.");
      }
      if (typeof RTCPeerConnection === "undefined") {
        throw new Error("Realtime voice requires WebRTC support.");
      }
    } catch (error) {
      this.handleError(error);
      return undefined;
    }
    const nextStreamId = createId();
    this.streamId = nextStreamId;
    InputGateway.submitFinalInput("typing");
    voiceActions.resetTranscript();
    voiceActions.startVoiceStream(nextStreamId);
    voiceActions.setStatus("listening");
    return nextStreamId;
  }

  receivePartial(text: string) {
    const streamId = this.streamId ?? this.start();
    if (!streamId) {
      return;
    }
    voiceActions.setStatus("listening");
    voiceActions.appendTranscript(text);
    InputGateway.onVoicePartial(text, { streamId });
    this.hooks.onPartial?.(text);
  }

  receiveFinal(text: string) {
    if (!this.streamId) {
      return;
    }
    const streamId = this.streamId;
    voiceActions.setStatus("transcribing");
    voiceActions.appendTranscript(text);
    InputGateway.onVoiceFinal(text, { streamId });
    InputGateway.submitFinalInput("voice");
    this.stop();
    this.hooks.onFinal?.(text);
  }

  stop() {
    if (!this.streamId) {
      return;
    }
    InputGateway.submitFinalInput("voice");
    voiceActions.endVoiceStream();
    voiceActions.setStatus("idle");
    this.streamId = undefined;
    this.hooks.onStop?.();
  }

  private handleError(error: unknown) {
    this.streamId = undefined;
    try {
      InputGateway.submitFinalInput("voice");
    } catch {
      // ignore
    }
    voiceActions.setStatus("idle");
    this.hooks.onError?.(error);
  }

  isActive() {
    const state = voiceStoreApi.getState();
    return state.status === "listening" || state.status === "transcribing";
  }
}

export const asrService = new ASRService();
