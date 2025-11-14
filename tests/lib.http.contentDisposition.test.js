import test from "node:test";
import assert from "node:assert/strict";

import { createAttachmentHeaderValue } from "../lib/http/contentDisposition.js";

test("createAttachmentHeaderValue returns quoted filename", () => {
  const value = createAttachmentHeaderValue("project charter.docx");
  assert.strictEqual(
    value,
    'attachment; filename="project charter.docx"; filename*=UTF-8\'\'project%20charter.docx'
  );
});

test("createAttachmentHeaderValue falls back when filename is empty", () => {
  const value = createAttachmentHeaderValue("   ");
  assert.strictEqual(value, 'attachment; filename="download"');
});

test("createAttachmentHeaderValue escapes quotes", () => {
  const value = createAttachmentHeaderValue('my"file.pdf');
  assert.strictEqual(
    value,
    'attachment; filename="my\\"file.pdf"; filename*=UTF-8\'\'my%22file.pdf'
  );
});

