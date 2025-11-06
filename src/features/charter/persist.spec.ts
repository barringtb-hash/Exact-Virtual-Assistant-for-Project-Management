import { describe, expect, it } from "vitest";

import { createInitialGuidedState } from "./guidedState";
import { guidedStateToCharterDTO } from "./persist";

function confirmField(state, fieldId, value) {
  state.fields[fieldId] = {
    ...state.fields[fieldId],
    status: "confirmed",
    value,
    confirmedValue: value,
    issues: [],
    skippedReason: null,
  };
}

describe("guidedStateToCharterDTO", () => {
  it("returns an empty object when there are no confirmed fields", () => {
    const state = createInitialGuidedState();
    const dto = guidedStateToCharterDTO(state);
    expect(dto).toEqual({});
  });

  it("maps confirmed string fields to trimmed values", () => {
    const state = createInitialGuidedState();
    confirmField(state, "project_name", "  Project Phoenix  ");

    const dto = guidedStateToCharterDTO(state);

    expect(dto).toEqual({ project_name: "Project Phoenix" });
  });

  it("normalizes string lists and removes empty entries", () => {
    const state = createInitialGuidedState();
    confirmField(state, "scope_in", [" Design", "", "Implementation "]);

    const dto = guidedStateToCharterDTO(state);

    expect(dto).toEqual({ scope_in: ["Design", "Implementation"] });
  });

  it("normalizes object lists including string shortcuts", () => {
    const state = createInitialGuidedState();
    confirmField(state, "milestones", [
      { phase: "Plan", deliverable: "Kickoff", date: "2024-02-01" },
      "Launch", // string fallback should target the deliverable field
    ]);

    const dto = guidedStateToCharterDTO(state);

    expect(dto).toEqual({
      milestones: [
        { phase: "Plan", deliverable: "Kickoff", date: "2024-02-01" },
        { deliverable: "Launch" },
      ],
    });
  });
});
