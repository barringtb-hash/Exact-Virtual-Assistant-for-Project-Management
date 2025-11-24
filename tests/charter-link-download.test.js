import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import makeLinkHandler from "../api/charter/make-link.js";
import downloadHandler, { formatHandlers } from "../api/charter/download.js";
import docMakeLinkHandler from "../api/documents/make-link.js";
import docDownloadHandler, {
  getFormatHandlersForDocType as getDocFormatHandlers,
} from "../api/documents/download.js";
import { computeDocumentHash } from "../lib/doc/audit.js";
import { MINIMAL_VALID_DDP as VALID_DDP } from "./fixtures/doc/ddp.js";

process.env.FILES_LINK_SECRET = process.env.FILES_LINK_SECRET || "unit-test-secret";

const VALID_CHARTER = {
  project_name: "AI Launch",
  sponsor: "Alice Example",
  project_lead: "Bob Example",
  start_date: "2024-01-01",
  end_date: "2024-12-31",
  vision: "Deliver an AI assistant to every PM team.",
  problem: "Teams lack a centralized intake workflow.",
  description: "Initial charter generated from unit tests.",
  scope_in: ["Research", "Pilot", "Rollout"],
  scope_out: ["Hardware procurement"],
  risks: ["Integration delays"],
  assumptions: ["Executive sponsorship confirmed"],
  milestones: [
    {
      phase: "Discovery",
      deliverable: "Pilot findings",
      date: "2024-04-15",
    },
  ],
  success_metrics: [
    {
      benefit: "Adoption",
      metric: "Department adoption rate",
      system_of_measurement: "percent",
    },
  ],
  core_team: [
    { name: "Sam", role: "Sponsor" },
    { name: "Taylor", role: "PM" },
  ],
};

function createResponseCollector() {
  return {
    statusCode: 200,
    sentAs: undefined,
    body: undefined,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.sentAs = "json";
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload) {
      this.sentAs = "buffer";
      this.body = payload;
      return this;
    },
  };
}

function normalizeFormatsPayload(payload) {
  const links = payload?.links || {};
  const entries = Object.entries(links).map(([format, href]) => ({ format, href }));
  return { ...payload, links, entries };
}

