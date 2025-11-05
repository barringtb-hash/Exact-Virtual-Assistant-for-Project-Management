/**
 * MicController - Demo/integration component for Voice Meter UI
 *
 * Shows how to wire together:
 * - useMicButton hook (mic state + voice streaming state)
 * - MicButton component (visual states)
 * - voiceActions (ASR/streaming integration)
 *
 * Replace the onStreamStart/onStreamStop callbacks with your actual
 * ASR pipeline (WebSocket, WebRTC, streaming API, etc.)
 */

import { useCallback } from "react";
import { MicButton } from "./MicButton";
import { useMicButton } from "../hooks/useMicButton";
import { voiceActions } from "../state/voiceStore";

export function MicController() {
  // Callbacks for your ASR/streaming pipeline
  // TODO: Replace these with your actual implementation
  const handleStreamStart = useCallback(async (stream: MediaStream) => {
    console.log("[MicController] Starting voice stream", stream);

    // Example: Start your ASR client here
    // - Set up WebSocket connection
    // - Configure audio encoder (PCM, Opus, etc.)
    // - Pipe MediaStream audio to your backend
    // - Update voice store state

    voiceActions.startVoiceStream(crypto.randomUUID());

    // Example placeholder: log audio chunks
    // const ctx = new AudioContext();
    // const source = ctx.createMediaStreamSource(stream);
    // const processor = ctx.createScriptProcessor(4096, 1, 1);
    // processor.onaudioprocess = (e) => {
    //   const input = e.inputBuffer.getChannelData(0);
    //   // Send to ASR backend...
    // };
    // source.connect(processor);
    // processor.connect(ctx.destination);
  }, []);

  const handleStreamStop = useCallback(async () => {
    console.log("[MicController] Stopping voice stream");

    // Example: Clean up your ASR client
    // - Close WebSocket
    // - Stop encoder
    // - Update voice store state

    voiceActions.endVoiceStream();
  }, []);

  const { isMicOn, isStreaming, level, error, toggle } = useMicButton(
    handleStreamStart,
    handleStreamStop
  );

  return (
    <div className="flex items-center gap-3">
      <MicButton
        isMicOn={isMicOn}
        isStreaming={isStreaming}
        level={level}
        onToggle={toggle}
      />

      {/* Status text */}
      <div className="text-sm opacity-80 dark:text-slate-300">
        {error ? (
          <span className="text-red-500 dark:text-red-400">
            {error}
          </span>
        ) : isStreaming ? (
          "Listening…"
        ) : isMicOn ? (
          "Mic ready"
        ) : (
          "Mic off"
        )}
      </div>
    </div>
  );
}
