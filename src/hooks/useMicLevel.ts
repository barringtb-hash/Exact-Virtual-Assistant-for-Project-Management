/**
 * React hook for managing microphone permissions and device selection.
 * Exposes helpers to start/stop the shared MicLevelEngine and a pull-based
 * getLevel() accessor for UI components that need the current RMS value.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MicLevelEngine } from "../audio/micLevelEngine.ts";

export type MicState = {
  isActive: boolean;
  hasPermission: boolean | null;
  error?: string;
  devices: MediaDeviceInfo[];
  selectedDeviceId?: string;
  blocked: boolean;
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
    error: undefined,
    devices: [],
    selectedDeviceId: undefined,
    blocked: false,
  });

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === "audioinput");
      setState((s) => ({ ...s, devices: inputs }));
    } catch (e: any) {
      setState((s) => ({ ...s, error: e?.message || "Failed to enumerate devices" }));
    }
  }, []);

  useEffect(() => {
    getPermissionState().then((has) => setState((s) => ({ ...s, hasPermission: has })));
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    refreshDevices();
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [refreshDevices]);

  const start = useCallback(
    async (deviceId?: string) => {
      try {
        if (!engineRef.current) {
          engineRef.current = new MicLevelEngine();
        }
        await engineRef.current.start(deviceId);
        await refreshDevices(); // device labels unlock after permission
        setState((s) => ({
          ...s,
          isActive: true,
          error: undefined,
          selectedDeviceId: deviceId,
          hasPermission: true,
          blocked: false,
        }));
      } catch (e: any) {
        setState((s) => ({
          ...s,
          error: e?.message || "Microphone start failed",
          isActive: false,
          hasPermission: false,
          blocked: true,
        }));
      }
    },
    [refreshDevices]
  );

  const stop = useCallback(async () => {
    await engineRef.current?.stop();
    setState((s) => ({ ...s, isActive: false }));
  }, []);

  const selectDevice = useCallback(
    async (deviceId?: string) => {
      await start(deviceId);
    },
    [start]
  );

  const getLevel = useCallback(() => engineRef.current?.getLevel() ?? 0, []);

  return {
    ...state,
    getLevel,
    engine: engineRef.current,
    start,
    stop,
    selectDevice,
  };
}
