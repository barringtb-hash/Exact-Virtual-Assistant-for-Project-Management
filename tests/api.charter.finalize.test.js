import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";

import finalizeHandler from "../api/charter/finalize.js";
import { normalizeCharterFormSchema } from "../src/lib/charter/formSchema.ts";
import { createConversationState } from "../src/state/conversationMachine.ts";
import { createMockResponse } from "./helpers/http.js";

async function loadCharterSchema() {
  const schemaPath = path.join(process.cwd(), "templates/charter/formSchema.json");
  const raw = await readFile(schemaPath, "utf8");
  return normalizeCharterFormSchema(JSON.parse(raw));
}

function setField(state, fieldId, { value = "", normalized = value, status = "confirmed", skippedReason = null }) {
  const fieldState = state.fields[fieldId];
  if (!fieldState) {
    throw new Error(`Unknown field: ${fieldId}`);
  }
  fieldState.value = typeof value === "string" ? value : "";
  fieldState.confirmedValue = typeof value === "string" ? value : null;
  fieldState.normalizedValue = normalized;
  fieldState.status = status;
  fieldState.skippedReason = skippedReason;
  fieldState.lastUpdatedAt = new Date().toISOString();
  if (status === "skipped") {
    fieldState.confirmedValue = null;
    fieldState.normalizedValue = null;
    fieldState.value = "";
  }
}

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        if (name.toLowerCase() === "content-type") {
          return "application/json";
        }
        return null;
      },
    },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

test("/api/charter/finalize copies template, formats replacements, and returns document links", async () => {
  const schema = await loadCharterSchema();
  const state = createConversationState(schema);

  setField(state, "project_name", { value: "Phoenix CRM Modernization" });
  setField(state, "sponsor", { value: "Jordan Patel" });
  setField(state, "project_lead", { value: "Alex Morgan" });
  setField(state, "start_date", { value: "2024-01-08", normalized: "2024-01-08" });
  setField(state, "end_date", { value: "2024-07-31", normalized: "2024-07-31" });
  setField(state, "vision", { value: "Deliver a unified CRM platform." });
  setField(state, "description", { value: "Implement Salesforce across regions." });
  setField(state, "scope_in", {
    value: "Discovery\nImplementation",
    normalized: ["Discovery", "Implementation"],
  });
  setField(state, "milestones", {
    value: "",
    normalized: [
      { phase: "Phase 1", deliverable: "Discovery Complete", date: "2024-02-01" },
      { phase: "Phase 2", deliverable: "Go-Live", date: "2024-05-15" },
    ],
  });
  setField(state, "problem", { value: "", status: "skipped", skippedReason: "user-skipped" });

  const originalEnv = {
    template: process.env.GOOGLE_DRIVE_CHARTER_TEMPLATE_ID,
    folder: process.env.GOOGLE_DRIVE_CHARTER_DESTINATION_FOLDER_ID,
    base: process.env.GOOGLE_DRIVE_CONNECTOR_BASE_URL,
    token: process.env.GOOGLE_DRIVE_CONNECTOR_TOKEN,
  };
  process.env.GOOGLE_DRIVE_CHARTER_TEMPLATE_ID = "template-001";
  process.env.GOOGLE_DRIVE_CHARTER_DESTINATION_FOLDER_ID = "folder-abc";
  process.env.GOOGLE_DRIVE_CONNECTOR_BASE_URL = "https://connectors.example";
  process.env.GOOGLE_DRIVE_CONNECTOR_TOKEN = "secret-token";

  const fetchCalls = [];
  const copyPayloads = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const urlString = typeof url === "string" ? url : url.toString();
    fetchCalls.push({ url: urlString, options });
    const parsedBody = options?.body ? JSON.parse(options.body) : null;
    if (urlString.includes("copy_document")) {
      copyPayloads.push(parsedBody);
      return createJsonResponse({ documentId: "drive-doc-123" });
    }
    if (urlString.includes("share_document")) {
      return createJsonResponse({ webViewLink: "https://docs.google.com/document/d/drive-doc-123/edit" });
    }
    if (urlString.includes("fetch")) {
      return createJsonResponse({ webViewLink: "https://docs.google.com/document/d/drive-doc-123" });
    }
    throw new Error(`Unexpected fetch call: ${urlString}`);
  };

  const res = createMockResponse();
  try {
    await finalizeHandler(
      {
        method: "POST",
        body: {
          conversation: state,
          exportPdf: true,
        },
      },
      res
    );
  } finally {
    global.fetch = originalFetch;
    process.env.GOOGLE_DRIVE_CHARTER_TEMPLATE_ID = originalEnv.template;
    process.env.GOOGLE_DRIVE_CHARTER_DESTINATION_FOLDER_ID = originalEnv.folder;
    process.env.GOOGLE_DRIVE_CONNECTOR_BASE_URL = originalEnv.base;
    if (originalEnv.token === undefined) {
      delete process.env.GOOGLE_DRIVE_CONNECTOR_TOKEN;
    } else {
      process.env.GOOGLE_DRIVE_CONNECTOR_TOKEN = originalEnv.token;
    }
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.document.id, "drive-doc-123");
  assert.equal(res.body.document.url, "https://docs.google.com/document/d/drive-doc-123");
  assert.ok(res.body.pdf);
  assert.ok(res.body.pdf.base64);

  const checklist = res.body.checklist || [];
  const problemItem = checklist.find((item) => item.id === "problem");
  assert(problemItem, "expected checklist entry for problem field");
  assert.equal(problemItem.missingRequired, true);

  assert.equal(copyPayloads.length, 1);
  const replacements = copyPayloads[0]?.replacements ?? {};
  assert.equal(replacements.project_name, "Phoenix CRM Modernization");
  assert.match(replacements.scope_in, /Discovery/);
  assert.match(replacements.scope_in, /Implementation/);
  assert.match(replacements.milestones, /Phase 1/);
  assert.match(replacements.milestones, /Go-Live/);

  const structured = copyPayloads[0]?.structuredReplacements ?? {};
  assert(Array.isArray(structured.milestones));
  assert.equal(structured.milestones[0].phase, "Phase 1");

  assert(fetchCalls.length >= 3);
  const authHeader = fetchCalls[0].options.headers?.get
    ? fetchCalls[0].options.headers.get("authorization")
    : fetchCalls[0].options.headers?.Authorization || fetchCalls[0].options.headers?.authorization;
  assert.equal(authHeader, "Bearer secret-token");
});
