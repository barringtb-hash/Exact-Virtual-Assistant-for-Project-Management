/**
---
scenario: Charter Download Api Spec
feature: unknown
subsystem: unknown
envs: []
risk: unknown
owner: TBD
ci_suites: []
flaky: false
needs_review: true
preconditions:
  - TBD
data_setup: TBD
refs: []
---
*/

import { test, expect } from "@playwright/test";

const VALID_CHARTER = {
  project_name: "AI Launch",
  sponsor: "Alice Example",
  project_lead: "Bob Example",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  vision: "Deliver an AI assistant to every PM team.",
  problem: "Teams lack a centralized intake workflow.",
  description: "Integration test charter payload.",
  scope_in: ["Research", "Pilot"],
  scope_out: ["Hardware"],
  risks: ["Integration delays"],
  assumptions: ["Executive sponsor available"],
  milestones: [
    { phase: "Discovery", deliverable: "Pilot findings", date: "2024-04-15" },
  ],
  success_metrics: [
    {
      benefit: "Adoption",
      metric: "Department adoption rate",
      system_of_measurement: "percent",
    },
  ],
  core_team: [
    { name: "Sam", role: "Sponsor" },
    { name: "Taylor", role: "PM" },
  ],
};

test.describe("charter export flow", () => {
  test("generates downloadable links for valid payloads", async ({ request }) => {
    const response = await request.post("/api/charter/make-link", {
      data: {
        charter: VALID_CHARTER,
        baseName: "AI Launch",
        formats: ["json"],
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();

    const jsonLink = body?.links?.json;
    expect(jsonLink).toBeTruthy();

    const download = await request.get(jsonLink);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-type"]).toBe("application/json");
    const buffer = await download.body();
    const payload = JSON.parse(buffer.toString("utf8"));
    expect(payload.project_name).toBe("AI Launch");
  });

  test("rejects invalid charters during link creation", async ({ request }) => {
    const response = await request.post("/api/charter/make-link", {
      data: {
        charter: { project_name: "x" },
        baseName: "Invalid",
        formats: ["json"],
      },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code || body.error?.message || body.errors).toBeDefined();
  });

  test("blocks tampered download signatures", async ({ request }) => {
    const response = await request.post("/api/charter/make-link", {
      data: {
        charter: VALID_CHARTER,
        baseName: "AI Launch",
        formats: ["json"],
      },
    });
    const body = await response.json();
    const jsonLink = new URL(body.links.json);
    const token = jsonLink.searchParams.get("token");
    const format = jsonLink.searchParams.get("format");
    const sig = jsonLink.searchParams.get("sig");

    jsonLink.searchParams.set("sig", `${sig.slice(0, -1)}0`);
    const tampered = await request.get(jsonLink.toString());
    expect(tampered.status()).toBe(403);

    // control call with proper signature still succeeds
    const valid = await request.get(
      `/api/charter/download?format=${format}&token=${token}&sig=${sig}`
    );
    expect(valid.status()).toBe(200);
  });
});
