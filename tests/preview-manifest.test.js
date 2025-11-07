/**
---
scenario: Preview Manifest Test
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.__DOC_ROUTER_ENABLED__ = true;

const { setDocType, setSuggested } = await import("../src/state/docType.js");
const { default: PreviewEditable } = await import(
  "../src/components/PreviewEditable.jsx"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadJson(relativePath) {
  const filePath = path.resolve(__dirname, relativePath);
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents);
}

const [charterManifest, ddpManifest, ddpSchema] = await Promise.all([
  loadJson("../templates/charter/manifest.json"),
  loadJson("../templates/ddp/manifest.json"),
  loadJson("../templates/doc-types/ddp/schema.json"),
]);

function renderWithDocType(type, props) {
  setDocType(type);
  setSuggested(null);
  return renderToStaticMarkup(React.createElement(PreviewEditable, props));
}

test("charter manifest renders defined sections and lock badges", () => {
  const draft = {
    project_name: "Launch EVA",
    sponsor: "Alice", // ensure scalar fields have content
    scope_in: ["Discovery"],
    milestones: [
      { phase: "Plan", deliverable: "Docs", date: "2024-01-01" },
    ],
  };
  const locks = { project_name: true, "milestones.0": true };
  const fieldStates = {
    project_name: { source: "User" },
  };
  const html = renderWithDocType("charter", {
    draft,
    locks,
    fieldStates,
    onDraftChange: () => {},
    onLockField: () => {},
    manifest: charterManifest,
  });

  assert.ok(html.includes("Project Charter"), "section heading should render");
  assert.ok(html.includes("Project Title"), "scalar label should render");
  assert.ok(
    html.includes("Scope &amp; Risks"),
    "manifest-defined section should render"
  );
  assert.ok(html.includes("Locked"), "lock badge should be visible");
});

test("ddp manifest drives schema preview and retains metadata", () => {
  const draft = {
    project_name: "Design Plan",
    requirements: ["API docs"],
    risks: ["Timeline"],
    phases: [{ name: "Plan", owner: "Taylor" }],
  };
  const locks = { project_name: true, risks: true };
  const fieldStates = {
    project_name: { source: "LLM" },
  };
  const html = renderWithDocType("ddp", {
    draft,
    locks,
    fieldStates,
    onDraftChange: () => {},
    onLockField: () => {},
    isLoading: false,
    schema: ddpSchema,
    manifest: ddpManifest,
  });


  assert.ok(
    html.includes("Design &amp; Development Plan"),
    "manifest display label should render"
  );
  assert.ok(
    html.includes("Project name"),
    "schema-derived scalar label should render"
  );
  assert.ok(html.includes("Locked"), "locked badge should render for schema preview");
  assert.ok(html.includes("LLM"), "field metadata source should render");
  assert.ok(
    !html.includes("Structured preview not available"),
    "schema-driven layout should avoid fallback"
  );
});
