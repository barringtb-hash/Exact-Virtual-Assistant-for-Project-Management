const DEFAULT_CAPACITY = 200;

function now() {
  return Date.now();
}

function createRingBuffer(capacity) {
  const safeCapacity = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : DEFAULT_CAPACITY;
  const items = new Array(safeCapacity);
  let length = 0;
  let index = 0;

  const api = {
    capacity: safeCapacity,
    push(entry) {
      items[index] = entry;
      index = (index + 1) % safeCapacity;
      if (length < safeCapacity) {
        length += 1;
      }
    },
    snapshot() {
      const result = new Array(length);
      for (let i = 0; i < length; i += 1) {
        const pointer = (index - length + i + safeCapacity) % safeCapacity;
        result[i] = items[pointer];
      }
      return result;
    },
  };

  return api;
}

function noop() {
  return undefined;
}

export function installSyncTelemetry(options = {}) {
  if (typeof window === "undefined") {
    return {
      log: noop,
      tap: () => noop,
      buffer: () => [],
    };
  }

  if (window.__syncTelemetryInstalled) {
    return window.__syncTelemetryInstalled;
  }

  const capacity = options.capacity ?? DEFAULT_CAPACITY;
  const buffer = createRingBuffer(capacity);
  const taps = new Set();
  let sequence = 0;

  function emit(entry) {
    buffer.push(entry);
    const listeners = Array.from(taps);
    for (const listener of listeners) {
      try {
        listener(entry);
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[syncTelemetry] listener failed", error);
        }
      }
    }
  }

  function log(kind, payload) {
    const entry = {
      id: ++sequence,
      timestamp: now(),
      kind,
      payload,
    };
    emit(entry);
    return entry;
  }

  function tap(listener) {
    if (typeof listener !== "function") {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[syncTelemetry] tap requires a function", { listener });
      }
      return noop;
    }

    const history = buffer.snapshot();
    for (const entry of history) {
      try {
        listener(entry);
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[syncTelemetry] tap replay failed", error);
        }
      }
    }

    taps.add(listener);
    return () => {
      taps.delete(listener);
    };
  }

  window.__syncLog = log;
  window.__syncTap = tap;

  const telemetry = {
    log,
    tap,
    buffer: () => buffer.snapshot(),
    capacity: buffer.capacity,
  };

  window.__syncTelemetryInstalled = telemetry;
  return telemetry;
}

export default {
  installSyncTelemetry,
};
