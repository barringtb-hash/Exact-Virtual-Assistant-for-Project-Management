import { afterEach, describe, expect, it, vi } from "vitest";

import createGuidedOrchestrator from "./guidedOrchestrator";

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("guided orchestrator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("queues ambiguous proposals, surfaces warnings, and honors approve/reject commands", async () => {
    const messages: string[] = [];
    const extractor = vi.fn().mockResolvedValue({
      ok: true,
      fields: { project_name: "Orion Initiative" },
      warnings: [
        {
          code: "validation_failed",
          message: "Multiple interpretations detected.",
          level: "warning",
          fieldId: "project_name",
        },
      ],
      rawToolArguments: { candidates: ["Orion", "Apollo"] },
    });

    const orchestrator = createGuidedOrchestrator({
      postAssistantMessage: (message) => {
        messages.push(message);
      },
      extractFieldsFromUtterance: extractor,
    });

    orchestrator.start();
    messages.length = 0;

    const handled = orchestrator.handleUserMessage(
      "We call it the Orion Initiative, but some say Apollo",
    );
    expect(handled).toBe(true);

    await flushMicrotasks();

    expect(extractor).toHaveBeenCalledTimes(1);

    const pending = orchestrator.getPendingProposal();
    expect(pending).not.toBeNull();
    expect(pending?.fieldId).toBe("project_name");
    expect(pending?.summary).toContain("Orion Initiative");
    expect(pending?.warnings).toEqual(["Multiple interpretations detected."]);
    expect(pending?.toolWarnings).toEqual([
      {
        code: "validation_failed",
        message: "Multiple interpretations detected.",
        level: "warning",
        fieldId: "project_name",
      },
    ]);
    expect(pending?.toolFields).toEqual({ project_name: "Orion Initiative" });

    const state = orchestrator.getState();
    expect(state.pendingFieldId).toBe("project_name");
    expect(state.awaitingConfirmation).toBe(true);
    expect(state.pendingWarnings).toEqual(["Multiple interpretations detected."]);
    expect(state.fields.project_name.status).toBe("captured");
    expect(state.fields.project_name.confirmedValue).toBeNull();

    expect(
      messages.some((entry) =>
        entry.includes("Here’s what I captured for Project Title: Orion Initiative."),
      ),
    ).toBe(true);
    expect(messages.some((entry) => entry.includes("Reply \"yes\" to save it"))).toBe(true);
    expect(messages.some((entry) => entry.includes("Heads up: Multiple interpretations detected."))).toBe(
      true,
    );

    const rejected = orchestrator.rejectPendingProposal();
    expect(rejected).toBe(true);

    expect(
      messages.some((entry) =>
        entry.includes(
          "No problem—let’s adjust Project Title. Share the right details or type \"skip\" to move on.",
        ),
      ),
    ).toBe(true);

    const afterRejectState = orchestrator.getState();
    expect(afterRejectState.pendingFieldId).toBeNull();
    expect(afterRejectState.awaitingConfirmation).toBe(false);
    expect(afterRejectState.currentFieldId).toBe("project_name");
    expect(afterRejectState.pendingWarnings).toEqual([]);
    expect(afterRejectState.fields.project_name.status).toBe("asking");
    expect(afterRejectState.fields.project_name.issues).toEqual([]);
    expect(orchestrator.getPendingProposal()).toBeNull();

    messages.length = 0;

    const handledAgain = orchestrator.handleUserMessage("Let’s stick with Orion Initiative");
    expect(handledAgain).toBe(true);

    await flushMicrotasks();

    expect(extractor).toHaveBeenCalledTimes(2);

    const pendingAgain = orchestrator.getPendingProposal();
    expect(pendingAgain).not.toBeNull();
    expect(pendingAgain?.toolFields).toEqual({ project_name: "Orion Initiative" });
    expect(pendingAgain?.warnings).toEqual(["Multiple interpretations detected."]);
    expect(pendingAgain?.toolWarnings).toEqual([
      {
        code: "validation_failed",
        message: "Multiple interpretations detected.",
        level: "warning",
        fieldId: "project_name",
      },
    ]);

    const approved = orchestrator.approvePendingProposal();
    expect(approved).toBe(true);

    const finalState = orchestrator.getState();
    expect(finalState.pendingFieldId).toBeNull();
    expect(finalState.awaitingConfirmation).toBe(false);
    expect(finalState.fields.project_name.status).toBe("confirmed");
    expect(finalState.fields.project_name.confirmedValue).toBe("Orion Initiative");
    expect(finalState.pendingWarnings).toEqual([]);
    expect(orchestrator.getPendingProposal()).toBeNull();
    expect(messages.some((entry) => entry.includes("Saved Project Title."))).toBe(true);
  });

  it("drops pending proposals when extraction reports validation errors", async () => {
    const messages: string[] = [];
    const extractor = vi.fn().mockResolvedValue({
      ok: false,
      fields: {},
      warnings: [],
      error: {
        code: "validation_failed",
        message: "Project name must be at least three characters.",
        fields: ["project_name"],
      },
    });

    const orchestrator = createGuidedOrchestrator({
      postAssistantMessage: (message) => {
        messages.push(message);
      },
      extractFieldsFromUtterance: extractor,
    });

    orchestrator.start();
    messages.length = 0;

    const handled = orchestrator.handleUserMessage("X");
    expect(handled).toBe(true);

    await flushMicrotasks();

    expect(extractor).toHaveBeenCalledTimes(1);

    const pending = orchestrator.getPendingProposal();
    expect(pending).toBeNull();

    const state = orchestrator.getState();
    expect(state.pendingFieldId).toBeNull();
    expect(state.awaitingConfirmation).toBe(false);
    expect(state.currentFieldId).toBe("project_name");
    expect(state.pendingWarnings).toEqual([]);
    expect(state.fields.project_name.status).toBe("rejected");
    expect(state.fields.project_name.issues).toEqual([
      "Project name must be at least three characters.",
    ]);
    expect(state.fields.project_name.confirmedValue).toBeNull();
    expect(orchestrator.getPendingProposal()).toBeNull();
    expect(messages.some((entry) => entry.includes("Try again or type \"skip\""))).toBe(true);
    expect(
      messages.some((entry) =>
        entry.includes("Project name must be at least three characters."),
      ),
    ).toBe(true);
  });
});
