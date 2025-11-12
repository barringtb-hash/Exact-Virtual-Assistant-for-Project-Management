import assert from "node:assert/strict";
import test from "node:test";

import { docApi } from "../src/lib/docApi.js";

test("docApi falls back when remote base responds with 401", async () => {
  const responses = [
    { status: 401, body: { error: "unauthorized" } },
    { status: 200, body: { ok: true } },
  ];
  let callIndex = 0;
  const fetchImpl = async () => {
    const { status, body } = responses[callIndex++] ?? { status: 500, body: {} };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  };

  const result = await docApi("validate", { foo: "bar" }, {
    fetchImpl,
    bases: ["https://remote.example/api", "/api/documents"],
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(callIndex, 2, "should attempt the next base after 401");
});

test("docApi surfaces error when every base returns unauthorized", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: "forbidden" }),
  });

  await assert.rejects(
    () => docApi("render", { foo: "bar" }, {
      fetchImpl,
      bases: ["https://remote.example/api"],
    }),
    (error) => {
      assert.equal(error?.status, 403);
      assert.deepEqual(error?.payload, { error: "forbidden" });
      return true;
    }
  );
});
