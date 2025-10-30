import {
  sanitizeMessages,
  sanitizeAttachments,
  sanitizeVoiceEvents,
} from "./extractAndPopulate.js";
import {
  normalizeDocTypeSuggestion,
  suggestDocType,
} from "./docTypeRouter.js";

const ROUTER_ENDPOINT = "/api/documents/router";

function ensureFetch(fetchImpl) {
  return typeof fetchImpl === "function" ? fetchImpl : fetch;
}

function buildRouterPayload({ messages = [], attachments = [], voice = [] } = {}) {
  return {
    messages: sanitizeMessages(messages),
    attachments: sanitizeAttachments(attachments),
    voice: sanitizeVoiceEvents(voice),
  };
}

async function callRouter(payload, fetchImpl) {
  const fetchFn = ensureFetch(fetchImpl);
  const response = await fetchFn(ROUTER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = new Error(`Router detection failed with status ${response.status}`);
    error.status = response.status;
    error.payload = await response.json().catch(() => undefined);
    throw error;
  }

  const data = await response.json().catch(() => null);
  return normalizeDocTypeSuggestion(data);
}

export async function routerDetect(context = {}, { fetchImpl } = {}) {
  const payload = buildRouterPayload(context);

  try {
    const detected = await callRouter(payload, fetchImpl);
    if (detected) {
      return detected;
    }
  } catch (error) {
    console.warn("LLM router detection failed; falling back to heuristics", error);
  }

  const fallback = normalizeDocTypeSuggestion(
    suggestDocType({
      messages: payload.messages,
      attachments: payload.attachments,
      voice: payload.voice,
    })
  );

  return (
    fallback || {
      type: "charter",
      confidence: 0,
    }
  );
}

export default routerDetect;
