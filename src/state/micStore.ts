import { create } from "zustand";

const MIC_MUTED_KEY = "eva.mic.muted";

export type RecState = "idle" | "recording" | "processing";

type MicState = {
  isMuted: boolean;
  recState: RecState;
  setRecState: (state: RecState) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
};

const getInitialMuted = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const storedValue = window.localStorage.getItem(MIC_MUTED_KEY);
    if (storedValue === null) {
      return false;
    }
    return storedValue === "true";
  } catch {
    return false;
  }
};

const persistMuted = (value: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(MIC_MUTED_KEY, value ? "true" : "false");
  } catch {
    // ignore persistence failures
  }
};

export const useMicStore = create<MicState>((set, get) => ({
  isMuted: getInitialMuted(),
  recState: "idle",
  setRecState: (state) => set({ recState: state }),
  setMuted: (muted) => {
    set({ isMuted: muted });
    persistMuted(muted);
  },
  toggleMute: () => {
    const next = !get().isMuted;
    set({ isMuted: next });
    persistMuted(next);
  },
}));
