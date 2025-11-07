/**
 * POST /assistant/charter/start
 * Bootstrap a new guided charter session
 */

import { randomUUID } from "crypto";
import { ServerOrchestrator } from "../../../server/charter/Orchestrator.js";
import { CHARTER_FIELDS } from "../../../src/features/charter/schema.js";

// In-memory session store (for Phase 1)
// In production, this would be backed by a database or Redis
const sessions = new Map<string, ServerOrchestrator>();
const correlationCache = new Map<string, { conversationId: string; timestamp: number }>();

// Cleanup stale sessions (older than 1 hour)
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const [correlationId, data] of correlationCache.entries()) {
    if (now - data.timestamp > oneHour) {
      correlationCache.delete(correlationId);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

interface StartRequest {
  trigger: string;
  correlation_id: string;
  project_context?: {
    portfolioId?: string | null;
    templateId?: string;
  };
}

interface SlotDefinition {
  id: string;
  label: string;
  required: boolean;
  type: string;
}

interface StartResponse {
  conversation_id: string;
  slots: SlotDefinition[];
  initial_prompt: string;
  voice_enabled: boolean;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body: StartRequest = await request.json();
    const { correlation_id, trigger, project_context } = body;

    if (!correlation_id) {
      return new Response(JSON.stringify({ error: "correlation_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check for idempotency (60 second window)
    const now = Date.now();
    const cached = correlationCache.get(correlation_id);
    if (cached && now - cached.timestamp < 60000) {
      // Return the same conversation_id
      const existingOrchestrator = sessions.get(cached.conversationId);
      if (existingOrchestrator) {
        const slots: SlotDefinition[] = CHARTER_FIELDS.map((field) => ({
          id: field.id,
          label: field.label,
          required: field.required,
          type: field.type,
        }));

        const response: StartResponse = {
          conversation_id: cached.conversationId,
          slots,
          initial_prompt: "Let's build your charter step-by-step. I'll ask about each section…",
          voice_enabled: true,
        };

        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Create new session
    const conversationId = `conv_${randomUUID()}`;
    const voiceEnabled = true; // Can be configured based on client capabilities

    const orchestrator = new ServerOrchestrator(conversationId, correlation_id, voiceEnabled);
    sessions.set(conversationId, orchestrator);
    correlationCache.set(correlation_id, { conversationId, timestamp: now });

    // Start the session and get initial events
    const events = orchestrator.startSession();
    const initialPrompt = events.find((e) => e.type === "assistant_prompt")?.text ||
      "Let's build your charter step-by-step. I'll ask about each section…";

    const slots: SlotDefinition[] = CHARTER_FIELDS.map((field) => ({
      id: field.id,
      label: field.label,
      required: field.required,
      type: field.type,
    }));

    const response: StartResponse = {
      conversation_id: conversationId,
      slots,
      initial_prompt: initialPrompt,
      voice_enabled: voiceEnabled,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error starting charter session:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export { sessions };
