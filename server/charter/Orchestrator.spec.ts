import assert from "node:assert/strict";
import { describe, it } from "node:test";

const orchestratorUrl = new URL("./Orchestrator.ts", import.meta.url).href;

type OrchestratorModule = typeof import("./Orchestrator.ts");

type InteractionOptions = Parameters<OrchestratorModule["startSession"]>[0];

declare global {
  namespace NodeJS {
    interface Process {
      __OPENAI_MOCK_RESPONSES?: Array<(request: unknown) => unknown>;
    }
  }
}

function ensureResponseQueue() {
  if (!process.__OPENAI_MOCK_RESPONSES) {
    process.__OPENAI_MOCK_RESPONSES = [];
  }
  return process.__OPENAI_MOCK_RESPONSES;
}

function withOpenAIStub() {
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  ensureResponseQueue().length = 0;
  return () => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    delete process.__OPENAI_MOCK_RESPONSES;
  };
}

async function importOrchestratorModule(): Promise<OrchestratorModule> {
  const uniqueSuffix = `?test=${Date.now()}-${Math.random()}`;
  return await import(`${orchestratorUrl}${uniqueSuffix}`);
}

function createOptions(conversationId: string, sink: string[]): InteractionOptions {
  return {
    conversationId,
    emitAssistantMessage(message: string) {
      sink.push(message);
    },
  };
}

describe("server charter orchestrator", () => {
  it("stores ambiguous proposals for confirmation and only confirms after approval", async () => {
    const messages: string[] = [];
    const conversationId = "server-orchestrator-ambiguous";
    const restore = withOpenAIStub();

    try {
      const responseQueue = ensureResponseQueue();
      responseQueue.length = 0;
      const orchestratorModule = await importOrchestratorModule();
      const { startSession, handleCommand, handleUserMessage, getState, deleteSession } =
        orchestratorModule;

      const options = createOptions(conversationId, messages);

      await startSession(options);

      const editResult = await handleCommand(options, { type: "edit", target: "Milestones" });
      assert.equal(editResult.handled, true);

      responseQueue.push(() => ({
        output: [
          {
            type: "function",
            function: {
              name: "extract_charter_fields",
              arguments: JSON.stringify({
                milestones: [
                  { phase: "Planning", deliverable: "Kickoff", date: "2024-02-01" },
                  { phase: "Execution", deliverable: "", date: "bad-date" },
                ],
              }),
            },
          },
        ],
      }));

      const result = await handleUserMessage(
        options,
        "Milestones include planning kickoff and execution without a set date",
      );

      assert.equal(result.handled, true);
      assert.equal(result.state.pendingFieldId, "milestones");
      assert.equal(result.state.awaitingConfirmation, true);
      assert.deepEqual(result.state.pendingWarnings, [
        "Target Date: Enter a valid date in YYYY-MM-DD format.",
      ]);
      assert.deepEqual(result.pendingToolFields, {
        milestones: [
          { phase: "Planning", deliverable: "Kickoff", date: "2024-02-01" },
          { phase: "Execution" },
        ],
      });
      assert.deepEqual(result.pendingToolArguments, {
        milestones: [
          { phase: "Planning", deliverable: "Kickoff", date: "2024-02-01" },
          { phase: "Execution", deliverable: "", date: "bad-date" },
        ],
      });
      assert.deepEqual(result.pendingToolWarnings, [
        {
          code: "validation_failed",
          message: "Target Date: Enter a valid date in YYYY-MM-DD format.",
          fieldId: "milestones",
          details: { child: "date", value: "bad-date" },
          level: "warning",
        },
      ]);
      assert.ok(
        messages.some((entry) =>
          entry.includes(
            'Here’s what I captured for Milestones: phase: Planning, deliverable: Kickoff, date: 2024-02-01; phase: Execution.',
          ),
        ),
      );
      assert.ok(
        messages.some((entry) =>
          entry.includes(
            "Heads up: Target Date: Enter a valid date in YYYY-MM-DD format.",
          ),
        ),
        "expected warning prompt",
      );

      const stateSnapshot = getState(conversationId);
      assert.equal(stateSnapshot.pendingFieldId, "milestones");
      assert.equal(stateSnapshot.fields.milestones.status, "captured");
      assert.equal(stateSnapshot.fields.milestones.confirmedValue, null);
      assert.deepEqual(stateSnapshot.pendingWarnings, [
        "Target Date: Enter a valid date in YYYY-MM-DD format.",
      ]);

      messages.length = 0;

      const confirmationResult = await handleUserMessage(options, "yes");
      assert.equal(confirmationResult.handled, true);
      assert.equal(confirmationResult.state.pendingFieldId, null);
      assert.equal(confirmationResult.state.fields.milestones.status, "confirmed");
      assert.deepEqual(confirmationResult.state.pendingWarnings, []);
      assert.deepEqual(confirmationResult.state.fields.milestones.confirmedValue, [
        { phase: "Planning", deliverable: "Kickoff", date: "2024-02-01" },
        { phase: "Execution" },
      ]);
      assert.ok(
        messages.some((entry) => entry.includes("Saved Milestones.")),
        "expected confirmation acknowledgement",
      );

      deleteSession(conversationId);
    } finally {
      restore();
    }
  });

  it("clears pending proposals when extraction returns validation errors", async () => {
    const messages: string[] = [];
    const conversationId = "server-orchestrator-validation";
    const restore = withOpenAIStub();

    try {
      const responseQueue = ensureResponseQueue();
      responseQueue.length = 0;
      responseQueue.push(() => ({
        output: [
          {
            type: "function",
            function: {
              name: "extract_charter_fields",
              arguments: JSON.stringify({ project_name: "" }),
            },
          },
        ],
      }));

      const orchestratorModule = await importOrchestratorModule();
      const { startSession, handleUserMessage, getState, deleteSession } = orchestratorModule;

      const options = createOptions(conversationId, messages);

      await startSession(options);

      const result = await handleUserMessage(options, "Name placeholder");

      assert.equal(result.handled, true);
      assert.equal(result.state.pendingFieldId, null);
      assert.equal(result.state.awaitingConfirmation, false);
      assert.equal(result.state.currentFieldId, "project_name");
      assert.deepEqual(result.state.pendingWarnings, []);
      assert.equal(result.state.fields.project_name.status, "rejected");
      assert.deepEqual(result.state.fields.project_name.issues, [
        "This field is required.",
      ]);
      assert.deepEqual(result.pendingToolFields, {});
      assert.equal(result.pendingToolArguments, null);
      assert.deepEqual(result.pendingToolWarnings, []);
      assert.ok(
        messages.some((entry) =>
          entry.includes("This field is required. Try again or type \"skip\" to move on."),
        ),
      );

      const sessionState = getState(conversationId);
      assert.equal(sessionState.pendingFieldId, null);
      assert.equal(sessionState.fields.project_name.status, "rejected");
      assert.equal(sessionState.currentFieldId, "project_name");

      deleteSession(conversationId);
    } finally {
      restore();
    }
  });
});
