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

async function withIntentFlag(value, run) {
  const original = process.env.INTENT_ONLY_EXTRACTION;
  try {
    if (typeof value === "undefined") {
      delete process.env.INTENT_ONLY_EXTRACTION;
    } else {
      process.env.INTENT_ONLY_EXTRACTION = value;
    }
    await run();
  } finally {
    if (typeof original === "undefined") {
      delete process.env.INTENT_ONLY_EXTRACTION;
    } else {
      process.env.INTENT_ONLY_EXTRACTION = original;
    }
  }
}

test("/api/documents/extract routes guided charter requests through the extraction tool", async () => {
  const res = createMockResponse();
  const analyticsEvents = [];
  const originalHook = globalThis.__analyticsHook__;
  globalThis.__analyticsHook__ = (event, payload) => {
    analyticsEvents.push({ event, payload });
  };

  const toolCalls = [];
  const previousOverrides = globalThis.__charterExtractionOverrides__;
  globalThis.__charterExtractionOverrides__ = {
    extractFieldsFromUtterance: async (request) => {
      toolCalls.push(request);
      return {
        ok: true,
        fields: { project_title: "Phoenix Initiative" },
        warnings: [],
        rawToolArguments: {},
      };
    },
  };

  await withIntentFlag("true", async () => {
    await withStubbedReadFile(
      fs,
      async () => {
        throw new Error("prompt assets should not load for guided extraction");
      },
      async () => {
        await extractHandler(
          {
            method: "POST",
            query: { docType: "charter" },
            body: {
              guided: true,
              docType: "charter",
              requestedFieldIds: [
                "project_title",
                "project_scope",
                "project_title",
              ],
              attachments: [
                {
                  name: "  Summary  ",
                  text: "  Project overview for stakeholders.  ",
                  mimeType: " text/plain ",
                },
                { text: "" },
              ],
              voice: [
                {
                  text: "  spoken context about launch  ",
                  timestamp: 1_700_000_000_000,
                  id: " voice-1 ",
                },
              ],
              messages: [
                { role: "assistant", content: "Previous summary." },
                {
                  role: "user",
                  text: "Project title is Phoenix Initiative with scope defined.",
                },
              ],
              seed: { existing: { value: "keep" } },
              intent: "create_charter",
              docTypeDetection: { type: "charter", confidence: 0.91 },
            },
          },
          res
        );
      }
    );
  });

  if (previousOverrides === undefined) {
    delete globalThis.__charterExtractionOverrides__;
  } else {
    globalThis.__charterExtractionOverrides__ = previousOverrides;
  }
  globalThis.__analyticsHook__ = originalHook;

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    status: "ok",
    fields: { project_title: "Phoenix Initiative" },
    warnings: [],
  });

  assert.equal(toolCalls.length, 1);
  const toolPayload = toolCalls[0];
  assert.deepEqual(toolPayload.requestedFieldIds, [
    "project_title",
    "project_scope",
  ]);
  assert.deepEqual(toolPayload.messages, [
    { role: "assistant", content: "Previous summary." },
    {
      role: "user",
      content: "Project title is Phoenix Initiative with scope defined.",
    },
  ]);
  assert.deepEqual(toolPayload.attachments, [
    {
      name: "Summary",
      text: "Project overview for stakeholders.",
      mimeType: "text/plain",
    },
  ]);
  assert.deepEqual(toolPayload.voice, [
    {
      id: "voice-1",
      text: "spoken context about launch",
      timestamp: 1_700_000_000_000,
    },
  ]);
  assert.deepEqual(toolPayload.seed, { existing: { value: "keep" } });

  const expectedHash = computeDocumentHash(res.body);
  const auditEvent = analyticsEvents.find((entry) => entry.event === "documents.extract");
  assert(auditEvent, "expected audit event for guided extraction");
  assert.equal(auditEvent.payload.fileHash, expectedHash);
  assert.equal(auditEvent.payload.finalType, "charter");
});

