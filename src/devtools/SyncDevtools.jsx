import { useEffect, useMemo, useState } from "react";
import { installSyncTelemetry as baseInstall } from "../sync/telemetry";

const HISTORY_LIMIT = 200;
const POLL_INTERVAL = 500;
const MAX_VISIBLE_EVENTS = 20;
const UNKNOWN_MODE = "unknown";

export function installSyncTelemetry(options) {
  const telemetry = baseInstall(options);

  if (typeof window === "undefined") {
    return telemetry;
  }

  const globalScope = window;

  if (!globalScope.__syncDevtoolsState) {
    globalScope.__syncDevtoolsState = {
      history: [],
      patched: false,
    };
  }

  const devtoolsState = globalScope.__syncDevtoolsState;

  if (!devtoolsState.patched && typeof globalScope.__syncLog === "function") {
    const originalLog = globalScope.__syncLog;
    const history = devtoolsState.history;

    const patchedLog = function syncDevtoolsLog(kind, payload) {
      const entry = originalLog(kind, payload);
      const record =
        entry && typeof entry === "object"
          ? entry
          : {
              id: Date.now(),
              timestamp: Date.now(),
              kind,
              payload,
            };

      history.push(record);
      if (history.length > HISTORY_LIMIT) {
        history.splice(0, history.length - HISTORY_LIMIT);
      }

      devtoolsState.history = history;
      return entry;
    };

    patchedLog.__syncDevtoolsPatched = true;
    devtoolsState.patched = true;
    devtoolsState.originalLog = originalLog;
    devtoolsState.log = patchedLog;

    globalScope.__syncLog = patchedLog;
  }

  return telemetry;
}

function formatEvent(entry) {
  if (!entry) {
    return "";
  }

  const { payload, kind } = entry;
  const event = payload?.event;
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : null;
  const timeLabel = timestamp ? timestamp.toLocaleTimeString() : "";

  if (event && typeof event.type === "string") {
    const details = Object.keys(event)
      .filter((key) => key !== "type" && event[key] !== undefined)
      .map((key) => `${key}: ${String(event[key])}`)
      .join(", ");

    return `${timeLabel} - ${kind} ${event.type}${details ? ` (${details})` : ""}`;
  }

  return `${timeLabel} - ${kind}`;
}

export default function SyncDevtools() {
  const [events, setEvents] = useState([]);
  const [mode, setMode] = useState(UNKNOWN_MODE);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    installSyncTelemetry();

    function readLog() {
      const log = window.__syncLog;
      if (typeof log !== "function") {
        return;
      }

      const history = Array.isArray(window.__syncDevtoolsState?.history)
        ? window.__syncDevtoolsState.history
        : [];

      const recentEvents = history.slice(-MAX_VISIBLE_EVENTS);
      setEvents(recentEvents);

      const latestState = recentEvents[recentEvents.length - 1]?.payload?.state;
      if (latestState && typeof latestState.mode === "string") {
        setMode(latestState.mode);
      }
    }

    readLog();
    const interval = window.setInterval(readLog, POLL_INTERVAL);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const renderedEvents = useMemo(() => events.slice().reverse(), [events]);

  return (
    <div
      data-testid="sync-devtools"
      style={{
        position: "fixed",
        right: "1rem",
        bottom: "1rem",
        width: "320px",
        maxHeight: "240px",
        overflow: "hidden",
        padding: "0.75rem",
        borderRadius: "0.5rem",
        background: "rgba(17, 24, 39, 0.9)",
        color: "#F9FAFB",
        fontSize: "0.75rem",
        fontFamily:
          "ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
        boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
        zIndex: 2147483647,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <span style={{ fontWeight: 600 }}>Sync Devtools</span>
        <span style={{ textTransform: "uppercase" }}>Mode: {mode}</span>
      </div>
      <div
        style={{
          overflowY: "auto",
          maxHeight: "180px",
          paddingRight: "0.25rem",
        }}
      >
        {renderedEvents.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No sync events yet.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {renderedEvents.map((entry) => (
              <li
                key={entry.id ?? `${entry.kind}-${entry.timestamp}`}
                style={{
                  padding: "0.125rem 0",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                {formatEvent(entry)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
