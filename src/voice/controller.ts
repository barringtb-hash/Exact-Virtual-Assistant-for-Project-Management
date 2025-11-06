import { FLAGS } from "../config/flags.ts";
import { voiceActions } from "../state/voiceStore.ts";
import { createVoiceGate, type PauseReason } from "./voiceGate.ts";
import { TestMicAdapter, type MicAdapter } from "./adapters/TestMicAdapter.ts";

const SAFE_MODE = FLAGS.CYPRESS_SAFE_MODE;

const setMicActiveState = (active: boolean) => {
  voiceActions.setMicActive(active);
};

const voiceGateInstance = createVoiceGate((active) => {
  setMicActiveState(active);
  const adapter = currentMicAdapter;
  if (!adapter) {
    return;
  }

  if (active) {
    void adapter.startOrResume();
  } else {
    void adapter.pause();
  }
});

let currentMicAdapter: MicAdapter | null = null;
const safeModeAdapter = SAFE_MODE ? new TestMicAdapter(setMicActiveState) : null;

if (safeModeAdapter) {
  currentMicAdapter = safeModeAdapter;
}

if (SAFE_MODE && typeof window !== "undefined") {
  const debugBridge = {
    get active() {
      return voiceGateInstance.isActive();
    },
    get reasons() {
      return voiceGateInstance.getReasons();
    },
    clearAll() {
      voiceGateInstance.clearAll();
    },
  };

  (window as typeof window & { __voiceGateDebug?: typeof debugBridge }).__voiceGateDebug =
    debugBridge;
}

export const voiceGate = voiceGateInstance;

export const setMicAdapter = (adapter: MicAdapter | null) => {
  currentMicAdapter = adapter ?? safeModeAdapter;
};

export const pauseMic = (reason: PauseReason) => {
  voiceGateInstance.hold(reason);
};

export const resumeMic = (reason: PauseReason) => {
  voiceGateInstance.release(reason);
};

export const isMicActive = () => voiceGateInstance.isActive();

export const getMicPauseReasons = () => voiceGateInstance.getReasons();

export type { PauseReason } from "./voiceGate.ts";
