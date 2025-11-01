import test from "node:test";
import assert from "node:assert/strict";

import { buildExtractionPayload } from "../src/utils/extractAndPopulate.js";

function withIntentFlag(value, run) {
  const original = process.env.INTENT_ONLY_EXTRACTION;
  try {
    if (typeof value === "undefined") {
      delete process.env.INTENT_ONLY_EXTRACTION;
    } else {
      process.env.INTENT_ONLY_EXTRACTION = value;
    }
    return run();
  } finally {
    if (typeof original === "undefined") {
      delete process.env.INTENT_ONLY_EXTRACTION;
    } else {
      process.env.INTENT_ONLY_EXTRACTION = original;
    }
  }
}

test("buildExtractionPayload includes intent metadata when enabled", () => {
  withIntentFlag("true", () => {
    const payload = buildExtractionPayload({
      docType: "charter",
      intent: { action: "extract" },
      intentSource: "nl_intent",
      intentReason: "user request",
    });

    assert.equal(payload.intent?.action, "extract");
    assert.equal(payload.intentSource, "nl_intent");
    assert.equal(payload.intentReason, "user request");
  });
});

test("buildExtractionPayload omits intent metadata when disabled", () => {
  withIntentFlag("false", () => {
    const payload = buildExtractionPayload({
      docType: "charter",
      intent: { action: "extract" },
      intentSource: "nl_intent",
      intentReason: "user request",
    });

    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "intent"));
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "intentSource"));
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "intentReason"));
  });
});

test("buildExtractionPayload trims intent reason", () => {
  withIntentFlag("true", () => {
    const payload = buildExtractionPayload({
      docType: "charter",
      intentReason: "  reason that should be trimmed  ",
    });

    assert.equal(payload.intentReason, "reason that should be trimmed");
  });
});
