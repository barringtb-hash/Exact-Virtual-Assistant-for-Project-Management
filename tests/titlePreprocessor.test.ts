import assert from "node:assert/strict";
import test from "node:test";

import { getTitleCandidate } from "../src/features/charter/titlePreprocessor.ts";

test("getTitleCandidate prefers quoted titles", () => {
  const result = getTitleCandidate('The project is called "Onko Liquid Expansion" and will run next quarter.');
  assert.equal(result, "Onko Liquid Expansion");
});

test("getTitleCandidate extracts named phrases", () => {
  const result = getTitleCandidate("Our title is Phoenix Migration wave one.");
  assert.equal(result, "Phoenix Migration wave one");
});

test("getTitleCandidate falls back to first sentence", () => {
  const result = getTitleCandidate(
    "Launch analytics platform overhaul. It will consolidate tooling and improve reporting across regions."
  );
  assert.equal(result, "Launch analytics platform overhaul");
});

test("getTitleCandidate enforces max length", () => {
  const input = "Apollo".padEnd(200, " mission");
  const result = getTitleCandidate(input, 20);
  assert(result.length <= 20);
});

test("getTitleCandidate returns empty string for non-string input", () => {
  // @ts-expect-error – intentional invalid input
  const result = getTitleCandidate(null);
  assert.equal(result, "");
});
