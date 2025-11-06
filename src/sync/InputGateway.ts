import { ingestInput, submitFinalInput as finalizeTurn, syncStoreApi } from "../state/syncStore.ts";
import type { NormalizedInputEvent } from "../types/sync.ts";

export type InputChannel = "typing" | "voice";

interface ChannelState {
  turnId?: string;
  lastContent?: string;
  lastTimestamp?: number;
}

interface EmitOptions {
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

interface VoiceOptions extends EmitOptions {
  streamId?: string;
}

const channelState: Record<InputChannel, ChannelState> = {
  typing: {},
  voice: {},
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureTurnId(channel: InputChannel) {
  if (!channelState[channel].turnId) {
    channelState[channel].turnId = `${channel}-${createId()}`;
  }
  return channelState[channel].turnId as string;
}

function clearChannel(channel: InputChannel) {
  channelState[channel] = {};
}

function finalizeChannel(channel: InputChannel, timestamp = Date.now()) {
  const turnId = channelState[channel].turnId;
  if (!turnId) {
    return;
  }
  finalizeTurn(turnId, timestamp);
  clearChannel(channel);
}

function ensurePolicyCompliance(channel: InputChannel, timestamp: number) {
  const { policy } = syncStoreApi.getState();
  if (policy !== "exclusive") {
    return;
  }

  const otherChannel: InputChannel = channel === "typing" ? "voice" : "typing";
  if (channelState[otherChannel].turnId) {
    finalizeChannel(otherChannel, timestamp);
  }
}

function buildMetadata(channel: InputChannel, metadata?: Record<string, unknown>) {
  const base = { channel } satisfies Record<string, unknown>;
  if (!metadata) {
    return base;
  }
  return { ...base, ...metadata };
}

function emitEvent(
  channel: InputChannel,
  content: string,
  stage: NormalizedInputEvent["stage"],
  { timestamp = Date.now(), metadata }: EmitOptions = {},
) {
  ensurePolicyCompliance(channel, timestamp);
  const turnId = ensureTurnId(channel);

  const event: NormalizedInputEvent = {
    id: createId(),
    turnId,
    source: "user",
    stage,
    content,
    createdAt: timestamp,
    metadata: buildMetadata(channel, metadata),
  };

  if (stage === "draft" && channelState[channel].lastContent === content) {
    return;
  }

  ingestInput(event);
  channelState[channel].lastContent = content;
  channelState[channel].lastTimestamp = timestamp;

  if (stage === "final") {
    finalizeChannel(channel, timestamp);
  }
}

export const InputGateway = {
  onTypingChange(content: string, options?: EmitOptions) {
    const timestamp = options?.timestamp ?? Date.now();
    emitEvent("typing", content, "draft", { ...options, timestamp });
  },
  onTypingSubmit(content?: string, options?: EmitOptions) {
    const finalContent = content ?? channelState.typing.lastContent ?? "";
    const timestamp = options?.timestamp ?? Date.now();
    emitEvent("typing", finalContent, "final", { ...options, timestamp });
  },
  onVoicePartial(content: string, options?: VoiceOptions) {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    const metadata = { ...options?.metadata, streamId: options?.streamId, interim: true };
    emitEvent("voice", trimmed, "draft", { ...options, metadata });
  },
  onVoiceFinal(content: string, options?: VoiceOptions) {
    const trimmed = content.trim();
    if (!trimmed) {
      finalizeChannel("voice", options?.timestamp ?? Date.now());
      return;
    }
    const metadata = { ...options?.metadata, streamId: options?.streamId, interim: false };
    emitEvent("voice", trimmed, "final", { ...options, metadata });
  },
  submitFinalInput(channel: InputChannel, timestamp?: number) {
    finalizeChannel(channel, timestamp ?? Date.now());
  },
  reset(channel: InputChannel) {
    clearChannel(channel);
  },
  getActiveTurnId(channel: InputChannel) {
    return channelState[channel].turnId;
  },
};

export type InputGatewayType = typeof InputGateway;
