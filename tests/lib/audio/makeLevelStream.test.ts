import assert from "node:assert/strict";
import test from "node:test";

import { makeLevelStream } from "../../../src/lib/audio/makeLevelStream.ts";

class FakeTrack {
  public stopped = false;

  stop() {
    this.stopped = true;
  }
}

class FakeMediaStream {
  constructor(private readonly tracks: FakeTrack[]) {}

  getTracks() {
    return this.tracks as unknown as MediaStreamTrack[];
  }
}

class FakeSource {
  public connectedNode: unknown = null;
  public disconnected = false;

  constructor(public readonly stream: MediaStream) {}

  connect(node: unknown) {
    this.connectedNode = node;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeAnalyser {
  public fftSize: number;
  public disconnectCalled = false;
  private floatFrames: number[][];
  private byteFrames: number[][];
  private frameIndex = 0;
  private readonly floatEnabled: boolean;

  constructor(options: { fftSize?: number; floatFrames?: number[][]; byteFrames?: number[][]; enableFloat?: boolean }) {
    this.fftSize = options.fftSize ?? 32;
    this.floatFrames = options.floatFrames ?? [];
    this.byteFrames = options.byteFrames ?? [];
    this.floatEnabled = options.enableFloat ?? true;
  }

  getFloatTimeDomainData(array: Float32Array) {
    if (!this.floatEnabled) {
      throw new Error("float disabled");
    }
    const frame = this.floatFrames[this.frameIndex] ?? [];
    for (let i = 0; i < array.length; i += 1) {
      array[i] = frame[i] ?? 0;
    }
    this.frameIndex += 1;
  }

  getByteTimeDomainData(array: Uint8Array) {
    const frame = this.byteFrames[this.frameIndex] ?? [];
    for (let i = 0; i < array.length; i += 1) {
      array[i] = frame[i] ?? 128;
    }
    this.frameIndex += 1;
  }

  disconnect() {
    this.disconnectCalled = true;
  }
}

class FakeAudioContextImpl {
  public closed = false;
  public source: FakeSource | null = null;
  public state: AudioContextState = "suspended";

  constructor(public readonly analyser: FakeAnalyser) {}

  createMediaStreamSource(stream: MediaStream) {
    this.source = new FakeSource(stream);
    return this.source as unknown as MediaStreamAudioSourceNode;
  }

  createAnalyser() {
    return this.analyser as unknown as AnalyserNode;
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

function installAudioContext(analyser: FakeAnalyser) {
  const originalAudioContext = globalThis.AudioContext;
  const fakeInstance = new FakeAudioContextImpl(analyser);

  globalThis.AudioContext = class {
    constructor() {
      return fakeInstance as unknown as AudioContext;
    }
  } as unknown as typeof AudioContext;

  return {
    fakeInstance,
    restore() {
      if (originalAudioContext) {
        globalThis.AudioContext = originalAudioContext;
      } else {
        delete (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      }
    },
  };
}

function installAnimationFrame() {
  const originalRAF = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let callback: FrameRequestCallback | null = null;
  let counter = 0;
  let cancelled = 0;

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    callback = cb;
    counter += 1;
    return counter;
  };

  globalThis.cancelAnimationFrame = () => {
    cancelled += 1;
  };

  return {
    step(time: number) {
      const cb = callback;
      callback = null;
      cb?.(time);
    },
    get cancelCount() {
      return cancelled;
    },
    restore() {
      if (originalRAF) {
        globalThis.requestAnimationFrame = originalRAF;
      } else {
        delete (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
      }

      if (originalCancel) {
        globalThis.cancelAnimationFrame = originalCancel;
      } else {
        delete (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame;
      }
    },
  };
}

test("normalizes RMS values using float data", async (t) => {
  const analyser = new FakeAnalyser({ floatFrames: [Array(32).fill(0.5)] });
  const { fakeInstance, restore: restoreContext } = installAudioContext(analyser);
  const raf = installAnimationFrame();

  t.after(() => {
    restoreContext();
    raf.restore();
  });

  const tracks = [new FakeTrack()];
  const stream = new FakeMediaStream(tracks) as unknown as MediaStream;
  const levels: number[] = [];

  const handle = makeLevelStream(stream, (level) => levels.push(level), {
    fftSize: 32,
    gain: 2,
    fps: 60,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  raf.step(0);

  assert.equal(levels.length, 1);
  assert.equal(levels[0], 1);
  assert.ok(fakeInstance.source?.connectedNode);

  handle.teardown();
});

test("falls back to byte data when float data unavailable", async (t) => {
  const frameValue = 255;
  const analyser = new FakeAnalyser({ byteFrames: [Array(32).fill(frameValue)], enableFloat: false });
  // @ts-expect-error - disable float method
  analyser.getFloatTimeDomainData = undefined;
  const { restore: restoreContext } = installAudioContext(analyser);
  const raf = installAnimationFrame();

  t.after(() => {
    restoreContext();
    raf.restore();
  });

  const tracks = [new FakeTrack()];
  const stream = new FakeMediaStream(tracks) as unknown as MediaStream;
  const levels: number[] = [];

  makeLevelStream(stream, (level) => levels.push(level), { fftSize: 32, fps: 60 });

  await new Promise((resolve) => setTimeout(resolve, 0));

  raf.step(0);

  assert.equal(levels.length, 1);
  const expected = Math.sqrt(((frameValue - 128) / 128) ** 2);
  assert.ok(Math.abs(levels[0] - expected) < 1e-6);
});

test("respects fps cadence and cleans up resources", async (t) => {
  const analyser = new FakeAnalyser({ floatFrames: [Array(32).fill(0.25), Array(32).fill(0.25), Array(32).fill(0.25)] });
  const { fakeInstance, restore: restoreContext } = installAudioContext(analyser);
  const raf = installAnimationFrame();

  t.after(() => {
    restoreContext();
    raf.restore();
  });

  const tracks = [new FakeTrack()];
  const stream = new FakeMediaStream(tracks) as unknown as MediaStream;
  const levels: number[] = [];

  const handle = makeLevelStream(stream, (level) => levels.push(level), { fftSize: 32, fps: 10 });

  await new Promise((resolve) => setTimeout(resolve, 0));

  raf.step(0);
  raf.step(50);
  raf.step(120);

  assert.equal(levels.length, 2);
  assert.ok(levels.every((level) => level > 0 && level < 1));

  handle.teardown();

  assert.equal(raf.cancelCount, 1);
  assert.equal((fakeInstance.source as unknown as FakeSource).disconnected, true);
  assert.equal(analyser.disconnectCalled, true);
  assert.equal(fakeInstance.closed, true);
  assert.ok(tracks.every((track) => track.stopped));
});