test("/api/documents/extract returns pending charter payload when warnings require confirmation", async () => {
  const res = createMockResponse();
  const analyticsEvents = [];
  const originalHook = globalThis.__analyticsHook__;
  globalThis.__analyticsHook__ = (event, payload) => {
    analyticsEvents.push({ event, payload });
  };

  const toolCalls = [];
  const previousOverrides = globalThis.__charterExtractionOverrides__;
  globalThis.__charterExtractionOverrides__ = {
    extractFieldsFromUtterance: async (request) => {
      toolCalls.push(request);
      return {
        ok: true,
        fields: {
          milestones: [
            { phase: "Planning", deliverable: "Kickoff", date: "2024-02-01" },
            { phase: "Execution" },
          ],
        },
        warnings: [
          {
            code: "validation_failed",
            message: "Target Date: Enter a valid date in YYYY-MM-DD format.",
            fieldId: "milestones",
            details: { child: "date", value: "bad-date" },
            level: "warning",
          },
        ],
        rawToolArguments: {
          milestones: [
            { phase: "Planning", deliverable: "Kickoff", date: "2024-02-01" },
            { phase: "Execution", deliverable: "", date: "bad-date" },
          ],
        },
      };
    },
  };

  await withIntentFlag("true", async () => {
    await extractHandler(
      {
        method: "POST",
        query: { docType: "charter" },
        body: {
          guided: true,
          docType: "charter",
          requestedFieldIds: ["milestones"],
          messages: [
            {
              role: "user",
              text: "Capture milestones including planning kickoff and execution without a finalized date.",
            },
          ],
          intent: "create_charter",
        },
      },
      res
    );
  });

  if (previousOverrides === undefined) {
    delete globalThis.__charterExtractionOverrides__;
  } else {
    globalThis.__charterExtractionOverrides__ = previousOverrides;
  }
  globalThis.__analyticsHook__ = originalHook;

  assert.equal(res.statusCode, 202);
  assert.equal(res.body?.status, "pending");
  assert.deepEqual(res.body?.pending, {
    fields: {
      milestones: [
        { phase: "Planning", deliverable: "Kickoff", date: "2024-02-01" },
        { phase: "Execution" },
      ],
    },
    warnings: [
      {
        code: "validation_failed",
        message: "Target Date: Enter a valid date in YYYY-MM-DD format.",
        fieldId: "milestones",
        details: { child: "date", value: "bad-date" },
        level: "warning",
      },
    ],
    arguments: {
      milestones: [
        { phase: "Planning", deliverable: "Kickoff", date: "2024-02-01" },
        { phase: "Execution", deliverable: "", date: "bad-date" },
      ],
    },
  });
  assert(!("fields" in (res.body || {})), "pending responses should omit confirmed fields");

  assert.equal(toolCalls.length, 1);
  const toolPayload = toolCalls[0];
  assert.deepEqual(toolPayload.requestedFieldIds, ["milestones"]);

  const expectedHash = computeDocumentHash(res.body);
  const auditEvent = analyticsEvents.find((entry) => entry.event === "documents.extract");
  assert(auditEvent, "expected audit event for pending extraction");
  assert.equal(auditEvent.payload.fileHash, expectedHash);
  assert.equal(auditEvent.payload.finalType, "charter");
  assert.equal(auditEvent.payload.status, "pending");
});

