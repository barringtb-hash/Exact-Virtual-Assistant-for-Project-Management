import type { MicAdapter } from "./TestMicAdapter.ts";

type Control = () => Promise<void> | void;

export class RecorderMicAdapter implements MicAdapter {
  constructor(private readonly start: Control, private readonly stop: Control) {}

  async startOrResume(): Promise<void> {
    await this.start();
  }

  async pause(): Promise<void> {
    await this.stop();
  }
}
