import assert from "node:assert/strict";
import test from "node:test";

import { ASRService } from "../src/voice/ASRService.ts";
import { InputGateway } from "../src/sync/InputGateway.ts";

const originalNavigator = global.navigator;
const originalSubmitFinal = InputGateway.submitFinalInput;

test("ASRService.start reports unsupported environments", () => {
  InputGateway.submitFinalInput = () => {};
  delete global.navigator;

  let capturedError;
  const service = new ASRService();
  service.registerHooks({
    onError: (error) => {
      capturedError = error;
    },
  });

  const result = service.start();

  assert.equal(result, undefined);
  assert.ok(capturedError instanceof Error);
  assert.match(String(capturedError?.message || ""), /not supported|requires/i);
});

test("ASRService.start succeeds when APIs exist", () => {
  InputGateway.submitFinalInput = () => {};
  class FakeMediaStream {}
  global.navigator = {
    mediaDevices: {
      getUserMedia: () => Promise.resolve(new FakeMediaStream()),
    },
  };
  // Provide minimal WebRTC stub
  global.RTCPeerConnection = function RTCPeerConnectionStub() {};

  const service = new ASRService();
  let errorCalled = false;
  service.registerHooks({ onError: () => (errorCalled = true) });

  const result = service.start();
  assert.ok(typeof result === "string" && result.length > 0);
  assert.equal(errorCalled, false);
});

test.after(() => {
  InputGateway.submitFinalInput = originalSubmitFinal;
  if (originalNavigator) {
    global.navigator = originalNavigator;
  } else {
    delete global.navigator;
  }
  delete global.RTCPeerConnection;
});
