/**
 * useMicButton - React hook for Voice Meter UI state management
 *
 * Integrates existing useMicLevel (audio analysis) with voiceStore (streaming state)
 * to provide a unified interface for the MicButton component.
 *
 * Returns:
 * - isMicOn: microphone is active
 * - isStreaming: voice stream is actively being processed
 * - level: 0..1 audio level for visualization
 * - toggle: function to start/stop mic
 * - error: any error message
 */

import { useCallback } from "react";
import { useMicLevel } from "./useMicLevel";
import { useVoiceStatus } from "../state/voiceStore";

export interface UseMicButtonReturn {
  isMicOn: boolean;
  isStreaming: boolean;
  level: number;          // 0..1
  db: number;             // -100..0
  peak: number;           // 0..1
  error?: string;
  toggle: () => Promise<void>;
}

/**
 * Hook that combines mic level monitoring with voice streaming state
 *
 * @param onStreamStart - Callback when streaming should start (receives MediaStream)
 * @param onStreamStop - Callback when streaming should stop
 */
export function useMicButton(
  onStreamStart?: (stream: MediaStream) => void | Promise<void>,
  onStreamStop?: () => void | Promise<void>
): UseMicButtonReturn {
  const mic = useMicLevel();
  const voiceStatus = useVoiceStatus();

  // Derive streaming state from voice store
  const isStreaming = voiceStatus === "listening" || voiceStatus === "transcribing";

  const toggle = useCallback(async () => {
    if (mic.isActive) {
      // Stop mic and streaming
      await onStreamStop?.();
      await mic.stop();
    } else {
      // Start mic
      await mic.start(mic.selectedDeviceId);

      // If we have a stream start callback, get the MediaStream and pass it
      if (onStreamStart) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: mic.selectedDeviceId ? { deviceId: mic.selectedDeviceId } : true
          });
          await onStreamStart(stream);
        } catch (err: any) {
          console.error("Failed to start voice stream:", err);
          await mic.stop();
        }
      }
    }
  }, [mic, onStreamStart, onStreamStop]);

  return {
    isMicOn: mic.isActive,
    isStreaming,
    level: mic.level,
    db: mic.db,
    peak: mic.peak,
    error: mic.error,
    toggle,
  };
}
