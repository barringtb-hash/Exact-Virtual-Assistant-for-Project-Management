/**
 * POST /assistant/charter/messages
 * Handle user messages in a guided charter session
 */

import { sessions } from "./start.js";
import type { AssistantEvent } from "../../../server/charter/Orchestrator.js";

interface MessageRequest {
  conversation_id: string;
  text: string;
  source: "voice" | "chat";
  is_final?: boolean;
}

interface MessageResponse {
  events: AssistantEvent[];
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: MessageRequest = await request.json();
    const { conversation_id, text, source, is_final = true } = body;

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: "conversation_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!text) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!source || !["voice", "chat"].includes(source)) {
      return new Response(JSON.stringify({ error: "source must be 'voice' or 'chat'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get the orchestrator for this conversation
    const orchestrator = sessions.get(conversation_id);
    if (!orchestrator) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only process final transcripts for now
    if (!is_final) {
      return new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Handle the user message
    const events = orchestrator.handleUserMessage(text, source);

    const response: MessageResponse = {
      events,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error handling charter message:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
