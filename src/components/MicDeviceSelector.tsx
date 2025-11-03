/**
 * MicDeviceSelector - Dropdown for selecting microphone input device
 */

import React from "react";

type Props = {
  devices: MediaDeviceInfo[];
  selectedDeviceId?: string;
  onChange: (deviceId?: string) => void;
  disabled?: boolean;
  className?: string;
};

export function MicDeviceSelector({
  devices,
  selectedDeviceId,
  onChange,
  disabled = false,
  className = ""
}: Props) {
  if (!devices.length) return null;

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }} className={className}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>Mic:</span>
      <select
        value={selectedDeviceId || ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        disabled={disabled}
        style={{
          fontSize: 13,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid rgba(0,0,0,0.15)",
          background: "rgba(255,255,255,0.8)",
          cursor: disabled ? "not-allowed" : "pointer"
        }}
        aria-label="Select microphone device"
      >
        {devices.map(d => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
          </option>
        ))}
      </select>
    </label>
  );
}