test("/api/documents/extract surfaces charter confirmation rejection without mutating drafts", async () => {
  const res = createMockResponse();
  const analyticsEvents = [];
  const originalHook = globalThis.__analyticsHook__;
  globalThis.__analyticsHook__ = (event, payload) => {
    analyticsEvents.push({ event, payload });
  };

  await withIntentFlag("true", async () => {
    await extractHandler(
      {
        method: "POST",
        query: { docType: "charter" },
        body: {
          guided: true,
          docType: "charter",
          guidedConfirmation: {
            decision: "reject",
            fields: {
              milestones: [
                { phase: "Planning", deliverable: "Kickoff", date: "2024-02-01" },
                { phase: "Execution" },
              ],
            },
            warnings: [
              {
                code: "validation_failed",
                message: "Target Date: Enter a valid date in YYYY-MM-DD format.",
                fieldId: "milestones",
                details: { child: "date", value: "bad-date" },
                level: "warning",
              },
            ],
            error: {
              code: "validation_failed",
              message: "Milestones still require a valid execution date before saving.",
            },
          },
          intent: "create_charter",
        },
      },
      res
    );
  });

  globalThis.__analyticsHook__ = originalHook;

  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.status, "error");
  assert.equal(res.body?.error?.code, "validation_failed");
  assert.equal(res.body?.error?.message, "Milestones still require a valid execution date before saving.");
  assert.deepEqual(res.body?.fields, {});
  assert.deepEqual(res.body?.warnings, [
    {
      code: "validation_failed",
      message: "Target Date: Enter a valid date in YYYY-MM-DD format.",
      fieldId: "milestones",
      details: { child: "date", value: "bad-date" },
      level: "warning",
    },
  ]);

  const expectedHash = computeDocumentHash(res.body);
  const auditEvent = analyticsEvents.find((entry) => entry.event === "documents.extract");
  assert(auditEvent, "expected audit event for confirmation rejection");
  assert.equal(auditEvent.payload.fileHash, expectedHash);
  assert.equal(auditEvent.payload.finalType, "charter");
  assert.equal(auditEvent.payload.status, "validation_failed");
});

test("/api/documents/extract surfaces charter tool errors for guided requests", async () => {
  const res = createMockResponse();
  const analyticsEvents = [];
  const originalHook = globalThis.__analyticsHook__;
  globalThis.__analyticsHook__ = (event, payload) => {
    analyticsEvents.push({ event, payload });
  };

  const previousOverrides = globalThis.__charterExtractionOverrides__;
  globalThis.__charterExtractionOverrides__ = {
    extractFieldsFromUtterance: async () => ({
      ok: false,
      error: {
        code: "missing_required",
        message: "The project title is required.",
        fields: ["project_title"],
      },
      warnings: [],
      fields: {},
      rawToolArguments: null,
    }),
  };

  await withIntentFlag("true", async () => {
    await withStubbedReadFile(
      fs,
      async () => {
        throw new Error("prompt assets should not load for guided extraction");
      },
      async () => {
        await extractHandler(
          {
            method: "POST",
            query: { docType: "charter" },
            body: {
              guided: true,
              docType: "charter",
              requestedFieldIds: ["project_title"],
              messages: [
                {
                  role: "user",
                  text: "Need to confirm the charter title and scope for Phoenix.",
                },
              ],
              intent: "create_charter",
            },
          },
          res
        );
      }
    );
  });

  if (previousOverrides === undefined) {
    delete globalThis.__charterExtractionOverrides__;
  } else {
    globalThis.__charterExtractionOverrides__ = previousOverrides;
  }
  globalThis.__analyticsHook__ = originalHook;

  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.status, "error");
  assert.equal(res.body?.error?.code, "missing_required");
  assert.deepEqual(res.body?.fields, {});
  assert(!("warnings" in (res.body || {})), "warnings should be omitted when empty");

  const expectedHash = computeDocumentHash(res.body);
  const auditEvent = analyticsEvents.find((entry) => entry.event === "documents.extract");
  assert(auditEvent, "expected audit event for guided error");
  assert.equal(auditEvent.payload.fileHash, expectedHash);
  assert.equal(auditEvent.payload.finalType, "charter");
});

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

  await withIntentFlag("true", async () => {
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
              messages: [
                {
                  role: "user",
                  text: "Please create a comprehensive project charter for the Phoenix initiative including goals and scope.",
                },
              ],
              docTypeDetection: { type: "charter", confidence: 0.92 },
              intent: "create_charter",
              intentSource: "user-provided",
              intentReason: "User triggered extraction",
            },
          },
          res
        );
      }
    );
  });

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
  assert.equal(auditEvent.payload.intent_source, "user-provided");
  assert.equal(auditEvent.payload.intent_reason, "User triggered extraction");
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

