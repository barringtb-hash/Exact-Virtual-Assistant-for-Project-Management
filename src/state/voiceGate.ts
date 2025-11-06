export type PauseReason = "composer" | "network" | "tts" | "user";

type VoiceGateSubscriber = (active: boolean, reasons: PauseReason[]) => void;

type VoiceGate = {
  hold: (reason: PauseReason) => void;
  release: (reason: PauseReason) => void;
  clearAll: () => void;
  isActive: () => boolean;
  getReasons: () => PauseReason[];
};

export function createVoiceGate(onActiveChange: VoiceGateSubscriber): VoiceGate {
  const reasons = new Set<PauseReason>();
  let active = false;

  const sync = () => {
    const nextActive = reasons.size === 0;
    if (nextActive !== active) {
      active = nextActive;
      const snapshot = Array.from(reasons);
      onActiveChange(active, snapshot);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("voice:state", { detail: { active, reasons: snapshot } })
        );
      }
    }
  };

  return {
    hold(reason) {
      reasons.add(reason);
      sync();
    },
    release(reason) {
      reasons.delete(reason);
      sync();
    },
    clearAll() {
      reasons.clear();
      sync();
    },
    isActive() {
      return active;
    },
    getReasons() {
      return Array.from(reasons);
    },
  };
}
