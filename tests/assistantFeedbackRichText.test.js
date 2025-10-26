import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, linkifyMarkdownLinks } from "../src/utils/assistantFeedbackRichText.js";

test("escapeHtml sanitizes HTML-sensitive characters", () => {
  const input = "<script>alert('xss')</script>&";
  const output = escapeHtml(input);
  assert.equal(output, "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;&amp;");
});

test("linkifyMarkdownLinks converts absolute URLs with target blank", () => {
  const input = "See [docs](https://example.com/path?q=1&view=full).";
  const output = linkifyMarkdownLinks(input);
  assert.equal(
    output,
    'See <a href="https://example.com/path?q=1&amp;view=full" class="assistant-feedback-link" target="_blank" rel="noopener noreferrer">docs</a>.'
  );
});

test("linkifyMarkdownLinks keeps relative URLs without target blank", () => {
  const input = "Check [API](/api/items).";
  const output = linkifyMarkdownLinks(input);
  assert.equal(
    output,
    'Check <a href="/api/items" class="assistant-feedback-link">API</a>.'
  );
});

test("linkifyMarkdownLinks escapes non-link HTML", () => {
  const input = "Use <b>bold</b> and [safe](javascript:alert(1))";
  const output = linkifyMarkdownLinks(input);
  assert.equal(
    output,
    'Use &lt;b&gt;bold&lt;/b&gt; and <a href="javascript:alert(1)" class="assistant-feedback-link">safe</a>'
  );
});
