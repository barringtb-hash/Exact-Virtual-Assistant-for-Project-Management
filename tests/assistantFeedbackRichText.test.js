import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  linkifyMarkdownLinks,
  renderRichText,
  setRichTextSanitizer,
  resetRichTextSanitizer,
} from "../src/utils/assistantFeedbackRichText.js";
import { sanitizeHtml } from "../src/utils/sanitizeHtml.js";

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
    'Use &lt;b&gt;bold&lt;/b&gt; and [safe](javascript:alert(1))'
  );
});

test("linkifyMarkdownLinks leaves unsupported protocols as text", () => {
  const input = "Contact [me](mailto:test@example.com)";
  const output = linkifyMarkdownLinks(input);
  assert.equal(output, 'Contact [me](mailto:test@example.com)');
});

test("renderRichText produces sanitized anchor markup", () => {
  resetRichTextSanitizer();
  const input = "Download the [DOCX](https://example.com/files/report.docx) for details.";
  const output = renderRichText(input);
  assert.equal(
    output,
    'Download the <a href="https://example.com/files/report.docx" class="assistant-feedback-link" target="_blank" rel="noopener noreferrer">DOCX</a> for details.'
  );
});

test("renderRichText runs through the sanitizer implementation", () => {
  resetRichTextSanitizer();
  setRichTextSanitizer((html) => html.replace(/assistant-feedback-link/g, 'assistant-feedback-link sanitized'));

  try {
    const output = renderRichText('Visit the [portal](https://example.com/portal).');
    assert.match(output, /assistant-feedback-link sanitized/);
  } finally {
    resetRichTextSanitizer();
  }
});

test("sanitizeHtml strips unsafe markup by default", () => {
  resetRichTextSanitizer();
  const dirty = '<a href="https://example.com" class="assistant-feedback-link" onclick="alert(1)">Example</a><script>alert(1)</script>';
  const cleaned = sanitizeHtml(dirty);
  assert.equal(cleaned.includes('onclick'), false);
  assert.equal(cleaned.includes('<script>'), false);
  assert.equal(cleaned.includes('Example'), true);
});
