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

test("docApi throws a descriptive error when a JSON response is unavailable", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected token ");
    },
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : undefined;
      },
    },
  });

  await assert.rejects(
    () =>
      docApi("render", { foo: "bar" }, {
        fetchImpl,
        bases: ["https://remote.example/api"],
      }),
    (error) => {
      assert.equal(error?.status, 200);
      assert.equal(
        error?.payload?.error?.message,
        "https://remote.example/api/render returned a non-JSON response."
      );
      assert.equal(
        error?.payload?.error?.contentType,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      assert.equal(error?.code, "DOC_API_RESPONSE_NOT_JSON");
      assert.equal(error?.endpoint, "https://remote.example/api/render");
      assert.ok(error?.cause instanceof SyntaxError);
      return true;
    }
  );
});
