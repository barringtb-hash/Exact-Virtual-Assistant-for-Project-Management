import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { promises as fs } from "fs";

import Docxtemplater from "docxtemplater";

import extractHandler from "../api/doc/extract.js";
import validateHandler from "../api/doc/validate.js";
import renderHandler, { __clearDocTemplateCache } from "../api/doc/render.js";
import { __clearValidationCaches } from "../lib/doc/validation.js";
import { MINIMAL_VALID_DDP, MINIMAL_INVALID_DDP } from "./fixtures/doc/ddp.js";

const projectRoot = process.cwd();
const templatesDir = path.join(projectRoot, "templates");
const originalReadFile = fs.readFile.bind(fs);

function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: Object.create(null),
    body: undefined,
    sentJson: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    json(payload) {
      this.sentJson = true;
      this.body = payload;
      if (!this.headers["content-type"]) {
        this.setHeader("content-type", "application/json");
      }
      return this;
    },
    send(payload) {
      this.sentJson = false;
      this.body = payload;
      if (Buffer.isBuffer(payload)) {
        if (!this.headers["content-type"]) {
          this.setHeader(
            "content-type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          );
        }
      }
      return this;
    },
  };
  return res;
}

async function withStubbedReadFile(override, run) {
  const previous = fs.readFile;
  fs.readFile = override;
  try {
    await run();
  } finally {
    fs.readFile = previous;
  }
}

test("/api/doc/extract falls back to charter prompt and loads metadata", async () => {
  const promptCalls = [];
  const res = createMockResponse();
  await withStubbedReadFile(async (filePath, encoding) => {
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
  }, async () => {
    await extractHandler(
      {
        method: "POST",
        query: { docType: "charter" },
        body: { docType: "charter", attachments: [], messages: [] },
      },
      res
    );
  });

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
});

test("/api/doc/extract loads ddp assets first", async () => {
  const readCalls = [];
  const res = createMockResponse();
  await withStubbedReadFile(async (filePath, encoding) => {
    readCalls.push(filePath);
    return originalReadFile(filePath, encoding);
  }, async () => {
    await extractHandler(
      {
        method: "POST",
        query: { docType: "ddp" },
        body: { docType: "ddp", attachments: [], messages: [] },
      },
      res
    );
  });

  assert.equal(res.statusCode, 200);
  const ddpPromptPath = path.join(templatesDir, "doc-types", "ddp", "extract_prompt.txt");
  assert(readCalls.some((entry) => entry === ddpPromptPath));
  const metadataPath = path.join(templatesDir, "doc-types", "ddp", "metadata.json");
  assert(readCalls.some((entry) => entry === metadataPath));
});

test("/api/doc/extract rejects unsupported doc types", async () => {
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

test("/api/doc/validate returns normalized payload for ddp", async () => {
  const readCalls = [];
  const res = createMockResponse();
  await withStubbedReadFile(async (filePath, encoding) => {
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

test("/api/doc/validate propagates Ajv errors", async () => {
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

test("/api/doc/validate rejects unsupported types", async () => {
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

test("/api/doc/render returns docx buffer for ddp", async () => {
  Docxtemplater.__setDocumentXmlFactory?.(() => "<w:document></w:document>");
  const readCalls = [];
  const res = createMockResponse();
  await withStubbedReadFile(async (filePath, encoding) => {
    readCalls.push(filePath);
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

  assert.equal(res.statusCode, 200);
  assert(Buffer.isBuffer(res.body));
  const docxPath = path.join(templatesDir, "doc-types", "ddp", "template.docx.b64");
  assert(readCalls.some((entry) => entry === docxPath));
  const disposition = res.headers["content-disposition"];
  assert.match(disposition, /design_development_plan\.docx/);
  const parsed = JSON.parse(res.body.toString("utf8"));
  assert.equal(parsed.project_name, MINIMAL_VALID_DDP.project_name);
});

test("/api/doc/render surfaces validation failures", async () => {
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

test("/api/doc/render rejects unsupported doc types", async () => {
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

test("/api/doc/render reports missing templates", async () => {
  __clearDocTemplateCache();
  const templatePath = path.join(templatesDir, "doc-types", "ddp", "template.docx.b64");
  const res = createMockResponse();
  await withStubbedReadFile(async (filePath, encoding) => {
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

test("/api/doc/validate surfaces missing schema", async () => {
  __clearValidationCaches();
  const schemaPath = path.join(templatesDir, "doc-types", "ddp", "schema.json");
  const res = createMockResponse();
  await withStubbedReadFile(async (filePath, encoding) => {
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

