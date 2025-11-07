/**
---
scenario: Api Doc Routes Test
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

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promises as fs } from "fs";

import Docxtemplater from "docxtemplater";

import validateHandler from "../api/documents/validate.js";
import renderHandler, { __clearDocTemplateCache } from "../api/documents/render.js";
import { __clearValidationCaches } from "../lib/doc/validation.js";
import { MINIMAL_VALID_DDP, MINIMAL_INVALID_DDP } from "./fixtures/doc/ddp.js";
import { createMockResponse, withStubbedReadFile } from "./helpers/http.js";
import { computeDocumentHash } from "../lib/doc/audit.js";

const projectRoot = process.cwd();
const templatesDir = path.join(projectRoot, "templates");
const originalReadFile = fs.readFile.bind(fs);

test("/api/documents/validate returns normalized payload for ddp", async () => {
  const readCalls = [];
  const res = createMockResponse();
  await withStubbedReadFile(fs, async (filePath, encoding) => {
    readCalls.push(filePath);
    return originalReadFile(filePath, encoding);
  }, async () => {
    await validateHandler(
      {
        method: "POST",
        query: { docType: "ddp" },
        body: { document: MINIMAL_VALID_DDP },
      },
      res
    );
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.docType, "ddp");
  const schemaPath = path.join(templatesDir, "doc-types", "ddp", "schema.json");
  assert(readCalls.some((entry) => entry === schemaPath));
});

test("/api/documents/validate propagates Ajv errors", async () => {
  const res = createMockResponse();
  await validateHandler(
    {
      method: "POST",
      query: { docType: "ddp" },
      body: { document: MINIMAL_INVALID_DDP },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert(Array.isArray(res.body?.errors));
  assert(res.body?.errors.length > 0);
  assert.equal(res.body?.normalized?.project_name, MINIMAL_INVALID_DDP.project_name);
});

test("/api/documents/validate rejects unsupported types", async () => {
  const res = createMockResponse();
  await validateHandler(
    {
      method: "POST",
      query: { docType: "roadmap" },
      body: { document: {} },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.error || "", /Validation is not available/);
});

test("/api/documents/render returns docx buffer for ddp and records audit", async () => {
  Docxtemplater.__setDocumentXmlFactory?.(() => "<w:document></w:document>");
  const readCalls = [];
  const res = createMockResponse();
  const analyticsEvents = [];
  const originalHook = globalThis.__analyticsHook__;
  globalThis.__analyticsHook__ = (event, payload) => {
    analyticsEvents.push({ event, payload });
  };
  const infoLogs = [];
  const originalInfo = console.info;
  console.info = (...args) => {
    infoLogs.push(args);
  };

  await withStubbedReadFile(fs, async (filePath, encoding) => {
    readCalls.push(filePath);
    return originalReadFile(filePath, encoding);
  }, async () => {
    await renderHandler(
      {
        method: "POST",
        query: { docType: "ddp" },
        body: {
          docType: "ddp",
          document: MINIMAL_VALID_DDP,
          docTypeDetection: { type: "ddp", confidence: 0.87 },
        },
      },
      res
    );
  });

  console.info = originalInfo;
  globalThis.__analyticsHook__ = originalHook;

  assert.equal(res.statusCode, 200);
  assert(Buffer.isBuffer(res.body));
  const docxPath = path.join(templatesDir, "doc-types", "ddp", "template.docx.b64");
  assert(readCalls.some((entry) => entry === docxPath));
  const disposition = res.headers["content-disposition"];
  assert.match(disposition, /design_development_plan\.docx/);
  const expectedHash = computeDocumentHash(res.body);
  assert(infoLogs.some((entry) => entry[0] === "[documents:audit]"));
  const auditEvent = analyticsEvents.find((entry) => entry.event === "documents.render");
  assert(auditEvent, "expected documents.render audit event");
  assert.equal(auditEvent.payload.fileHash, expectedHash);
  assert.equal(auditEvent.payload.detectedType, "ddp");
  assert.equal(auditEvent.payload.finalType, "ddp");
});

test("/api/documents/render surfaces validation failures", async () => {
  const res = createMockResponse();
  await renderHandler(
    {
      method: "POST",
      query: { docType: "ddp" },
      body: { document: MINIMAL_INVALID_DDP },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.error?.code || "", /invalid_ddp_payload/);
});

test("/api/documents/render rejects unsupported doc types", async () => {
  const res = createMockResponse();
  await renderHandler(
    {
      method: "POST",
      query: { docType: "unknown" },
      body: { document: {} },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.error || "", /Rendering is not available/);
});

test("/api/documents/render reports missing templates", async () => {
  __clearDocTemplateCache();
  const templatePath = path.join(templatesDir, "doc-types", "ddp", "template.docx.b64");
  const res = createMockResponse();
  await withStubbedReadFile(fs, async (filePath, encoding) => {
    if (filePath === templatePath) {
      const error = new Error("not found");
      error.code = "ENOENT";
      throw error;
    }
    return originalReadFile(filePath, encoding);
  }, async () => {
    await renderHandler(
      {
        method: "POST",
        query: { docType: "ddp" },
        body: { document: MINIMAL_VALID_DDP },
      },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body?.assetType, "docx template");
});

test("/api/documents/validate surfaces missing schema", async () => {
  __clearValidationCaches();
  const schemaPath = path.join(templatesDir, "doc-types", "ddp", "schema.json");
  const res = createMockResponse();
  await withStubbedReadFile(fs, async (filePath, encoding) => {
    if (filePath === schemaPath) {
      const error = new Error("not found");
      error.code = "ENOENT";
      throw error;
    }
    return originalReadFile(filePath, encoding);
  }, async () => {
    await validateHandler(
      {
        method: "POST",
        query: { docType: "ddp" },
        body: { document: MINIMAL_VALID_DDP },
      },
      res
    );
  });

  assert.equal(res.statusCode, 500);
  assert.equal(res.body?.assetType, "validation schema");
});

