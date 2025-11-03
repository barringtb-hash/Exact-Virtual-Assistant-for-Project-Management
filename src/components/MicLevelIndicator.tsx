/**
 * MicLevelIndicator - Real-time microphone audio level indicator
 * Supports bar, ring, and wave variants
 *
 * Note: Styles are in src/components/mic-meter.css and loaded via the build system
 */

import React from "react";

type Props = {
  level: number;       // 0..1
  peak?: number;       // 0..1
  db?: number;         // -100..0 (optional display)
  variant?: "bar" | "ring" | "wave";
  size?: number;       // px (for ring/wave)
  showDb?: boolean;
  ariaLabel?: string;
  className?: string;
};

export function MicLevelIndicator({
  level,
  peak,
  db,
  variant = "bar",
  size = 28,
  showDb = false,
  ariaLabel = "Microphone level",
  className
}: Props) {
  if (variant === "ring") {
    const circumference = 2 * Math.PI * 12;
    const progress = Math.max(0, Math.min(1, level));
    const dash = progress * circumference;
    const peakDash = Math.max(progress, Math.min(1, peak ?? 0)) * circumference;

    return (
      <div className={`mic-meter mic-meter--ring ${className || ""}`} role="img" aria-label={ariaLabel} style={{ width: size, height: size }}>
        <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true">
          <circle cx="14" cy="14" r="12" className="ring-bg" />
          <circle cx="14" cy="14" r="12" className="ring-level"
            strokeDasharray={`${dash} ${circumference - dash}`} />
          {typeof peak === "number" && (
            <circle cx="14" cy="14" r="12" className="ring-peak"
              strokeDasharray={`${peakDash} ${circumference - peakDash}`} />
          )}
        </svg>
        {showDb && <span className="db-label">{Math.round(db ?? -100)} dB</span>}
      </div>
    );
  }

  // Default bar
  return (
    <div className={`mic-meter mic-meter--bar ${className || ""}`} role="img" aria-label={ariaLabel}>
      <div className="bar-track">
        <div className="bar-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, level))})` }} />
        {typeof peak === "number" && <div className="bar-peak" style={{ left: `${Math.max(0, Math.min(1, peak)) * 100}%` }} />}
      </div>
      {showDb && <span className="db-label">{Math.round(db ?? -100)} dB</span>}
    </div>
  );
}
