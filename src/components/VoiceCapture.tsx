/**
 * VoiceCapture - Standalone demonstration component for mic level indicator
 * Shows how to integrate useMicLevel hook with UI components
 */

import React from "react";
import { useMicLevel } from "../hooks/useMicLevel.ts";
import { MicLevelIndicator } from "./MicLevelIndicator.tsx";
import { FEATURE_MIC_LEVEL } from "../config/flags.ts";

export function VoiceCapture() {
  const mic = useMicLevel();

  const onStart = async () => {
    // MUST be initiated by a user gesture for iOS
    await mic.start();
    // Start your transcription/voice pipeline here if applicable
  };

  const onStop = async () => {
    await mic.stop();
    // Stop your pipeline here
  };

  return (
    <div style={{ display: "grid", gap: 12, padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={mic.isMicOn ? onStop : onStart}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
            background: mic.isMicOn ? "#ef4444" : "#10b981",
            color: "white",
            fontWeight: 500,
            cursor: "pointer"
          }}
        >
          {mic.isMicOn ? "Stop" : "Start"} Mic
        </button>

        {FEATURE_MIC_LEVEL && mic.isMicOn && (
          <MicLevelIndicator
            level={mic.level}
            variant="bar"
            showDb={false}
            ariaLabel="Live microphone level"
          />
        )}
      </div>

      {mic.isBlocked && (
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
          Microphone permissions are blocked. Enable access in your browser settings.
        </div>
      )}

      {mic.isMicOn && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          Level: {(mic.level * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}
