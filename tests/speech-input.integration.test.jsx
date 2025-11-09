import assert from "node:assert/strict";
import test from "node:test";
import React, { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { installDomEnvironment } from "./helpers/domEnvironment.js";

const AUDIO_RESPONSE = "Voice test clip";

class FakeMediaRecorder {
  static listeners = new WeakMap();
  static isTypeSupported() {
    return true;
  }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options?.mimeType || "audio/webm";
    this.state = "inactive";
    FakeMediaRecorder.listeners.set(this, {
      dataavailable: new Set(),
      stop: new Set(),
    });
    this.ondataavailable = null;
    this.onstop = null;
  }

  addEventListener(type, handler) {
    const registry = FakeMediaRecorder.listeners.get(this);
    registry?.[type]?.add(handler);
  }

  removeEventListener(type, handler) {
    const registry = FakeMediaRecorder.listeners.get(this);
    registry?.[type]?.delete(handler);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    const registry = FakeMediaRecorder.listeners.get(this);
    const blob = new Blob(["stub"], { type: this.mimeType });
    const event = { data: blob };

    setTimeout(() => {
      this.ondataavailable?.(event);
      registry?.dataavailable?.forEach((handler) => {
        try {
          handler(event);
        } catch (error) {
          console.error("dataavailable handler threw", error);
        }
      });

      setTimeout(() => {
        const stopEvent = new Event("stop");
        this.onstop?.(stopEvent);
        registry?.stop?.forEach((handler) => {
          try {
            handler(stopEvent);
          } catch (error) {
            console.error("stop handler threw", error);
          }
        });
      }, 0);
    }, 0);
  }
}

test("speech input uploads audio blobs via FormData and updates the composer", async (t) => {
  const { cleanup: cleanupDom } = installDomEnvironment();
  t.after(() => {
    cleanupDom();
    cleanup();
  });

  const tracks = [{ stop: t.mock.fn() }];
  const getUserMedia = t.mock.fn(async () => ({
    getTracks: () => tracks,
  }));

  const originalMediaDevices = globalThis.navigator.mediaDevices;
  globalThis.navigator.mediaDevices = { getUserMedia };
  t.after(() => {
    globalThis.navigator.mediaDevices = originalMediaDevices;
  });

  const originalMediaRecorder = globalThis.MediaRecorder;
  globalThis.MediaRecorder = FakeMediaRecorder;
  t.after(() => {
    if (originalMediaRecorder) {
      globalThis.MediaRecorder = originalMediaRecorder;
    } else {
      delete globalThis.MediaRecorder;
    }
  });

  const fetchCalls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = t.mock.fn(async (url, options = {}) => {
    fetchCalls.push({ url, options });
    const body = options.body;
    assert.ok(body instanceof FormData, "expected FormData body");
    const audioField = body.get("audio");
    assert.ok(audioField instanceof File, "audio field should be a File");
    assert.ok(audioField.size > 0, "audio payload should not be empty");

    const responseBody = JSON.stringify({ transcript: AUDIO_RESPONSE });
    return new Response(responseBody, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { useSpeechInput } = await import("../src/hooks/useSpeechInput.ts");

  function Harness() {
    const [draft, setDraft] = useState("");
    const { startRecording, stopRecording, isRecording } = useSpeechInput({
      onTranscript: (text) => {
        setDraft((prev) => (prev ? `${prev} ${text}` : text));
      },
      onError: (error) => {
        throw error instanceof Error ? error : new Error(String(error));
      },
    });

    return (
      <div>
        <div data-testid="draft-output">{draft}</div>
        <div data-testid="recording-flag">{isRecording ? "recording" : "idle"}</div>
        <button type="button" onClick={() => {
          void startRecording();
        }}>
          Start recording
        </button>
        <button type="button" onClick={() => stopRecording()}>
          Stop recording
        </button>
      </div>
    );
  }

  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: /start recording/i }));
  assert.equal(getUserMedia.mock.callCount(), 1, "getUserMedia should be requested once");

  await user.click(screen.getByRole("button", { name: /stop recording/i }));

  await waitFor(() => {
    const output = screen.getByTestId("draft-output");
    assert.equal(output.textContent, AUDIO_RESPONSE);
  });

  assert.equal(fetchCalls.length, 1, "transcribe endpoint should be called once");
  assert.equal(fetchCalls[0].url, "/api/transcribe");

  const statusFlag = screen.getByTestId("recording-flag");
  assert.equal(statusFlag.textContent, "idle", "recording flag resets after upload");
});
