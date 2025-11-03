/**
 * MicButtonWithMeter - Microphone button with embedded vertical audio level meter
 * The meter rail lives inside the button and fills upward with the live level
 */

import React from "react";
import "./mic-button.css";

type Props = {
  isActive: boolean;
  level: number;        // 0..1
  onStart: () => Promise<void> | void;
  onStop: () => Promise<void> | void;
  size?: number;        // px, button is square
  showIcon?: boolean;   // show mic icon on top of rail
  ariaLabelStart?: string;
  ariaLabelStop?: string;
  disabled?: boolean;
};

export function MicButtonWithMeter({
  isActive,
  level,
  onStart,
  onStop,
  size = 44,
  showIcon = true,
  ariaLabelStart = "Start microphone",
  ariaLabelStop = "Stop microphone",
  disabled = false
}: Props) {
  // CSS custom prop drives the fill height via transform: scaleY()
  const style = { ["--meter-level" as any]: String(level), width: size, height: size };

  const handleClick = async () => {
    if (disabled) return;
    if (isActive) await onStop();
    else await onStart();
  };

  return (
    <button
      type="button"
      className={`mic-btn ${isActive ? "is-active" : ""}`}
      onClick={handleClick}
      aria-pressed={isActive}
      aria-label={isActive ? ariaLabelStop : ariaLabelStart}
      disabled={disabled}
      style={style}
    >
      {/* Vertical meter rail (left edge inside the button) */}
      <span className="meter" aria-hidden="true">
        <span className="meter-fill" />
      </span>

      {showIcon && (
        <svg className="mic-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V20H9v2h6v-2h-2v-2.08A7 7 0 0 0 19 11h-2z"/>
        </svg>
      )}
    </button>
  );
}
