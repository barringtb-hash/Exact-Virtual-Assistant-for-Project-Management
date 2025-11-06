export type PauseReason = "composer" | "network" | "tts" | "user";

export type VoiceGate = {
  hold: (reason: PauseReason) => void;
  release: (reason: PauseReason) => void;
  clearAll: () => void;
  isActive: () => boolean;
  getReasons: () => PauseReason[];
};

export function createVoiceGate(
  onActiveChange: (active: boolean, reasons: PauseReason[]) => void
): VoiceGate {
  const reasons = new Set<PauseReason>();
  let active = false;

  const sync = () => {
    const nextActive = reasons.size === 0;
    if (nextActive !== active) {
      active = nextActive;
      const snapshot = Array.from(reasons);
      onActiveChange(nextActive, snapshot);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("voice:state", {
            detail: { active: nextActive, reasons: snapshot },
          })
        );
      }
    }
  };

  return {
    hold: (reason) => {
      reasons.add(reason);
      sync();
    },
    release: (reason) => {
      reasons.delete(reason);
      sync();
    },
    clearAll: () => {
      reasons.clear();
      sync();
    },
    isActive: () => active,
    getReasons: () => Array.from(reasons),
  };
}
