const INITIAL_STATE = Object.freeze({
  mode: "idle",
  lastMicWasOn: false,
});

const ALLOWED_MODES = new Set([
  "idle",
  "listening",
  "speaking",
  "thinking",
  "error",
]);

const subscribers = new Set();
let state = INITIAL_STATE;

function freezeState(next) {
  return Object.freeze({ ...next });
}

function reportInvariant(message, context) {
  if (process.env.NODE_ENV !== "production") {
    const details = context ? `: ${JSON.stringify(context)}` : "";
    console.warn(`[syncStore] ${message}${details}`);
  }
}

function validateMode(targetMode) {
  if (typeof targetMode !== "string") {
    reportInvariant("mode must be a string", { mode: targetMode });
    return false;
  }

  if (!ALLOWED_MODES.has(targetMode)) {
    reportInvariant("mode is not recognized", { mode: targetMode });
  }

  return true;
}

function validateBoolean(value, field) {
  if (typeof value !== "boolean") {
    reportInvariant(`${field} must be a boolean`, { value });
    return false;
  }
  return true;
}

function applyEvent(currentState, event) {
  if (!event || typeof event.type !== "string") {
    reportInvariant("event.type must be a string", { event });
    return currentState;
  }

  switch (event.type) {
    case "sync/mode": {
      const { mode } = event;
      if (!validateMode(mode)) {
        return currentState;
      }
      if (currentState.mode === mode) {
        return currentState;
      }
      return freezeState({ ...currentState, mode });
    }
    case "sync/mic": {
      const { on } = event;
      if (!validateBoolean(on, "on")) {
        return currentState;
      }
      if (currentState.lastMicWasOn === on) {
        return currentState;
      }
      return freezeState({ ...currentState, lastMicWasOn: on });
    }
    case "sync/reset": {
      return currentState === INITIAL_STATE ? currentState : INITIAL_STATE;
    }
    default: {
      reportInvariant("received unknown event", { type: event.type });
      return currentState;
    }
  }
}

function notify() {
  subscribers.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[syncStore] subscriber threw", error);
      }
    }
  });
}

export function dispatch(eventOrType, payload) {
  let event = eventOrType;
  if (typeof eventOrType === "string") {
    event = { type: eventOrType };
    if (payload !== undefined) {
      event.payload = payload;
    }
  }

  if (!event || typeof event !== "object") {
    reportInvariant("dispatch requires an event object or type string", {
      event: eventOrType,
    });
    return state;
  }

  const nextState = applyEvent(state, event);
  if (nextState === state) {
    return state;
  }

  state = nextState;
  notify();

  if (typeof window !== "undefined" && typeof window.__syncLog === "function") {
    try {
      window.__syncLog("dispatch", { event, state });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[syncStore] failed to log telemetry", error);
      }
    }
  }

  return state;
}

export function getState() {
  return state;
}

export function subscribe(listener) {
  if (typeof listener !== "function") {
    reportInvariant("subscribe requires a function", { listener });
    return () => {};
  }

  subscribers.add(listener);
  listener(state);

  return () => {
    subscribers.delete(listener);
  };
}

if (typeof window !== "undefined" && typeof window.__pushSyncEvent !== "function") {
  window.__pushSyncEvent = function push(event) {
    return dispatch(event);
  };
}

export default {
  dispatch,
  getState,
  subscribe,
};
