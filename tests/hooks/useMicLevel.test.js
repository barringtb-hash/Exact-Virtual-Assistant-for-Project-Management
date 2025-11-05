import assert from "node:assert/strict";
import test from "node:test";
import { act, renderHook } from "@testing-library/react";

import { installDomEnvironment } from "../helpers/domEnvironment.js";
import { useMicLevel } from "../../src/hooks/useMicLevel.ts";
import { levelStreamFactory } from "../../src/hooks/levelStreamFactory.ts";

function prepareDomEnvironment(t) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: globalThis.navigator ?? {},
  });

  const env = installDomEnvironment();
  t.after(env.cleanup);
  return env;
}

test("useMicLevel start/stop cycles tear down audio resources", async (t) => {
  prepareDomEnvironment(t);

  const levelCallbacks = [];
  const teardownMocks = [];
  const trackStops = [];

  const makeLevelStreamMock = t.mock.method(
    levelStreamFactory,
    "create",
    (stream, onLevel) => {
      levelCallbacks.push(onLevel);
      const teardown = t.mock.fn(() => {});
      teardownMocks.push(teardown);
      return { teardown };
    },
  );
  t.after(() => {
    makeLevelStreamMock.mock.restore();
  });

  const getUserMedia = t.mock.fn(async () => {
    const stopTrack = t.mock.fn();
    trackStops.push(stopTrack);
    return {
      getTracks: () => [{ stop: stopTrack }],
    };
  });

  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });

  const { result, unmount } = renderHook(() => useMicLevel());

  await act(async () => {
    await result.current.start();
  });

  assert.equal(getUserMedia.mock.callCount(), 1);
  assert.equal(makeLevelStreamMock.mock.callCount(), 1);
  assert.equal(result.current.isMicOn, true);
  assert.equal(result.current.isBlocked, false);

  act(() => {
    const latest = levelCallbacks.at(-1);
    latest?.(1);
  });
  assert.ok(Math.abs(result.current.level - 0.2) < 1e-6);

  act(() => {
    const latest = levelCallbacks.at(-1);
    latest?.(0);
  });
  assert.ok(Math.abs(result.current.level - 0.16) < 1e-6);

  await act(async () => {
    await result.current.stop();
  });

  assert.equal(result.current.isMicOn, false);
  assert.equal(result.current.level, 0);
  assert.equal(teardownMocks[0]?.mock.callCount(), 1);
  assert.equal(trackStops[0]?.mock.callCount(), 1);

  await act(async () => {
    await result.current.start();
  });

  assert.equal(getUserMedia.mock.callCount(), 2);
  assert.equal(makeLevelStreamMock.mock.callCount(), 2);
  assert.equal(result.current.isMicOn, true);
  assert.equal(trackStops.length, 2);

  await act(async () => {
    await result.current.stop();
  });

  assert.equal(teardownMocks[1]?.mock.callCount(), 1);
  assert.equal(trackStops[1]?.mock.callCount(), 1);
  assert.equal(result.current.isMicOn, false);
  assert.equal(result.current.level, 0);

  unmount();
  delete globalThis.navigator.mediaDevices;
});

test("useMicLevel marks permission failures as blocked", async (t) => {
  prepareDomEnvironment(t);

  const makeLevelStreamMock = t.mock.method(levelStreamFactory, "create", () => {
    throw new Error("makeLevelStream should not be called when permissions are denied");
  });
  t.after(() => {
    makeLevelStreamMock.mock.restore();
  });

  const permissionError = Object.assign(new Error("denied"), { name: "NotAllowedError" });
  const getUserMedia = t.mock.fn(async () => {
    throw permissionError;
  });

  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });

  const { result, unmount } = renderHook(() => useMicLevel());

  await assert.rejects(
    async () => {
      await act(async () => {
        await result.current.start();
      });
    },
    permissionError,
  );

  await act(async () => {});
  assert.equal(result.current.isMicOn, false);
  assert.equal(result.current.isBlocked, true);
  assert.equal(result.current.level, 0);
  assert.equal(makeLevelStreamMock.mock.callCount(), 0);

  await act(async () => {
    await result.current.stop();
  });

  assert.equal(result.current.isBlocked, false);

  unmount();
  delete globalThis.navigator.mediaDevices;
});
