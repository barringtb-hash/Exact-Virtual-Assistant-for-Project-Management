/**
---
scenario: Api Chat Test
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
import { EventEmitter } from "node:events";

import { createMockResponse } from "./helpers/http.js";
import { clearStreamControllers } from "../api/chat/streamingState.js";

const originalChatModel = process.env.CHAT_MODEL;
process.env.CHAT_MODEL = "gpt-3.5-turbo";
const originalApiKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "test-key";

const chatModule = await import("../api/chat.js");
const handler = chatModule.default;
const { __setOpenAIClient } = chatModule;

const originalFetch = globalThis.fetch;

test.after(() => {
  if (originalChatModel == null) {
    delete process.env.CHAT_MODEL;
  } else {
    process.env.CHAT_MODEL = originalChatModel;
  }
  if (originalApiKey == null) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test.afterEach(() => {
  __setOpenAIClient(null);
  clearStreamControllers();
  globalThis.fetch = originalFetch;
});

function createStreamingRequest(body) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { method: "POST", body });
}

function createStreamingResponse() {
  const emitter = new EventEmitter();
  const res = {
    statusCode: 200,
    headers: Object.create(null),
    written: [],
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    write(chunk) {
      const text =
        typeof chunk === "string"
          ? chunk
          : typeof chunk === "object" && chunk !== null
          ? chunk.toString()
          : String(chunk ?? "");
      this.written.push(text);
      emitter.emit("write", text);
    },
    end(chunk) {
      if (typeof chunk !== "undefined") {
        this.write(chunk);
      }
      this.ended = true;
      emitter.emit("close");
      return this;
    },
    on: emitter.on.bind(emitter),
    off: emitter.off ? emitter.off.bind(emitter) : undefined,
    removeListener: emitter.removeListener.bind(emitter),
    flushHeaders() {},
  };
  return res;
}

test("/api/chat returns JSON reply when stream disabled", async () => {
  class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async () => ({
            choices: [{ message: { content: "Hello there" } }],
          }),
        },
      };
      this.responses = {
        create: async () => ({ output_text: "Hello there" }),
      };
    }
  }

  __setOpenAIClient(MockOpenAI);
  const req = { method: "POST", body: { messages: [{ role: "user", content: "Hi" }] } };
  const res = createMockResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.reply, "Hello there");
});

test("/api/chat streams token events when stream is true", async () => {
  class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async () => ({
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: "Hello" } }] };
              yield {
                choices: [
                  {
                    delta: { content: " world" },
                    finish_reason: "stop",
                  },
                ],
              };
            },
          }),
        },
      };
      this.responses = { create: async () => ({}) };
    }
  }

  __setOpenAIClient(MockOpenAI);

  const req = createStreamingRequest({
    stream: true,
    clientStreamId: "stream-1",
    threadId: "thread-1",
    messages: [{ role: "user", content: "Hi" }],
  });
  const res = createStreamingResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert(res.ended, "expected stream to end");
  const tokenEvents = res.written.filter((chunk) => chunk.startsWith("event: token"));
  assert.equal(tokenEvents.length, 2, "expected two token events");
  assert(tokenEvents[0].includes('"delta":"Hello"'));
  assert(tokenEvents[1].includes('"delta":" world"'));
  const doneEvents = res.written.filter((chunk) => chunk.startsWith("event: done"));
  assert.equal(doneEvents.length, 1, "expected done event");
});

test("/api/chat aborts previous stream for matching thread", async () => {
  let callCount = 0;
  let firstStreamSignal;
  let firstStreamStartedResolve;
  const firstStreamStarted = new Promise((resolve) => {
    firstStreamStartedResolve = resolve;
  });

  class MockOpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (_payload, options) => {
            callCount += 1;
            if (callCount === 1) {
              firstStreamSignal = options?.signal;
              firstStreamStartedResolve?.();
              return {
                async *[Symbol.asyncIterator]() {
                  await new Promise((_, reject) => {
                    const signal = firstStreamSignal;
                    const abortHandler = () => {
                      const abortError = new Error("Aborted");
                      abortError.name = "AbortError";
                      reject(abortError);
                    };
                    if (signal?.aborted) {
                      abortHandler();
                      return;
                    }
                    signal?.addEventListener("abort", abortHandler, { once: true });
                  });
                },
              };
            }

            return {
              async *[Symbol.asyncIterator]() {
                yield {
                  choices: [
                    {
                      delta: { content: "Second" },
                      finish_reason: "stop",
                    },
                  ],
                };
              },
            };
          },
        },
      };
      this.responses = { create: async () => ({}) };
    }
  }

  __setOpenAIClient(MockOpenAI);

  const firstReq = createStreamingRequest({
    stream: true,
    clientStreamId: "client-a",
    threadId: "thread-1",
    messages: [{ role: "user", content: "First" }],
  });
  const firstRes = createStreamingResponse();

  const firstPromise = handler(firstReq, firstRes);
  await firstStreamStarted;

  const secondReq = createStreamingRequest({
    stream: true,
    clientStreamId: "client-b",
    threadId: "thread-1",
    messages: [{ role: "user", content: "Second" }],
  });
  const secondRes = createStreamingResponse();

  await handler(secondReq, secondRes);
  await firstPromise;

  assert(firstRes.written.some((chunk) => chunk.startsWith("event: aborted")),
    "expected first stream to emit aborted event");
  assert(secondRes.written.some((chunk) => chunk.startsWith("event: done")),
    "expected second stream to complete");
});
