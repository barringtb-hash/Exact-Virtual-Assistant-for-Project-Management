import { test } from "node:test";
import assert from "node:assert/strict";

import { ACTIONS } from "../../../api/_actions/registry.js";

test("charter.extract posts JSON to the forwarded base URL", async () => {
  const responses = { outcome: "extracted" };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          if (name.toLowerCase() === "content-type") {
            return "application/json";
          }
          return null;
        },
      },
      json: async () => responses,
    };
  };

  const req = {
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "api.example.test",
    },
  };

  const result = await ACTIONS.get("charter.extract")({
    req,
    body: { key: "value" },
    fetch: fetchImpl,
  });

  assert.deepStrictEqual(result, responses);
  assert.strictEqual(calls.length, 1);
  const [call] = calls;
  assert.strictEqual(call.url, "https://api.example.test/api/charter/extract");
  assert.strictEqual(call.options.method, "POST");
  assert.strictEqual(call.options.headers["Content-Type"], "application/json");
  assert.deepStrictEqual(JSON.parse(call.options.body), { key: "value" });
});

test("charter.validate forwards payloads and surfaces response errors", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      headers: {
        get() {
          return null;
        },
      },
      text: async () => "{\"error\":true}",
    };
  };

  const req = {
    headers: {
      host: "fallback.example.test",
      "x-forwarded-proto": "http",
    },
  };

  const action = ACTIONS.get("charter.validate");
  await assert.rejects(
    () =>
      action({
        req,
        payload: { should: "forward" },
        fetch: fetchImpl,
      }),
    (error) => {
      assert.strictEqual(error.status, 422);
      assert.strictEqual(error.statusText, "Unprocessable Entity");
      assert.match(
        error.message,
        /POST http:\/\/fallback\.example\.test\/api\/charter\/validate failed/
      );
      assert.strictEqual(error.body, '{"error":true}');
      return true;
    }
  );

  assert.strictEqual(calls.length, 1);
  const [call] = calls;
  assert.strictEqual(call.url, "http://fallback.example.test/api/charter/validate");
  assert.deepStrictEqual(JSON.parse(call.options.body), { should: "forward" });
});

test("charter.render returns buffer metadata from the response", async () => {
  const collected = [];
  const binary = Buffer.from("rendered-docx");
  const fetchImpl = async (url, options) => {
    collected.push({ url, options });
    const arrayBuffer = binary.buffer.slice(
      binary.byteOffset,
      binary.byteOffset + binary.byteLength
    );
    return {
      ok: true,
      status: 200,
      headers: {
        get(name) {
          if (name.toLowerCase() === "content-type") {
            return "application/vnd.ms-word";
          }
          if (name.toLowerCase() === "content-disposition") {
            return "attachment; filename*=UTF-8''custom%20file.docx";
          }
          return null;
        },
      },
      arrayBuffer: async () => arrayBuffer,
    };
  };

  const req = {
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "files.example.test",
    },
  };

  const result = await ACTIONS.get("charter.render")({
    req,
    charter: { title: "Doc" },
    fetch: fetchImpl,
  });

  assert.strictEqual(collected.length, 1);
  const [call] = collected;
  assert.strictEqual(call.url, "https://files.example.test/api/charter/render");
  assert.deepStrictEqual(JSON.parse(call.options.body), { title: "Doc" });
  assert.strictEqual(call.options.headers["Content-Type"], "application/json");
  assert.ok(Buffer.isBuffer(result.buffer));
  assert.deepStrictEqual(result.buffer, binary);
  assert.strictEqual(result.mime, "application/vnd.ms-word");
  assert.strictEqual(result.filename, "custom file.docx");
});
