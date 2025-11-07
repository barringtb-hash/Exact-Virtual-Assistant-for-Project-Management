/**
---
scenario: OnFileAttached Test
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
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { detectCharterIntent } from "../src/utils/detectCharterIntent.js";

function withIntentFlag(value, fn) {
  const original = process.env.INTENT_ONLY_EXTRACTION;
  if (typeof value === "undefined") {
    delete process.env.INTENT_ONLY_EXTRACTION;
  } else {
    process.env.INTENT_ONLY_EXTRACTION = value;
  }

  return fn().finally(() => {
    if (typeof original === "undefined") {
      delete process.env.INTENT_ONLY_EXTRACTION;
    } else {
      process.env.INTENT_ONLY_EXTRACTION = original;
    }
  });
}

async function loadBackgroundExtractionModule({ flagValue } = {}) {
  const suffix = Math.random().toString(36).slice(2);
  return withIntentFlag(flagValue, () =>
    import(`../src/hooks/useBackgroundExtraction.js?test=${suffix}`)
  );
}

function renderHook(hook, props) {
  let hookResult;
  function Harness(innerProps) {
    hookResult = hook(innerProps);
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness, props));
  return hookResult;
}

test("detectCharterIntent flags create and update phrases", () => {
  assert.equal(
    detectCharterIntent("Please create a project charter for the Phoenix workstream."),
    "create_charter"
  );
  assert.equal(
    detectCharterIntent("We should update the project charter with the latest scope."),
    "update_charter"
  );
});

test("detectCharterIntent ignores unrelated messages", () => {
  const unrelated = "Let’s review the risk log and schedule a planning meeting.";
  assert.equal(detectCharterIntent(unrelated), null);
  assert.equal(detectCharterIntent(""), null);
  assert.equal(detectCharterIntent(null), null);
});

test("useBackgroundExtraction trigger sends sanitized payload with intent", async () => {
  const { default: useBackgroundExtraction } = await loadBackgroundExtractionModule({
    flagValue: "true",
  });

  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { project_name: "Launch Initiative" };
      },
    };
  };

  try {
    let appliedDraft = null;
    const hook = renderHook(useBackgroundExtraction, {
      docType: "charter",
      messages: [
        { role: "user", text: "Please create a project charter." },
        { role: "assistant", text: "Acknowledged." },
      ],
      attachments: [
        { name: "demo-tpp.txt", text: " Project overview for onboarding." },
        { name: "blank.txt", text: "   " },
      ],
      intent: "create_charter",
      intentSource: "composer-intent",
      setDraft: (nextDraft) => {
        appliedDraft = nextDraft;
        return nextDraft;
      },
    });

    const result = await hook.trigger();
    assert.equal(result.ok, true);
    assert.ok(appliedDraft, "expected setDraft to receive normalized payload");
    assert.equal(fetchCalls.length, 1);

    const { url, options } = fetchCalls[0];
    assert.ok(url.endsWith("/api/documents/extract"));
    const payload = JSON.parse(options?.body || "{}");
    assert.equal(payload.docType, "charter");
    assert.equal(payload.intent, "create_charter");
    assert.equal(payload.intentSource, "composer-intent");
    assert.equal(payload.messages.length, 2);
    assert.equal(payload.messages[0].role, "user");
    assert.equal(payload.attachments.length, 1);
    assert.equal(payload.attachments[0].name, "demo-tpp.txt");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("useBackgroundExtraction trigger falls back to charter docType when flag is off", async () => {
  const { default: useBackgroundExtraction } = await loadBackgroundExtractionModule({
    flagValue: "false",
  });

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {};
      },
    };
  };

  try {
    const hook = renderHook(useBackgroundExtraction, {
      docType: null,
      messages: [{ role: "user", text: "Draft the charter" }],
      attachments: [{ name: "demo-tpp.txt", text: " Scope" }],
      setDraft: () => ({}),
    });

    const outcome = await hook.trigger();
    assert.equal(outcome.ok, true);
    assert.equal(calls.length, 1);
    const payload = JSON.parse(calls[0]?.options?.body || "{}");
    assert.equal(payload.docType, "charter");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
