import type { DocumentPatch } from "../types/sync.ts";

export type SyncMetricBase = {
  name: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

export type SyncCounterEvent = SyncMetricBase & {
  type: "counter";
  value: number;
};

export type SyncTimerEvent = SyncMetricBase & {
  type: "timer";
  durationMs: number;
};

export type SyncMetricEvent = SyncCounterEvent | SyncTimerEvent;

type MetricListener = (event: SyncMetricEvent) => void;

type PendingPatchTiming = {
  receivedAt: number;
  metadata?: Record<string, unknown>;
};

const MAX_HISTORY = 200;
const history: SyncMetricEvent[] = [];
const listeners = new Set<MetricListener>();
const pendingPatchTimings = new Map<string, PendingPatchTiming>();

function notify(event: SyncMetricEvent) {
  history.push(event);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      // Swallow listener errors to avoid impacting emitters.
      console.error("syncMetrics listener error", error);
    }
  }
}

export function emitCounter(
  name: string,
  value = 1,
  metadata?: Record<string, unknown>,
) {
  const event: SyncCounterEvent = {
    type: "counter",
    name,
    value,
    timestamp: Date.now(),
    metadata,
  };
  notify(event);
}

export function emitTimer(
  name: string,
  durationMs: number,
  metadata?: Record<string, unknown>,
) {
  const event: SyncTimerEvent = {
    type: "timer",
    name,
    durationMs,
    timestamp: Date.now(),
    metadata,
  };
  notify(event);
}

export function recordPatchApplied(
  patch: DocumentPatch,
  receivedAt: number,
  metadata?: Record<string, unknown>,
) {
  pendingPatchTimings.set(patch.id, { receivedAt, metadata });
  emitCounter("sync.patch_applied", 1, {
    patchId: patch.id,
    version: patch.version,
    ...metadata,
  });
}

export function recordPatchGap(details: Record<string, unknown>) {
  emitCounter("sync.patch_gap", 1, details);
}

export function recordPreviewApplied(patch: DocumentPatch) {
  const now = Date.now();
  const pending = pendingPatchTimings.get(patch.id);
  if (pending) {
    emitTimer("sync.preview_apply_ms", Math.max(0, now - pending.receivedAt), {
      patchId: patch.id,
      version: patch.version,
      ...pending.metadata,
    });
    pendingPatchTimings.delete(patch.id);
  } else {
    emitTimer("sync.preview_apply_ms", 0, {
      patchId: patch.id,
      version: patch.version,
      missingTiming: true,
    });
  }

  if (typeof patch.appliedAt === "number" && Number.isFinite(patch.appliedAt)) {
    emitTimer("sync.time_to_preview_ms", Math.max(0, now - patch.appliedAt), {
      patchId: patch.id,
      version: patch.version,
      ...pending?.metadata,
    });
  }
}

export function getMetricHistory(): SyncMetricEvent[] {
  return [...history];
}

export function subscribeToMetrics(listener: MetricListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetMetricsForTests() {
  history.length = 0;
  listeners.clear();
  pendingPatchTimings.clear();
}
