export interface LevelStreamOptions {
  /**
   * FFT size used by the analyser node. Higher values produce more precise RMS readings
   * at the cost of additional processing.
   */
  fftSize?: number;
  /**
   * Scalar applied to the calculated RMS value prior to normalization. Defaults to 1.
   */
  gain?: number;
  /**
   * Desired callbacks per second. The analyser is sampled on the next animation frame
   * that satisfies this cadence. Defaults to 60.
   */
  fps?: number;
}

export interface LevelStreamHandle {
  /**
   * Cancels the animation loop, disconnects and closes audio resources, and stops
   * every media track that backs the provided stream. It is idempotent and safe to
   * invoke multiple times.
   */
  teardown: () => void;
  analyser: AnalyserNode;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
}

export type LevelCallback = (level: number) => void;

/**
 * Creates an analyser stream that periodically reports the audio level of a media
 * stream. Levels are normalized into the [0, 1] range before invoking the callback.
 */
export function makeLevelStream(
  stream: MediaStream,
  onLevel: LevelCallback,
  options: LevelStreamOptions = {},
): LevelStreamHandle {
  const {
    fftSize = 2048,
    gain = 1,
    fps = 60,
  } = options;

  const AudioContextCtor: typeof AudioContext | undefined =
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .AudioContext ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available in this environment");
  }

  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = fftSize;

  const frameInterval = fps > 0 ? 1000 / fps : 0;
  const normalizedGain = Number.isFinite(gain) && gain > 0 ? gain : 1;
  const floatBuffer = new Float32Array(analyser.fftSize);
  const byteBuffer = new Uint8Array(analyser.fftSize);

  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis);

  if (!requestFrame || !cancelFrame) {
    throw new Error("requestAnimationFrame is required to use makeLevelStream");
  }

  source.connect(analyser);

  let lastFrameTime = -Infinity;
  let rafId: number | null = null;
  let disposed = false;

  const read = (timestamp: number) => {
    if (disposed) {
      return;
    }

    rafId = requestFrame(read);

    if (frameInterval && timestamp - lastFrameTime < frameInterval) {
      return;
    }

    lastFrameTime = timestamp;

    let sumSquares = 0;
    let length = analyser.fftSize;
    let hasData = false;

    if (typeof analyser.getFloatTimeDomainData === "function") {
      analyser.getFloatTimeDomainData(floatBuffer);
      length = floatBuffer.length;
      for (let i = 0; i < length; i += 1) {
        const sample = floatBuffer[i] * normalizedGain;
        sumSquares += sample * sample;
      }
      hasData = true;
    } else if (typeof analyser.getByteTimeDomainData === "function") {
      analyser.getByteTimeDomainData(byteBuffer);
      length = byteBuffer.length;
      for (let i = 0; i < length; i += 1) {
        const sample = ((byteBuffer[i] - 128) / 128) * normalizedGain;
        sumSquares += sample * sample;
      }
      hasData = true;
    }

    if (!hasData || length === 0) {
      onLevel(0);
      return;
    }

    const rms = Math.sqrt(sumSquares / length);
    const level = Math.min(1, Math.max(0, rms));
    onLevel(level);
  };

  rafId = requestFrame(read);

  const teardown = () => {
    if (disposed) {
      return;
    }
    disposed = true;

    if (rafId !== null) {
      cancelFrame(rafId);
      rafId = null;
    }

    try {
      source.disconnect();
    } catch {
      // ignore disconnect errors
    }

    try {
      analyser.disconnect?.();
    } catch {
      // ignore disconnect errors
    }

    void audioContext.close().catch(() => {
      // swallow close errors to keep teardown safe
    });

    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // ignore stop errors
      }
    }
  };

  return { teardown, analyser, audioContext, source };
}
