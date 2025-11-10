import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { isValidSignature } from "../api/documents/download.js";

const SECRET = "unit-secret";
const FORMAT = "json";
const TOKEN = "abc.def";

function createSignature(format, token, secret) {
  return crypto.createHmac("sha256", secret).update(`${format}.${token}`).digest("hex");
}

test("isValidSignature returns true for untampered signatures", () => {
  const signature = createSignature(FORMAT, TOKEN, SECRET);
  assert.equal(isValidSignature(FORMAT, TOKEN, signature, SECRET), true);
});

test("isValidSignature rejects altered signatures", () => {
  const signature = createSignature(FORMAT, TOKEN, SECRET);
  const tampered = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
  assert.equal(isValidSignature(FORMAT, TOKEN, tampered, SECRET), false);
});

test("isValidSignature rejects signatures with invalid length", () => {
  const signature = createSignature(FORMAT, TOKEN, SECRET);
  assert.equal(isValidSignature(FORMAT, TOKEN, signature + "0", SECRET), false);
});

test("isValidSignature rejects non-hex signatures", () => {
  const signature = createSignature(FORMAT, TOKEN, SECRET);
  const invalid = `${signature.slice(0, -1)}z`;
  assert.equal(isValidSignature(FORMAT, TOKEN, invalid, SECRET), false);
});
