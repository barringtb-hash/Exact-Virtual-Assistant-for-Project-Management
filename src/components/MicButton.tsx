/**
 * MicButton - Voice Meter UI component for conversation readiness
 *
 * A single mic control that doubles as a conversation-readiness indicator.
 * States: idle, live (mic armed), listening (streaming), peak (clipping)
 *
 * Built on top of existing useMicLevel infrastructure.
 */

import { useEffect, useRef, useState } from "react";

export type MicUIState = "idle" | "live" | "listening" | "peak";

interface Props {
  isMicOn: boolean;
  isStreaming: boolean;
  level: number;              // 0..1 from useMicLevel
  onToggle: () => void;
  className?: string;
  peakThreshold?: number;     // default 0.9
  peakHoldMs?: number;        // default 150
  ariaLabel?: string;         // default "Microphone"
}

export function MicButton({
  isMicOn,
  isStreaming,
  level,
  onToggle,
  className = "",
  peakThreshold = 0.9,
  peakHoldMs = 150,
  ariaLabel = "Microphone",
}: Props) {
  const [ui, setUI] = useState<MicUIState>("idle");
  const peakTimeout = useRef<number | null>(null);

  // Derive base state from flags
  const baseState: MicUIState = isStreaming ? "listening" : (isMicOn ? "live" : "idle");

  // Update base state (unless we're showing peak)
  useEffect(() => {
    if (ui === "peak") return; // let peak finish
    setUI(baseState);
  }, [baseState, ui]);

  // Peak detection with hold + hysteresis
  useEffect(() => {
    if (!isMicOn) return;

    if (ui !== "peak" && level >= peakThreshold) {
      setUI("peak");

      if (peakTimeout.current) window.clearTimeout(peakTimeout.current);

      peakTimeout.current = window.setTimeout(() => {
        setUI(baseState);
        peakTimeout.current = null;
      }, peakHoldMs) as unknown as number;
    }
  }, [level, isMicOn, peakThreshold, peakHoldMs, baseState, ui]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (peakTimeout.current) window.clearTimeout(peakTimeout.current);
    };
  }, []);

  // Vertical meter height (8px min to 44px max)
  const meterHeight = Math.max(8, Math.min(44, level * 44));

  return (
    <button
      type="button"
      role="switch"
      aria-pressed={isMicOn}
      aria-label={ariaLabel}
      onClick={onToggle}
      data-state={ui}
      className={[
        "relative h-14 w-14 rounded-full flex items-center justify-center transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/70 focus-visible:ring-offset-neutral-900",
        ui === "idle" && "bg-neutral-800 dark:bg-neutral-700",
        ui === "live" && "bg-neutral-800 dark:bg-neutral-700 ring-2 ring-offset-2 ring-green-400/70 shadow-[0_0_20px_rgba(16,185,129,0.35)]",
        ui === "listening" && "bg-neutral-800 dark:bg-neutral-700 ring-2 ring-green-400",
        ui === "peak" && "bg-neutral-800 dark:bg-neutral-700 ring-4 ring-red-400",
        "motion-safe:data-[state=listening]:animate-voice-pulse",
        "motion-reduce:animate-none",
        className
      ].filter(Boolean).join(" ")}
    >
      {/* Inner vertical meter */}
      <span
        aria-hidden="true"
        className="absolute bottom-2 w-[3px] rounded-full bg-white/90 transition-[height] duration-75 ease-out"
        style={{ height: `${meterHeight}px` }}
      />

      {/* Mic glyph */}
      <svg width="20" height="20" viewBox="0 0 24 24" className="opacity-90 relative z-10" fill="white">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2zM13 19.9V22h-2v-2.1A9.05 9.05 0 0 1 3 13h2a7 7 0 0 0 14 0h2a9.05 9.05 0 0 1-8 6.9z"/>
      </svg>
    </button>
  );
}
