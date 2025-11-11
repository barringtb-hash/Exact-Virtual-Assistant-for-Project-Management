// cypress/harness/server.ts
// Route constants - must match src/lib/assistantClient.ts
const CHARTER_ROUTES = {
  start: "**/api/assistant/charter/start*",
  messages: "**/api/assistant/charter/messages*",
  stream: "**/api/assistant/charter/stream*",
};

type CharterStartResponse = {
  conversationId: string;
  prompt: string;
  hasVoiceSupport: boolean;
  slots: Array<{ slot_id: string; label: string; question: string; required: boolean }>;
  events: Array<Record<string, unknown>>;
  idempotent: boolean;
};

export function stubCharterStart(overrides?: Partial<CharterStartResponse>) {
  const START_URL = CHARTER_ROUTES.start;

  // IMPORTANT: Do NOT register a methodless intercept for START_URL before this POST stub.
  // Cypress will match the first intercept and @charterStart won't fire.
  cy.log("Stubbing charter start (POST) -> @charterStart");
  cy.intercept("POST", START_URL, (req) => {
    const correlationId = req.body?.correlation_id;
    expect(correlationId, "correlation id").to.be.a("string").and.not.be.empty;
    const body: CharterStartResponse = {
      conversationId: "conv-001",
      prompt: "Let's build your charter step-by-step.",
      hasVoiceSupport: true,
      slots: [
        { slot_id: "project_name", label: "Project Title", question: "What's the official name of this project?", required: true },
        { slot_id: "sponsor", label: "Sponsor", question: "Who is sponsoring this project?", required: true },
      ],
      events: [
        { event_id: "evt-greeting", type: "assistant_prompt", message: "Let's build your charter step-by-step." },
        { event_id: "evt-ask-title", type: "assistant_prompt", message: "Project Title (required). What's the official name of this project?" },
        { event_id: "evt-slot", type: "slot_update", status: "collecting", current_slot_id: "project_name", slots: [
          { slot_id: "project_name", status: "awaiting_input" },
          { slot_id: "sponsor", status: "pending" },
        ]},
      ],
      idempotent: false,
      ...overrides,
    };
    req.reply({ body });
  }).as("charterStart");
}

export function stubCharterMessages() {
  const MESSAGE_URL = CHARTER_ROUTES.messages;
  cy.intercept("POST", MESSAGE_URL, (req) => {
    const { message } = req.body ?? {};
    if (message === "North Star Initiative") {
      req.reply({ body: {
        handled: true, idempotent: false, events: [
          { event_id: "evt-title-saved", type: "assistant_prompt", message: "Saved Project Title." },
          { event_id: "evt-sponsor-prompt", type: "assistant_prompt", message: "Sponsor (required). Who is sponsoring this project?" },
          { event_id: "evt-slot-update", type: "slot_update", status: "collecting", current_slot_id: "sponsor",
            slots: [
              { slot_id: "project_name", status: "confirmed", value: "North Star Initiative", confirmed_value: "North Star Initiative" },
              { slot_id: "sponsor", status: "awaiting_input" },
            ]},
        ] }});
      return;
    }
    if (message === "Jordan Example") {
      req.reply({ body: {
        handled: true, idempotent: false, events: [
          { event_id: "evt-sponsor-saved", type: "assistant_prompt", message: "Saved Sponsor." },
          { event_id: "evt-lead-prompt", type: "assistant_prompt", message: "Project Lead (required). Who is leading the project day to day?" },
        ] }});
      return;
    }
    req.reply({ body: { handled: true, idempotent: false, events: [] } });
  }).as("charterMessage");
}

export function stubCharterStream(conversationId = "conv-001") {
  cy.intercept("GET", CHARTER_ROUTES.stream, (req) => {
    req.reply({
      statusCode: 200,
      headers: { "content-type": "text/event-stream" },
      body: "event: close\ndata: {}\n\n",
    });
  }).as("charterStream");
  cy.log("Stubbed charter routes ready");
}

export function stubVoiceExtract(expectText: string, draft: Record<string,string>) {
  cy.intercept("POST", "**/api/**/extract", (req) => {
    const voiceEvents = req.body?.voice;
    if (Array.isArray(voiceEvents) && voiceEvents.length > 0) {
      req.alias = "voiceExtract";
      const latest = voiceEvents[voiceEvents.length - 1]?.text;
      expect(latest, "voice payload").to.eq(expectText);
      req.reply({ body: { ok: true, draft }});
      return;
    }
    req.continue();
  });
}
