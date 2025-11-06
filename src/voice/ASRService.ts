import { InputGateway } from "../sync/InputGateway.ts";
import { voiceActions, voiceStoreApi } from "../state/voiceStore.ts";

interface RecognitionHooks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onStop?: () => void;
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

  isActive() {
    const state = voiceStoreApi.getState();
    return state.status === "listening" || state.status === "transcribing";
  }
}

export const asrService = new ASRService();
