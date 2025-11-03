/**
 * VoiceCapture - Standalone demonstration component for mic level indicator
 * Shows how to integrate useMicLevel hook with UI components
 */

import React from "react";
import { useMicLevel } from "../hooks/useMicLevel.ts";
import { MicButtonWithMeter } from "./MicButtonWithMeter.tsx";
import { MicDeviceSelector } from "./MicDeviceSelector.tsx";

export function VoiceCapture() {
  const mic = useMicLevel();

  const onStart = async () => {
    // MUST be initiated by a user gesture for iOS
    await mic.start(mic.selectedDeviceId);
    // Start your transcription/voice pipeline here if applicable
  };

  const onStop = async () => {
    await mic.stop();
    // Stop your pipeline here
  };

  return (
    <div style={{ display: "grid", gap: 12, padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <MicButtonWithMeter
          isActive={mic.isActive}
          level={mic.level}
          onStart={onStart}
          onStop={onStop}
          size={48}
        />

        {mic.devices.length > 0 && (
          <MicDeviceSelector
            devices={mic.devices}
            selectedDeviceId={mic.selectedDeviceId}
            onChange={mic.selectDevice}
            disabled={mic.isActive}
          />
        )}
      </div>

      {mic.error && (
        <div
          role="alert"
          style={{
            color: "#dc2626",
            padding: "8px 12px",
            background: "#fef2f2",
            borderRadius: 6,
            fontSize: 14
          }}
        >
          {mic.error}
        </div>
      )}

      {mic.isActive && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          Level: {(mic.level * 100).toFixed(0)}% | dB: {mic.db.toFixed(1)} | Peak: {(mic.peak * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}
