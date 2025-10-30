import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promises as fs } from "node:fs";

import extractHandler from "../api/documents/extract.js";
import { computeDocumentHash } from "../lib/doc/audit.js";
import { createMockResponse, withStubbedReadFile } from "./helpers/http.js";

const projectRoot = process.cwd();
const templatesDir = path.join(projectRoot, "templates");
const originalReadFile = fs.readFile.bind(fs);

test("/api/documents/extract returns charter payload and records audit metadata", async () => {
  const promptCalls = [];
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

  await withStubbedReadFile(
    fs,
    async (filePath, encoding) => {
      if (encoding !== "utf8") {
        return originalReadFile(filePath, encoding);
      }
      promptCalls.push(filePath);
      if (filePath.endsWith(path.join("charter", "extract_prompt.txt"))) {
        const error = new Error("not found");
        error.code = "ENOENT";
        throw error;
      }
      if (filePath.endsWith("extract_prompt.charter.txt")) {
        const error = new Error("not found");
        error.code = "ENOENT";
        throw error;
      }
      if (filePath.endsWith("extract_prompt.txt")) {
        return "Charter fallback prompt";
      }
      if (filePath.endsWith(path.join("charter", "metadata.json"))) {
        return JSON.stringify({ label: "Charter" });
      }
      return originalReadFile(filePath, encoding);
    },
    async () => {
      await extractHandler(
        {
          method: "POST",
          query: { docType: "charter" },
          body: {
            docType: "charter",
            attachments: [],
            messages: [],
            docTypeDetection: { type: "charter", confidence: 0.92 },
          },
        },
        res
      );
    }
  );

  console.info = originalInfo;
  globalThis.__analyticsHook__ = originalHook;

  assert.equal(res.statusCode, 200);
  const expectedPromptPaths = [
    path.join(templatesDir, "doc-types", "charter", "extract_prompt.txt"),
    path.join(templatesDir, "extract_prompt.charter.txt"),
    path.join(templatesDir, "extract_prompt.txt"),
  ];
  assert.deepEqual(
    promptCalls.filter((entry) => entry.includes("extract_prompt")),
    expectedPromptPaths
  );

  const expectedHash = computeDocumentHash(res.body);
  assert(infoLogs.some((entry) => entry[0] === "[documents:audit]"));
  const auditEvent = analyticsEvents.find((entry) => entry.event === "documents.extract");
  assert(auditEvent, "expected documents.extract audit event");
  assert.equal(auditEvent.payload.fileHash, expectedHash);
  assert.equal(auditEvent.payload.detectedType, "charter");
  assert.equal(auditEvent.payload.finalType, "charter");
});

test("/api/documents/extract prefers ddp assets when requested", async () => {
  const readCalls = [];
  const res = createMockResponse();
  await withStubbedReadFile(
    fs,
    async (filePath, encoding) => {
      readCalls.push(filePath);
      return originalReadFile(filePath, encoding);
    },
    async () => {
      await extractHandler(
        {
          method: "POST",
          query: { docType: "ddp" },
          body: { docType: "ddp", attachments: [], messages: [] },
        },
        res
      );
    }
  );

  assert.equal(res.statusCode, 200);
  const ddpPromptPath = path.join(templatesDir, "doc-types", "ddp", "extract_prompt.txt");
  assert(readCalls.some((entry) => entry === ddpPromptPath));
  const metadataPath = path.join(templatesDir, "doc-types", "ddp", "metadata.json");
  assert(readCalls.some((entry) => entry === metadataPath));
});

test("/api/documents/extract rejects unsupported doc types", async () => {
  const res = createMockResponse();
  await extractHandler(
    {
      method: "POST",
      query: { docType: "unknown" },
      body: { docType: "unknown" },
    },
    res
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.error || "", /Extraction is not available/);
});
