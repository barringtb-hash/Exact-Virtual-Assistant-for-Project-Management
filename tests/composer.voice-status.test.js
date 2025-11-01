import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Composer from "../src/components/Composer.tsx";

const StubIcon = () => React.createElement("svg", { role: "img" });

function renderComposer(overrides = {}) {
  const props = {
    draft: "",
    onDraftChange: () => {},
    onSend: () => {},
    onUploadClick: () => {},
    IconUpload: StubIcon,
    IconMic: StubIcon,
    IconSend: StubIcon,
    ...overrides,
  };
  return renderToStaticMarkup(React.createElement(Composer, props));
}

function extractSrOnly(markup) {
  const match = markup.match(
    /<span class="sr-only" aria-live="([^"]+)">([^<]*)<\/span>/
  );
  return match
    ? {
        politeness: match[1],
        text: match[2],
      }
    : null;
}

function hasVisibleStatusText(markup, text) {
  const srOnlyMatch = markup.match(
    /<span class="sr-only" aria-live="[^"]+">[^<]*<\/span>/
  );
  const withoutSrOnly = srOnlyMatch
    ? markup.replace(srOnlyMatch[0], "")
    : markup;
  return withoutSrOnly.includes(`>${text}<`);
}

describe("Composer voice accessibility", () => {
  it("exposes mic state changes via aria-label and sr-only text only", () => {
    const readyMarkup = renderComposer({ recording: false });
    assert.ok(
      readyMarkup.includes('aria-label="Ready"'),
      "ready state aria-label"
    );
    const readySr = extractSrOnly(readyMarkup);
    assert.equal(readySr?.text, "Ready");
    assert.equal(readySr?.politeness, "polite");
    assert.equal(hasVisibleStatusText(readyMarkup, "Ready"), false);

    const recordingMarkup = renderComposer({ recording: true });
    assert.ok(
      recordingMarkup.includes('aria-label="Recording…"'),
      "recording state aria-label"
    );
    const recordingSr = extractSrOnly(recordingMarkup);
    assert.equal(recordingSr?.text, "Recording…");
    assert.equal(recordingSr?.politeness, "assertive");
    assert.equal(hasVisibleStatusText(recordingMarkup, "Recording…"), false);
  });
});
