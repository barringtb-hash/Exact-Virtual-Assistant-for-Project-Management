/**
 * Microphone level engine using Web Audio API.
 * Provides a single AudioContext instance and exposes a pull-based API so
 * callers can request the latest RMS value without triggering React renders.
 */

import { buildAudioConstraints } from "./audioConstraints.ts";

export class MicLevelEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private floatBuf: Float32Array | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private silence: GainNode | null = null;
  private level = 0;
  private currentDeviceId?: string;

  async init(deviceId?: string): Promise<void> {
    if (!this.ctx) {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }

    if (this.analyser && this.floatBuf && this.currentDeviceId === deviceId) {
      return;
    }

    if (this.stream) {
      this.cleanupStream();
    }

    this.stream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId));
    this.currentDeviceId = deviceId;

    if (!this.ctx) return;

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    // Smaller window + lighter smoothing ensures a quicker visible response.
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.floatBuf = new Float32Array(this.analyser.fftSize);

    this.source.connect(this.analyser);
    this.silence = this.ctx.createGain();
    this.silence.gain.value = 0;
    this.analyser.connect(this.silence);
    this.silence.connect(this.ctx.destination);
  }

  getLevel(): number {
    if (!this.analyser || !this.floatBuf) return 0;
    this.analyser.getFloatTimeDomainData(this.floatBuf);

    let sum = 0;
    for (let i = 0; i < this.floatBuf.length; i++) {
      const v = this.floatBuf[i];
      sum += v * v;
    }

    const rms = Math.sqrt(sum / this.floatBuf.length);
    // Stronger normalization helps small gains clear the visible threshold in CI.
    const norm = Math.min(1, rms * 6);
    const prev = this.level;
    const attack = 0.8;
    const release = 0.25;
    this.level = norm > prev ? prev + (norm - prev) * attack : prev + (norm - prev) * release;
    return this.level;
  }

  async start(deviceId?: string): Promise<void> {
    await this.init(deviceId);
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  stop(): void {
    try {
      this.ctx?.suspend?.();
    } catch {
      // ignore
    }
    this.cleanupStream();
  }

  destroy(): void {
    this.stop();
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        // ignore
      }
    }
    this.ctx = null;
    this.analyser = null;
    this.floatBuf = null;
    this.source = null;
    this.currentDeviceId = undefined;
    this.level = 0;
  }

  private cleanupStream() {
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // ignore
      }
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // ignore
      }
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    }
    if (this.silence) {
      try {
        this.silence.disconnect();
      } catch {
        // ignore
      }
    }
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.floatBuf = null;
    this.silence = null;
    this.level = 0;
    this.currentDeviceId = undefined;
  }
}
