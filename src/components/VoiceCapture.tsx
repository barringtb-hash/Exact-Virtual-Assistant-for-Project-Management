import React, { useCallback, useEffect, useRef } from "react";
import { useMicLevel } from "../hooks/useMicLevel.ts";
import MicButton from "./MicButton.tsx";
import { MicDeviceSelector } from "./MicDeviceSelector.tsx";

export function VoiceCapture() {
  const mic = useMicLevel();
  const { isActive, devices, selectedDeviceId, selectDevice, start, stop, error, getLevel } = mic;
  const levelDisplayRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let mounted = true;

    const loop = () => {
      if (!mounted) return;
      const level = getLevel();
      if (levelDisplayRef.current) {
        const activeLevel = isActive ? Math.max(0.05, level) : 0;
        const pct = Math.round(activeLevel * 100);
        levelDisplayRef.current.textContent = `${pct}%`;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
    };
  }, [getLevel, isActive]);

  const toggleMic = useCallback(async () => {
    if (isActive) {
      await stop();
    } else {
      await start(selectedDeviceId);
    }
  }, [isActive, start, stop, selectedDeviceId]);

  return (
    <div style={{ display: "grid", gap: 12, padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <MicButton
          isActive={isActive}
          onToggle={() => {
            void toggleMic();
          }}
          disabled={false}
          title={isActive ? "Stop microphone" : "Start microphone"}
          engine={mic.engine}
          deviceId={selectedDeviceId}
        />

        {devices.length > 0 && (
          <MicDeviceSelector
            devices={devices}
            selectedDeviceId={selectedDeviceId}
            onChange={selectDevice}
            disabled={isActive}
          />
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            color: "#dc2626",
            padding: "8px 12px",
            background: "#fef2f2",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ fontSize: 13, opacity: 0.7 }}>
        Level: <span ref={levelDisplayRef}>{isActive ? "5%" : "0%"}</span>
      </div>
    </div>
  );
}