function decodeToken(token) {
  const padded = token.padEnd(token.length + ((4 - (token.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(json);
}

function buildSignature(format, token, secret) {
  return crypto.createHmac("sha256", secret).update(`${format}.${token}`).digest("hex");
}

test("make-link returns signed URLs for requested formats", async (t) => {
  const secret = process.env.FILES_LINK_SECRET;
  const req = {
    method: "POST",
    headers: { host: "example.test" },
    body: {
      charter: VALID_CHARTER,
      baseName: "AI Launch: Charter",
      formats: ["docx", "json"],
    },
  };
  const res = createResponseCollector();

  await makeLinkHandler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.sentAs, "json");
  const payload = normalizeFormatsPayload(res.body);
  assert.strictEqual(payload.docType, "charter");
  assert.ok(payload.links.docx, "docx link missing");
  assert.ok(payload.links.json, "json link missing");
  assert.ok(Number.isInteger(payload.expiresAt));
  assert.ok(Number.isInteger(payload.expiresInSeconds));

  for (const { format, href } of payload.entries) {
    const url = new URL(href);
    assert.strictEqual(url.hostname, "example.test");
    assert.strictEqual(url.pathname, "/api/charter/download");
    assert.strictEqual(url.searchParams.get("format"), format);
    const token = url.searchParams.get("token");
    const sig = url.searchParams.get("sig");
    assert.ok(token, `token missing for ${format}`);
    assert.ok(sig, `signature missing for ${format}`);
    assert.strictEqual(buildSignature(format, token, secret), sig);

    const tokenPayload = decodeToken(token);
    assert.strictEqual(tokenPayload.docType, "charter");
    assert.deepStrictEqual(tokenPayload.charter, VALID_CHARTER);
    assert.match(tokenPayload.filenameBase, /^AI_Launch_Charter/);
  }
});

test("download returns the requested charter format when signature is valid", async (t) => {
  const originalDocxRender = formatHandlers.docx.render;
  let renderCalls = 0;
  formatHandlers.docx.render = async () => {
    renderCalls += 1;
    return Buffer.from("docx:ok", "utf8");
  };
  t.after(() => {
    formatHandlers.docx.render = originalDocxRender;
  });

  const linkResponse = createResponseCollector();
  await makeLinkHandler(
    {
      method: "POST",
      headers: { host: "downloads.test" },
      body: {
        charter: VALID_CHARTER,
        baseName: "AI Launch",
        formats: ["docx"],
      },
    },
    linkResponse
  );

  const downloadUrl = new URL(linkResponse.body.links.docx);
  const req = {
    method: "GET",
    headers: { host: "downloads.test" },
    query: Object.fromEntries(downloadUrl.searchParams.entries()),
  };
  const res = createResponseCollector();

  await downloadHandler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.sentAs, "buffer");
  assert.ok(Buffer.isBuffer(res.body));
  assert.ok(res.body.equals(Buffer.from("docx:ok", "utf8")));
  assert.match(
    res.headers["content-type"],
    /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/
  );
  assert.match(res.headers["content-disposition"], /AI_Launch.*\.docx"?$/);
  assert.strictEqual(renderCalls, 1);
});

test("download streams the PDF export when the link is valid", async () => {
  const linkResponse = createResponseCollector();
  await makeLinkHandler(
    {
      method: "POST",
      headers: { host: "pdf-download.test" },
      body: {
        charter: VALID_CHARTER,
        baseName: "AI Launch",
        formats: ["pdf"],
      },
    },
    linkResponse
  );

  const downloadUrl = new URL(linkResponse.body.links.pdf);
  const req = {
    method: "GET",
    headers: { host: "pdf-download.test" },
    query: Object.fromEntries(downloadUrl.searchParams.entries()),
  };
  const res = createResponseCollector();

  await downloadHandler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.sentAs, "buffer");
  assert.ok(Buffer.isBuffer(res.body));
  assert.ok(res.body.length > 0, "PDF response should contain data");
  assert.match(res.headers["content-type"], /application\/pdf/);
  assert.match(res.headers["content-disposition"], /AI_Launch.*\.pdf"?$/);
});

test("download rejects expired tokens", async () => {
  const secret = process.env.FILES_LINK_SECRET;
  const expiredPayload = {
    charter: VALID_CHARTER,
    filenameBase: "Expired_Charter",
    exp: Math.floor(Date.now() / 1000) - 5,
  };
  const tokenJson = JSON.stringify(expiredPayload);
  const token = Buffer.from(tokenJson)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const signature = buildSignature("docx", token, secret);

  const res = createResponseCollector();
  await downloadHandler(
    {
      method: "GET",
      headers: { host: "expired.test" },
      query: { format: "docx", token, sig: signature },
    },
    res
  );

  assert.strictEqual(res.statusCode, 410);
  assert.strictEqual(res.body.error, "Download link expired");
});

test("download rejects unsupported formats", async () => {
  const secret = process.env.FILES_LINK_SECRET;
  const payload = {
    charter: VALID_CHARTER,
    filenameBase: "AI_Charter",
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  const token = Buffer.from(JSON.stringify(payload))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  const signature = buildSignature("csv", token, secret);

  const res = createResponseCollector();
  await downloadHandler(
    {
      method: "GET",
      headers: { host: "unsupported.test" },
      query: { format: "csv", token, sig: signature },
    },
    res
  );

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.body.error, "Unsupported format");
});

test("docx template validation errors are surfaced with details", async (t) => {
  const validationError = new Error("Charter payload failed validation.");
  validationError.name = "CharterValidationError";
  validationError.validationErrors = [
    { instancePath: "/project_name", message: "is required" },
  ];

  const originalDocxRender = formatHandlers.docx.render;
  formatHandlers.docx.render = async (charter) => {
    try {
      await originalDocxRender({ ...charter, project_name: "" });
      return Buffer.alloc(0);
    } catch (error) {
      throw error;
    }
  };
  t.after(() => {
    formatHandlers.docx.render = originalDocxRender;
  });

  const linkResponse = createResponseCollector();
  await makeLinkHandler(
    {
      method: "POST",
      headers: { host: "validation.test" },
      body: {
        charter: VALID_CHARTER,
        baseName: "AI Validation",
        formats: ["docx"],
      },
    },
    linkResponse
  );

  const url = new URL(linkResponse.body.links.docx);
  const req = {
    method: "GET",
    headers: { host: "validation.test" },
    query: Object.fromEntries(url.searchParams.entries()),
  };
  const res = createResponseCollector();

  await downloadHandler(req, res);

  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.sentAs, "json");
  assert.strictEqual(res.body.error.code, "invalid_charter_payload");
  assert.ok(Array.isArray(res.body.errors));
  assert.deepStrictEqual(res.body.errors[0].instancePath, "/project_name");
});

test("doc make-link filters unsupported formats per doc type", async () => {
  const req = {
    method: "POST",
    headers: { host: "doc-make-link.test" },
    query: { docType: "ddp" },
    body: {
      docType: "ddp",
      document: VALID_DDP,
      baseName: "DDP Outline",
      formats: ["docx", "pdf", "json"],
      docTypeDetection: { type: "ddp", confidence: 0.83 },
    },
  };
  const res = createResponseCollector();

  await docMakeLinkHandler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.sentAs, "json");
  const payload = normalizeFormatsPayload(res.body);
  assert.strictEqual(payload.docType, "ddp");
  assert.ok(payload.links.docx, "docx link missing for ddp");
  assert.ok(payload.links.json, "json link missing for ddp");
  assert.strictEqual(payload.links.pdf, undefined);
  assert.deepStrictEqual(Object.keys(payload.links).sort(), ["docx", "json"]);

  const secret = process.env.FILES_LINK_SECRET;
  for (const { format, href } of payload.entries) {
    const url = new URL(href);
    assert.strictEqual(url.hostname, "doc-make-link.test");
    assert.strictEqual(url.pathname, "/api/documents/download");
    assert.strictEqual(url.searchParams.get("format"), format);
    const token = url.searchParams.get("token");
    const sig = url.searchParams.get("sig");
    assert.ok(token, `token missing for ${format}`);
    assert.ok(sig, `signature missing for ${format}`);
    assert.strictEqual(buildSignature(format, token, secret), sig);

    const tokenPayload = decodeToken(token);
    assert.strictEqual(tokenPayload.docType, "ddp");
    assert.deepStrictEqual(tokenPayload.document, tokenPayload.ddp);
    assert.deepStrictEqual(tokenPayload.docTypeDetection, {
      type: "ddp",
      confidence: 0.83,
    });
    assert.strictEqual(tokenPayload.ddp.project_name, VALID_DDP.project_name);
  }
});

test("doc download returns the requested ddp format when signature is valid", async (t) => {
  const ddpHandlers = getDocFormatHandlers("ddp");
  const originalDocxRender = ddpHandlers.docx.render;
  let renderCalls = 0;
  ddpHandlers.docx.render = async () => {
    renderCalls += 1;
    return Buffer.from("ddp-docx", "utf8");
  };
  t.after(() => {
    ddpHandlers.docx.render = originalDocxRender;
  });

  const linkResponse = createResponseCollector();
  await docMakeLinkHandler(
    {
      method: "POST",
      headers: { host: "ddp-download.test" },
      query: { docType: "ddp" },
      body: {
        docType: "ddp",
        document: VALID_DDP,
        baseName: "DDP Delivery",
        formats: ["docx"],
        docTypeDetection: { type: "ddp", confidence: 0.76 },
      },
    },
    linkResponse
  );

  const downloadUrl = new URL(linkResponse.body.links.docx);
  const req = {
    method: "GET",
    headers: { host: "ddp-download.test" },
    query: Object.fromEntries(downloadUrl.searchParams.entries()),
  };
  const res = createResponseCollector();

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

  await docDownloadHandler(req, res);

  console.info = originalInfo;
  globalThis.__analyticsHook__ = originalHook;

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.sentAs, "buffer");
  assert.ok(Buffer.isBuffer(res.body));
  assert.ok(res.body.equals(Buffer.from("ddp-docx", "utf8")));
  assert.match(
    res.headers["content-type"],
    /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/
  );
  assert.match(res.headers["content-disposition"], /DDP_Delivery.*\.docx"?$/);
  assert.strictEqual(renderCalls, 1);

  const expectedHash = computeDocumentHash(res.body);
  assert(infoLogs.some((entry) => entry[0] === "[documents:audit]"));
  const auditEvent = analyticsEvents.find((entry) => entry.event === "documents.download");
  assert(auditEvent, "expected documents.download audit event");
  assert.equal(auditEvent.payload.fileHash, expectedHash);
  assert.equal(auditEvent.payload.detectedType, "ddp");
  assert.equal(auditEvent.payload.finalType, "ddp");
});
