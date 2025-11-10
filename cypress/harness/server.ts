import type {
  CharterMessageResponse,
  CharterSessionStartResponse,
} from "../../src/lib/assistantClient";

interface StubOptions<T> {
  statusCode?: number;
  delay?: number;
  body?: Partial<T>;
  alias?: string;
}

const DEFAULT_CHARTER_START_RESPONSE: CharterSessionStartResponse = {
  conversationId: "conversation-e2e",
  slots: [],
  prompt: "You are assisting the user.",
  hasVoiceSupport: true,
  events: [],
  idempotent: false,
};

const DEFAULT_CHARTER_MESSAGE_RESPONSE: CharterMessageResponse = {
  events: [],
  handled: true,
  idempotent: false,
};

const VOICE_EXTRACT_ENDPOINTS = [
  "/api/assistant/charter/voice/extract",
  "/api/charter/extract",
  "/api/documents/extract",
  "/api/doc/extract",
] as const;

interface VoiceExtractResponseBody {
  ok: boolean;
  fields?: Record<string, unknown>;
  reason?: string;
}

function buildReply<T>(defaults: T, options: StubOptions<T> = {}) {
  return {
    statusCode: options.statusCode ?? 200,
    delay: options.delay,
    body: { ...defaults, ...options.body },
    headers: { "content-type": "application/json" },
  };
}

export const stubCharterStart = (
  options: StubOptions<CharterSessionStartResponse> = {},
) => {
  const alias = options.alias ?? "charterStart";
  return cy
    .intercept("POST", "/api/assistant/charter/start", (req) => {
      req.reply(buildReply(DEFAULT_CHARTER_START_RESPONSE, options));
    })
    .as(alias);
};

export const stubCharterMessages = (
  options: StubOptions<CharterMessageResponse> = {},
) => {
  const alias = options.alias ?? "charterMessages";
  return cy
    .intercept("POST", "/api/assistant/charter/messages", (req) => {
      req.reply(buildReply(DEFAULT_CHARTER_MESSAGE_RESPONSE, options));
    })
    .as(alias);
};

export const stubVoiceExtract = (
  options: StubOptions<VoiceExtractResponseBody> = {},
) => {
  const alias = options.alias ?? "voiceExtract";
  const responseBody: VoiceExtractResponseBody = {
    ok: true,
    ...options.body,
  };

  const reply = {
    statusCode: options.statusCode ?? 200,
    delay: options.delay,
    body: responseBody,
    headers: { "content-type": "application/json" },
  };

  const intercepts = VOICE_EXTRACT_ENDPOINTS.map((pattern) =>
    cy
      .intercept("POST", pattern, (req) => {
        req.reply(reply);
      })
      .as(alias),
  );

  return intercepts[0];
};
