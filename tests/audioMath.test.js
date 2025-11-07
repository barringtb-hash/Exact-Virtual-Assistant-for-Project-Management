/**
---
scenario: AudioMath Test
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

/**
 * Unit tests for audio math utilities
 */

import { test } from "node:test";
import assert from "node:assert";
import { rmsToDb, dbToUnit, clamp } from "../src/audio/audioMath.ts";

test("clamp returns min when value is below min", () => {
  const result = clamp(-5, 0, 10);
  assert.strictEqual(result, 0);
});

test("clamp returns max when value is above max", () => {
  const result = clamp(15, 0, 10);
  assert.strictEqual(result, 10);
});

test("clamp returns value when within range", () => {
  const result = clamp(5, 0, 10);
  assert.strictEqual(result, 5);
});

test("rmsToDb floors silence to minimum dB", () => {
  const result = rmsToDb(0);
  assert.ok(result <= -100, `Expected ${result} to be <= -100`);
});

test("rmsToDb returns very low dB for near-zero RMS", () => {
  const result = rmsToDb(0.0001);
  assert.ok(result < -60, `Expected ${result} to be < -60`);
});

test("rmsToDb handles 1.0 RMS (full scale)", () => {
  const result = rmsToDb(1.0);
  assert.strictEqual(result, 0);
});

test("rmsToDb handles 0.5 RMS", () => {
  const result = rmsToDb(0.5);
  // 20 * log10(0.5) ≈ -6.02 dB
  assert.ok(result > -7 && result < -5, `Expected ${result} to be around -6 dB`);
});

test("rmsToDb respects custom floor", () => {
  const result = rmsToDb(0, -80);
  assert.ok(result <= -80, `Expected ${result} to be <= -80`);
});

test("dbToUnit maps floor to 0", () => {
  const result = dbToUnit(-100, -100);
  assert.strictEqual(result, 0);
});

test("dbToUnit maps 0 dBFS to 1", () => {
  const result = dbToUnit(0, -100);
  assert.strictEqual(result, 1);
});

test("dbToUnit maps -50 dB to 0.5 (midpoint)", () => {
  const result = dbToUnit(-50, -100);
  assert.strictEqual(result, 0.5);
});

test("dbToUnit handles custom floor", () => {
  const result = dbToUnit(-40, -80);
  assert.strictEqual(result, 0.5); // -40 is halfway between -80 and 0
});

test("dbToUnit clamps values below floor to 0", () => {
  const result = dbToUnit(-150, -100);
  assert.strictEqual(result, 0);
});

test("dbToUnit clamps values above 0 to 1", () => {
  const result = dbToUnit(10, -100);
  assert.strictEqual(result, 1);
});

test("rmsToDb and dbToUnit conversion maintains consistent mapping", () => {
  // Note: RMS → dB → unit is NOT a round-trip because dB is logarithmic
  // This test verifies the conversion chain is consistent
  const testValues = [
    { rms: 0.1, expectedUnit: 0.8 },   // -20 dB → 80% of range
    { rms: 0.5, expectedUnit: 0.94 },  // ~-6 dB → 94% of range
    { rms: 1.0, expectedUnit: 1.0 }    // 0 dB → 100%
  ];

  testValues.forEach(({ rms, expectedUnit }) => {
    const db = rmsToDb(rms);
    const unitValue = dbToUnit(db);
    // Allow for small floating-point errors
    assert.ok(
      Math.abs(unitValue - expectedUnit) < 0.01,
      `Conversion failed for RMS ${rms}: expected ${expectedUnit}, got ${unitValue} (${db} dB)`
    );
  });
});
