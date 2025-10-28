import { Buffer } from "node:buffer";
import { test, mock } from "node:test";
import assert from "node:assert/strict";

function createResponseCollector() {
  return {
    statusCode: null,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test(
  "chat handler executes proposed actions and summarizes results",
  { concurrency: false },
  async (t) => {
  const originalModel = process.env.CHAT_MODEL;
  process.env.CHAT_MODEL = "gpt-3.5-turbo";

  const completionPayload = {
    id: "chatcmpl-123",
    choices: [
      {
        message: {
          content: [{ text: "Assistant reply" }],
        },
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "propose_actions",
              arguments: JSON.stringify({
                operationId: "op-abc",
                actions: [
                  {
                    action: "charter.extract",
                    label: "Extract charter",
                    payload: { documentId: "doc-1" },
                    executeNow: true,
                  },
                  {
                    action: "charter.validate",
                    payload: { charter: { title: "Draft" } },
                    executeNow: true,
                  },
                  {
                    action: "charter.render",
                    payload: {
                      charter: { title: "Validated" },
                      file: {
                        filename: "Validated Charter.docx",
                        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                      },
                    },
                    executeNow: true,
                  },
                ],
              }),
            },
          },
        ],
      },
    ],
  };

  const createStub = mock.fn(async () => completionPayload);

  class FakeOpenAI {
    constructor() {
      this.chat = { completions: { create: createStub } };
      this.responses = { create: mock.fn(async () => {
        throw new Error("responses.create should not be called in tests");
      }) };
    }
  }

  globalThis.__OPENAI_MOCK_FACTORY__ = () => new FakeOpenAI();

  const [{ default: handler }, { ACTIONS }] = await Promise.all([
    import("../../api/chat.js"),
    import("../../api/_actions/registry.js"),
  ]);

  const charterPayloads = [];
  const executors = {
    "charter.extract": mock.fn(async () => ({
      charter: { title: "Extracted Charter" },
    })),
    "charter.validate": mock.fn(async () => ({
      charter: { title: "Validated Charter" },
      status: "valid",
    })),
    "charter.render": mock.fn(async () => {
      const buffer = Buffer.from("rendered-docx");
      return {
        buffer,
        filename: "Validated Charter.docx",
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        charter: { title: "Rendered Charter" },
      };
    }),
  };

  const getMock = mock.method(ACTIONS, "get", (name) => {
    const executor = executors[name];
    if (executor) {
      return async (args) => {
        if (args?.charter) {
          charterPayloads.push(args.charter);
        }
        return executor(args);
      };
    }
    return undefined;
  });

  t.after(() => {
    delete process.env.CHAT_MODEL;
    delete globalThis.__OPENAI_MOCK_FACTORY__;
    mock.restoreAll();
    if (originalModel === undefined) {
      delete process.env.CHAT_MODEL;
    } else {
      process.env.CHAT_MODEL = originalModel;
    }
  });

  const req = {
    method: "POST",
    headers: { host: "example.test" },
    body: {
      messages: [{ role: "user", content: "Hello" }],
      execute: true,
    },
    query: {},
  };
  const res = createResponseCollector();

  await handler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.reply, "Assistant reply");
  assert.deepStrictEqual(res.body.operationId, "op-abc");
  assert.strictEqual(createStub.mock.callCount(), 1);

  assert.deepStrictEqual(res.body.actions, [
    {
      action: "charter.extract",
      executeNow: true,
      label: "Extract charter",
      payload: { documentId: "doc-1" },
    },
    {
      action: "charter.validate",
      executeNow: true,
      payload: { charter: { title: "Draft" } },
    },
    {
      action: "charter.render",
      executeNow: true,
      payload: {
        charter: { title: "Validated" },
        file: {
          filename: "Validated Charter.docx",
          mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      },
    },
  ]);

  assert.strictEqual(res.body.executed.length, 3);

  const renderExecution = res.body.executed.find(
    (entry) => entry.action === "charter.render"
  );
  assert.ok(renderExecution, "charter.render execution missing");
  assert.deepStrictEqual(renderExecution.status, "ok");
  assert.deepStrictEqual(renderExecution.ok, true);
  assert.deepStrictEqual(renderExecution.result, {
    buffer: { byteLength: Buffer.byteLength("rendered-docx") },
    filename: "Validated Charter.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    charter: { title: "Rendered Charter" },
  });

  const validateExecution = res.body.executed.find(
    (entry) => entry.action === "charter.validate"
  );
  assert.deepStrictEqual(validateExecution.result, {
    charter: { title: "Validated Charter" },
    status: "valid",
  });

  assert.strictEqual(charterPayloads.length >= 1, true);

  assert.strictEqual(getMock.mock.callCount(), 3);
  }
);

test(
  "chat handler captures execution failures",
  { concurrency: false },
  async (t) => {
  const originalModel = process.env.CHAT_MODEL;
  process.env.CHAT_MODEL = "gpt-3.5-turbo";

  const completionPayload = {
    choices: [
      {
        message: {
          content: [{ text: "Assistant reply" }],
        },
        tool_calls: [
          {
            type: "function",
            function: {
              name: "propose_actions",
              arguments: JSON.stringify({
                actions: [
                  { action: "charter.extract", executeNow: true },
                  { action: "charter.validate", executeNow: true },
                ],
              }),
            },
          },
        ],
      },
    ],
  };

  const createStub = mock.fn(async () => completionPayload);

  class FakeOpenAI {
    constructor() {
      this.chat = { completions: { create: createStub } };
      this.responses = { create: mock.fn(async () => {
        throw new Error("responses.create should not be called in tests");
      }) };
    }
  }

  globalThis.__OPENAI_MOCK_FACTORY__ = () => new FakeOpenAI();

  const [{ default: handler }, { ACTIONS }] = await Promise.all([
    import("../../api/chat.js"),
    import("../../api/_actions/registry.js"),
  ]);

  const executors = {
    "charter.extract": mock.fn(async () => ({ charter: { title: "Extracted" } })),
    "charter.validate": mock.fn(async () => {
      throw new Error("Validation failed");
    }),
  };

  const getMock = mock.method(ACTIONS, "get", (name) => executors[name]);

  t.after(() => {
    delete process.env.CHAT_MODEL;
    delete globalThis.__OPENAI_MOCK_FACTORY__;
    mock.restoreAll();
    if (originalModel === undefined) {
      delete process.env.CHAT_MODEL;
    } else {
      process.env.CHAT_MODEL = originalModel;
    }
  });

  const req = {
    method: "POST",
    headers: { host: "errors.test" },
    body: {
      messages: [{ role: "user", content: "Test" }],
      execute: true,
    },
    query: {},
  };
  const res = createResponseCollector();

  await handler(req, res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.reply, "Assistant reply");
  assert.strictEqual(createStub.mock.callCount(), 1);

  const executed = res.body.executed;
  assert.strictEqual(executed.length, 2);

  const successEntry = executed.find((entry) => entry.action === "charter.extract");
  assert.deepStrictEqual(successEntry.status, "ok");
  assert.deepStrictEqual(successEntry.ok, true);

  const errorEntry = executed.find((entry) => entry.action === "charter.validate");
  assert.deepStrictEqual(errorEntry.status, "error");
  assert.deepStrictEqual(errorEntry.ok, false);
  assert.match(errorEntry.error, /Validation failed/);
  }
);
