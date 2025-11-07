/**
 * GET /assistant/charter/stream
 * Server-Sent Events (SSE) stream for charter session updates
 */

import { sessions } from "./start.js";

const encoder = new TextEncoder();

interface StreamSubscriber {
  controller: ReadableStreamDefaultController;
  conversationId: string;
}

// Track active SSE connections
const activeStreams = new Map<string, Set<StreamSubscriber>>();

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversation_id");

  if (!conversationId) {
    return new Response(JSON.stringify({ error: "conversation_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check if session exists
  const orchestrator = sessions.get(conversationId);
  if (!orchestrator) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Register this stream
      if (!activeStreams.has(conversationId)) {
        activeStreams.set(conversationId, new Set());
      }
      const subscriber: StreamSubscriber = { controller, conversationId };
      activeStreams.get(conversationId)?.add(subscriber);

      // Send initial connection event
      const initialEvent = `event: connected\ndata: ${JSON.stringify({ conversation_id: conversationId })}\n\n`;
      controller.enqueue(encoder.encode(initialEvent));

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch (error) {
          clearInterval(pingInterval);
        }
      }, 30000); // Every 30 seconds

      // Cleanup on close
      request.signal?.addEventListener("abort", () => {
        clearInterval(pingInterval);
        activeStreams.get(conversationId)?.delete(subscriber);
        if (activeStreams.get(conversationId)?.size === 0) {
          activeStreams.delete(conversationId);
        }
        try {
          controller.close();
        } catch {
          // Controller already closed
        }
      });
    },
    cancel() {
      // Cleanup handled in abort listener
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}

/**
 * Broadcast events to all subscribers of a conversation
 * This function should be called from the messages endpoint after processing
 */
export function broadcastEvents(conversationId: string, events: any[]): void {
  const subscribers = activeStreams.get(conversationId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  for (const event of events) {
    const eventType = event.type || "message";
    const data = JSON.stringify(event);
    const sseMessage = `event: ${eventType}\ndata: ${data}\n\n`;
    const encoded = encoder.encode(sseMessage);

    for (const subscriber of subscribers) {
      try {
        subscriber.controller.enqueue(encoded);
      } catch (error) {
        // Remove failed subscriber
        subscribers.delete(subscriber);
      }
    }
  }
}
