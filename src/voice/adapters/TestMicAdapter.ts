export interface MicAdapter {
  startOrResume(): Promise<void> | void;
  pause(): Promise<void> | void;
}

export class TestMicAdapter implements MicAdapter {
  constructor(private readonly onActive: (active: boolean) => void) {}

  async startOrResume(): Promise<void> {
    this.onActive(true);
  }

  async pause(): Promise<void> {
    this.onActive(false);
  }
}
