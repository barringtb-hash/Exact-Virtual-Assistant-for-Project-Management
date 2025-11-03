/**
 * React hook for managing microphone level monitoring
 * Handles permissions, device enumeration, and audio level state
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MicLevelEngine } from "../audio/micLevelEngine";

export type MicState = {
  isActive: boolean;
  hasPermission: boolean | null;
  level: number; // 0..1
  db: number;    // ~-100..0
  peak: number;  // 0..1
  error?: string;
  devices: MediaDeviceInfo[];
  selectedDeviceId?: string;
};

async function getPermissionState(): Promise<boolean | null> {
  try {
    // Not supported on Safari; return null to mean "unknown"
    // @ts-ignore
    const res = await navigator.permissions?.query?.({ name: "microphone" });
    if (!res) return null;
    return res.state === "granted";
  } catch {
    return null;
  }
}

export function useMicLevel() {
  const engineRef = useRef<MicLevelEngine | null>(null);
  const [state, setState] = useState<MicState>({
    isActive: false,
    hasPermission: null,
    level: 0,
    db: -100,
    peak: 0,
    error: undefined,
    devices: [],
    selectedDeviceId: undefined
  });

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter(d => d.kind === "audioinput");
      setState(s => ({ ...s, devices: inputs }));
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message || "Failed to enumerate devices" }));
    }
  }, []);

  useEffect(() => {
    getPermissionState().then(has => setState(s => ({ ...s, hasPermission: has })));
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    refreshDevices();
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      engineRef.current?.destroy();
    };
  }, [refreshDevices]);

  const start = useCallback(async (deviceId?: string) => {
    try {
      engineRef.current?.destroy();
      engineRef.current = new MicLevelEngine({
        onLevel: ({ level, db, peak }) => setState(s => ({ ...s, level, db, peak }))
      });
      await engineRef.current.start(deviceId);
      await refreshDevices(); // device labels unlock after permission
      setState(s => ({ ...s, isActive: true, error: undefined, selectedDeviceId: deviceId, hasPermission: true }));
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message || "Microphone start failed", isActive: false }));
    }
  }, [refreshDevices]);

  const stop = useCallback(async () => {
    await engineRef.current?.stop();
    setState(s => ({ ...s, isActive: false, level: 0, db: -100, peak: 0 }));
  }, []);

  const selectDevice = useCallback(async (deviceId?: string) => {
    await start(deviceId);
  }, [start]);

  return {
    ...state,
    start,
    stop,
    selectDevice
  };
}
