/**
 * OpenAI Realtime API event helpers for sending messages via data channel.
 *
 * @module voice/realtimeEvents
 */

/**
 * Session configuration for voice modality.
 */
export interface SessionConfig {
  instructions: string;
  voice?: string;
  inputAudioTranscription?: {
    model?: string;
  };
  turnDetection?: {
    type: "server_vad";
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  } | null;
}

/**
 * Creates a session.update event to configure the Realtime session.
 */
export function createSessionUpdateEvent(config: SessionConfig): string {
  return JSON.stringify({
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: config.instructions,
      voice: config.voice ?? "shimmer",
      input_audio_transcription: config.inputAudioTranscription ?? {
        model: "whisper-1",
      },
      turn_detection: config.turnDetection ?? {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
    },
  });
}

/**
 * Creates a conversation.item.create event to add a message.
 */
export function createConversationItemEvent(
  role: "user" | "assistant" | "system",
  content: string
): string {
  return JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message",
      role,
      content: [
        {
          type: "input_text",
          text: content,
        },
      ],
    },
  });
}

/**
 * Creates a response.create event to trigger AI response.
 * When modalities include "audio", the AI will speak the response.
 */
export function createResponseEvent(options?: {
  modalities?: Array<"text" | "audio">;
  instructions?: string;
}): string {
  const event: Record<string, unknown> = {
    type: "response.create",
    response: {
      modalities: options?.modalities ?? ["text", "audio"],
    },
  };

  if (options?.instructions) {
    (event.response as Record<string, unknown>).instructions = options.instructions;
  }

  return JSON.stringify(event);
}

/**
 * Creates a response.cancel event to interrupt the current response.
 */
export function createResponseCancelEvent(): string {
  return JSON.stringify({
    type: "response.cancel",
  });
}

/**
 * Creates an input_audio_buffer.clear event to clear buffered audio.
 */
export function createClearAudioBufferEvent(): string {
  return JSON.stringify({
    type: "input_audio_buffer.clear",
  });
}

/**
 * Sends an event via the data channel if it's open.
 * Returns true if sent successfully, false otherwise.
 */
export function sendRealtimeEvent(
  dataChannel: RTCDataChannel | null,
  event: string
): boolean {
  if (!dataChannel || dataChannel.readyState !== "open") {
    console.warn("[realtimeEvents] Data channel not ready, cannot send event");
    return false;
  }

  try {
    dataChannel.send(event);
    return true;
  } catch (error) {
    console.error("[realtimeEvents] Failed to send event:", error);
    return false;
  }
}

/**
 * Convenience function to configure and prompt the AI in one call.
 */
export function configureAndPrompt(
  dataChannel: RTCDataChannel | null,
  config: SessionConfig,
  initialPrompt?: string
): boolean {
  if (!dataChannel || dataChannel.readyState !== "open") {
    return false;
  }

  // Send session configuration
  const configSent = sendRealtimeEvent(dataChannel, createSessionUpdateEvent(config));
  if (!configSent) return false;

  // If there's an initial prompt, add it and trigger response
  if (initialPrompt) {
    sendRealtimeEvent(dataChannel, createConversationItemEvent("user", initialPrompt));
    sendRealtimeEvent(dataChannel, createResponseEvent());
  }

  return true;
}