test("/api/documents/extract derives intent from the last user message", async () => {
  const res = createMockResponse();
  const analyticsEvents = [];
  const originalHook = globalThis.__analyticsHook__;
  globalThis.__analyticsHook__ = (event, payload) => {
    analyticsEvents.push({ event, payload });
  };

  await withIntentFlag("true", async () => {
    await extractHandler(
      {
        method: "POST",
        query: { docType: "charter" },
        body: {
          docType: "charter",
          attachments: [],
          messages: [
            {
              role: "user",
              text: "Can you draft a new project charter for the Apollo marketing launch with milestones?",
            },
          ],
        },
      },
      res
    );
  });

  globalThis.__analyticsHook__ = originalHook;

  assert.equal(res.statusCode, 200);
  const auditEvent = analyticsEvents.find((entry) => entry.event === "documents.extract");
  assert(auditEvent, "expected audit event for derived intent");
  assert.equal(auditEvent.payload.intent_source, "derived_last_user_message");
  assert.equal(auditEvent.payload.intent_reason, null);
});

test("/api/documents/extract skips charter requests without intent", async () => {
  const res = createMockResponse();
  const analyticsEvents = [];
  const originalHook = globalThis.__analyticsHook__;
  globalThis.__analyticsHook__ = (event, payload) => {
    analyticsEvents.push({ event, payload });
  };

  try {
    await withIntentFlag("true", async () => {
      await extractHandler(
        {
          method: "POST",
          query: { docType: "charter" },
          body: {
            docType: "charter",
            attachments: [],
            messages: [
              {
                role: "user",
                text: "Let's talk about our upcoming planning meeting agenda for next month in detail.",
              },
            ],
          },
        },
        res
      );
    });
  } finally {
    globalThis.__analyticsHook__ = originalHook;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.status, "skipped");
  assert.equal(res.body?.reason, "no_intent");
  assert.equal(analyticsEvents.length, 0);
});

test("/api/documents/extract returns skipped when detect flag is false", async () => {
  const res = createMockResponse();

  await withIntentFlag("true", async () => {
    await extractHandler(
      {
        method: "POST",
        query: { docType: "charter" },
        body: {
          docType: "charter",
          attachments: [],
          messages: [
            {
              role: "user",
              text: "Let's talk about our upcoming planning meeting agenda for next month in detail.",
            },
          ],
          detect: false,
        },
      },
      res
    );
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.status, "skipped");
  assert.equal(res.body?.reason, "no_intent");
});

test("/api/documents/extract enforces context guard even in legacy mode", async () => {
  const res = createMockResponse();
  const analyticsEvents = [];
  const originalHook = globalThis.__analyticsHook__;
  globalThis.__analyticsHook__ = (event, payload) => {
    analyticsEvents.push({ event, payload });
  };

  try {
    await withIntentFlag("false", async () => {
      await extractHandler(
        {
          method: "POST",
          query: { docType: "charter" },
          body: {
            docType: "charter",
            attachments: [],
            messages: [
              { role: "user", text: "Hi" },
            ],
            intent: "create_charter",
          },
        },
        res
      );
    });
  } finally {
    globalThis.__analyticsHook__ = originalHook;
  }

  assert.equal(res.statusCode, 422);
  assert.match(res.body?.error || "", /provide attachments/i);
  assert.equal(res.body?.code, "insufficient-context");
  assert.equal(analyticsEvents.length, 0);
});

test("/api/documents/extract allows legacy flow without intent when disabled", async () => {
  const res = createMockResponse();

  await withIntentFlag("false", async () => {
    await extractHandler(
      {
        method: "POST",
        query: { docType: "charter" },
        body: {
          docType: "charter",
          attachments: [],
          messages: [
            {
              role: "user",
              text: "Please prepare a detailed project charter for the Horizon initiative by Friday.",
            },
          ],
        },
      },
      res
    );
  });

  assert.equal(res.statusCode, 200);
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
