/**
 * Microphone level engine using Web Audio API.
 * Provides a single AudioContext instance and exposes a pull-based API so
 * callers can request the latest RMS value without triggering React renders.
 */

import { buildAudioConstraints } from "./audioConstraints.ts";

export class MicLevelEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array | null = null;
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

    if (this.analyser && this.data && this.currentDeviceId === deviceId) {
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
    this.data = new Uint8Array(this.analyser.fftSize);

    this.source.connect(this.analyser);
    this.silence = this.ctx.createGain();
    this.silence.gain.value = 0;
    this.analyser.connect(this.silence);
    this.silence.connect(this.ctx.destination);
  }

  getLevel(): number {
    if (!this.analyser || !this.data) return 0;
    this.analyser.getByteTimeDomainData(this.data);

    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i] - 128) / 128;
      sum += v * v;
    }

    const rms = Math.sqrt(sum / this.data.length);
    // Stronger normalization helps small gains clear the visible threshold in CI.
    const norm = Math.min(1, rms * 4.5);
    const prev = this.level;
    const attack = 0.8;
    const release = 0.2;
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
    this.data = null;
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
    this.data = null;
    this.silence = null;
    this.level = 0;
    this.currentDeviceId = undefined;
  }
}
