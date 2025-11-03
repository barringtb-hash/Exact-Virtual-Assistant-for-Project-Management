/**
 * Microphone level engine using Web Audio API
 * Provides real-time audio level analysis
 */

import { rmsToDb, dbToUnit } from "./audioMath";
import { buildAudioConstraints } from "./audioConstraints";

type OnLevel = (data: { level: number; db: number; peak: number }) => void;

export class MicLevelEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private onLevel: OnLevel;
  private smoothing: number;
  private minDb: number;
  private buffer!: Float32Array;
  private prevDb: number = -100;
  private peakHold: number = 0;
  private peakDecayPerSec = 0.75; // visible peak "comet tail"

  constructor(opts: {
    onLevel: OnLevel;
    smoothing?: number; // 0..1
    minDb?: number; // floor
  }) {
    this.onLevel = opts.onLevel;
    this.smoothing = opts.smoothing ?? 0.75;
    this.minDb = opts.minDb ?? -100;
  }

  async start(deviceId?: string) {
    await this.stop(); // clean start
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx();

    // Must be in response to a user gesture on iOS Safari:
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.stream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(deviceId));
    this.source = this.ctx.createMediaStreamSource(this.stream);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = this.smoothing; // visual smoothing
    this.source.connect(this.analyser);

    this.buffer = new Float32Array(this.analyser.fftSize);
    this.loop();
  }

  private loop = () => {
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buffer);
    // RMS
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const v = this.buffer[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.buffer.length);
    const db = rmsToDb(rms, this.minDb);
    // Smooth dB (EMA)
    const alpha = 0.25;
    this.prevDb = this.prevDb === -100 ? db : (1 - alpha) * this.prevDb + alpha * db;

    const level = dbToUnit(this.prevDb, this.minDb);

    // Track a simple peak with decay
    this.peakHold = Math.max(this.peakHold - this.peakDecayPerFrame(), level);
    this.onLevel({ level, db: this.prevDb, peak: this.peakHold });

    this.rafId = requestAnimationFrame(this.loop);
  };

  private peakDecayPerFrame() {
    // Approximate per-frame decay at 60fps
    return this.peakDecayPerSec / 60;
  }

  async stop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;

    if (this.source) this.source.disconnect();
    this.source = null;

    if (this.analyser) this.analyser.disconnect();
    this.analyser = null;

    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    this.stream = null;

    if (this.ctx) {
      // Keep the AudioContext for reuse to avoid user-gesture requirements; suspend to save power
      try { await this.ctx.suspend(); } catch {}
    }
  }

  destroy() {
    this.stop();
    if (this.ctx) {
      try { this.ctx.close(); } catch {}
    }
    this.ctx = null;
  }
}
