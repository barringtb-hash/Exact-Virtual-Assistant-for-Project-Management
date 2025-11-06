import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";

import ConversationController from "../agent/ConversationController.ts";
import { useStore } from "../lib/tinyStore.ts";
import { getMetricHistory, subscribeToMetrics, type SyncMetricEvent } from "../state/syncMetrics.ts";
import { setPolicy, syncStoreApi } from "../state/syncStore.ts";
import type { InputPolicy } from "../types/sync.ts";

const PANEL_STYLE: CSSProperties = {
  position: "fixed",
  bottom: 16,
  right: 16,
  width: "min(420px, 90vw)",
  maxHeight: "80vh",
  overflowY: "auto",
  padding: 16,
  borderRadius: 12,
  boxShadow: "0 12px 32px rgba(15, 23, 42, 0.45)",
  backgroundColor: "rgba(15, 23, 42, 0.95)",
  color: "#e2e8f0",
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  zIndex: 10_000,
};

const SECTION_STYLE: CSSProperties = {
  marginTop: 12,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const TEXT_AREA_STYLE: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: 12,
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  backgroundColor: "rgba(15, 23, 42, 0.65)",
  borderRadius: 8,
  padding: 8,
  border: "1px solid rgba(148, 163, 184, 0.35)",
  maxHeight: 180,
  overflowY: "auto",
};

const POLICY_OPTIONS: InputPolicy[] = ["exclusive", "mixed"];

function formatJSON(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(error);
  }
}

export function SyncDeveloperPanel() {
  const [visible, setVisible] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const controllerRef = useRef<ConversationController | null>(null);

  const syncState = useStore(syncStoreApi, (state) => ({
    policy: state.policy,
    buffers: state.buffers,
    pendingTurn: state.pendingTurn,
    oplog: state.oplog,
    draft: state.draft,
  }));

  const [metrics, setMetrics] = useState<SyncMetricEvent[]>(() => getMetricHistory());

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "s" && event.ctrlKey && event.altKey) {
        event.preventDefault();
        setVisible((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);

  useEffect(() => {
    return subscribeToMetrics((event) => {
      setMetrics((prev) => {
        const next = [...prev, event];
        if (next.length > 50) {
          next.shift();
        }
        return next;
      });
    });
  }, []);

  if (controllerRef.current === null && typeof window !== "undefined") {
    controllerRef.current = new ConversationController({
      onError: (error) => setLastError(error.message),
    });
  }

  useEffect(() => () => {
    controllerRef.current?.cancel("sync devtools teardown");
    controllerRef.current = null;
  }, []);

  const handleClose = useCallback(() => setVisible(false), []);

  const handlePolicyChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextPolicy = event.target.value as InputPolicy;
    if (nextPolicy !== syncStoreApi.getState().policy) {
      setPolicy(nextPolicy);
    }
  }, []);

  const handleRunSync = useCallback(() => {
    if (!controllerRef.current) {
      return;
    }
    setLastError(null);
    controllerRef.current
      .sync()
      .catch((error) => {
        setLastError(error instanceof Error ? error.message : String(error));
      });
  }, []);

  const previewBuffer = useMemo(() => formatJSON(syncState.buffers.preview), [syncState.buffers.preview]);
  const finalBuffer = useMemo(() => formatJSON(syncState.buffers.final), [syncState.buffers.final]);
  const pendingSummary = useMemo(() => {
    if (!syncState.pendingTurn) {
      return "None";
    }
    return `id=${syncState.pendingTurn.id} patched=${syncState.pendingTurn.hasAppliedPatch}`;
  }, [syncState.pendingTurn]);
  const recentPatches = useMemo(() => syncState.oplog.slice(-5).reverse(), [syncState.oplog]);
  const recentPatchesText = useMemo(() => formatJSON(recentPatches), [recentPatches]);
  const draftFieldsText = useMemo(() => formatJSON(syncState.draft.fields ?? {}), [syncState.draft.fields]);
  const metricsText = useMemo(() => formatJSON(metrics.slice(-10).reverse()), [metrics]);

  if (!visible || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div style={PANEL_STYLE} data-testid="sync-devtools">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <strong style={{ fontSize: 16 }}>Sync developer panel</strong>
        <button
          type="button"
          onClick={handleClose}
          style={{
            background: "transparent",
            border: "1px solid rgba(148, 163, 184, 0.4)",
            color: "#e2e8f0",
            borderRadius: 6,
            padding: "4px 8px",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>

      <div style={SECTION_STYLE}>
        <label htmlFor="sync-devtools-policy" style={{ fontWeight: 500 }}>
          Input policy
        </label>
        <select
          id="sync-devtools-policy"
          data-testid="sync-devtools-policy-toggle"
          value={syncState.policy}
          onChange={handlePolicyChange}
          style={{
            backgroundColor: "rgba(30, 41, 59, 0.85)",
            color: "#e2e8f0",
            borderRadius: 6,
            border: "1px solid rgba(148, 163, 184, 0.4)",
            padding: "6px 8px",
          }}
        >
          {POLICY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div style={SECTION_STYLE}>
        <button
          type="button"
          data-testid="sync-devtools-run-sync"
          onClick={handleRunSync}
          style={{
            alignSelf: "flex-start",
            padding: "6px 12px",
            borderRadius: 6,
            background: "linear-gradient(135deg, #0ea5e9, #6366f1)",
            color: "white",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Run agent sync
        </button>
        {lastError ? (
          <div data-testid="sync-devtools-error" style={{ color: "#fca5a5", fontSize: 12 }}>
            {lastError}
          </div>
        ) : null}
      </div>

      <div style={SECTION_STYLE}>
        <span style={{ fontWeight: 500 }}>Pending turn</span>
        <span data-testid="sync-devtools-pending-turn" style={{ fontSize: 13 }}>
          {pendingSummary}
        </span>
      </div>

      <div style={SECTION_STYLE}>
        <span style={{ fontWeight: 500 }}>Preview buffer</span>
        <pre data-testid="sync-devtools-preview-buffer" style={TEXT_AREA_STYLE}>
          {previewBuffer}
        </pre>
      </div>

      <div style={SECTION_STYLE}>
        <span style={{ fontWeight: 500 }}>Final buffer</span>
        <pre data-testid="sync-devtools-final-buffer" style={TEXT_AREA_STYLE}>
          {finalBuffer}
        </pre>
      </div>

      <div style={SECTION_STYLE}>
        <span style={{ fontWeight: 500 }}>Draft snapshot</span>
        <pre data-testid="sync-devtools-draft" style={TEXT_AREA_STYLE}>
          {draftFieldsText}
        </pre>
      </div>

      <div style={SECTION_STYLE}>
        <span style={{ fontWeight: 500 }}>Recent patches</span>
        <pre data-testid="sync-devtools-recent-patches" style={TEXT_AREA_STYLE}>
          {recentPatchesText}
        </pre>
      </div>

      <div style={SECTION_STYLE}>
        <span style={{ fontWeight: 500 }}>Latest metrics</span>
        <pre data-testid="sync-devtools-metrics" style={TEXT_AREA_STYLE}>
          {metricsText}
        </pre>
      </div>
    </div>,
    document.body,
  );
}

export default SyncDeveloperPanel;
