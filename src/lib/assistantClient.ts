/**
 * Client API for charter assistant backend
 */

export interface CharterSlot {
  id: string;
  label: string;
  required: boolean;
  type: string;
}

export interface StartSessionResponse {
  conversation_id: string;
  slots: CharterSlot[];
  initial_prompt: string;
  voice_enabled: boolean;
}

export interface AssistantEvent {
  type: "assistant_prompt" | "slot_update";
  text?: string;
  slot?: string;
  value?: string;
  status?: "captured" | "confirmed" | "skipped";
}

export interface PostMessageResponse {
  events: AssistantEvent[];
}

/**
 * Start a new charter session
 */
export async function startCharterSession(correlationId: string): Promise<StartSessionResponse> {
  const res = await fetch("/assistant/charter/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trigger: "ui_button",
      correlation_id: correlationId,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Failed to start charter session" }));
    throw new Error(error.error || "Failed to start charter session");
  }

  return res.json();
}

/**
 * Post a message to an active charter session
 */
export async function postCharterMessage(
  conversationId: string,
  text: string,
  source: "voice" | "chat",
  isFinal = true
): Promise<PostMessageResponse> {
  const res = await fetch("/assistant/charter/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversationId,
      text,
      source,
      is_final: isFinal,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Failed to post message" }));
    throw new Error(error.error || "Failed to post message");
  }

  return res.json();
}

/**
 * Create an SSE connection to stream charter session events
 */
export function createCharterEventStream(
  conversationId: string,
  onEvent: (event: AssistantEvent) => void,
  onError?: (error: Error) => void
): EventSource {
  const eventSource = new EventSource(`/assistant/charter/stream?conversation_id=${conversationId}`);

  eventSource.addEventListener("connected", (e) => {
    console.log("Charter stream connected:", e.data);
  });

  eventSource.addEventListener("assistant_prompt", (e) => {
    try {
      const event = JSON.parse(e.data);
      onEvent(event);
    } catch (error) {
      console.error("Failed to parse assistant_prompt event:", error);
    }
  });

  eventSource.addEventListener("slot_update", (e) => {
    try {
      const event = JSON.parse(e.data);
      onEvent(event);
    } catch (error) {
      console.error("Failed to parse slot_update event:", error);
    }
  });

  eventSource.onerror = (error) => {
    console.error("Charter stream error:", error);
    if (onError) {
      onError(new Error("EventSource connection error"));
    }
  };

  return eventSource;
}
