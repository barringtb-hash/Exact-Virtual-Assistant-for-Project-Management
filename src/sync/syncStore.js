import { voiceActions, voiceStoreApi } from "../state/voiceStore.ts";
import { asrService } from "../voice/ASRService.ts";

const INITIAL_STATE = Object.freeze({
  mode: "idle",
  lastMicWasOn: false,
  resumeMicAfterSubmit: false,
  awaitingPreview: false,
  pausedForText: false,
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

function getVoiceStatus() {
  try {
    if (!voiceStoreApi || typeof voiceStoreApi.getState !== "function") {
      return undefined;
    }
    return voiceStoreApi.getState().status;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[syncStore] failed to read voice status", error);
    }
    return undefined;
  }
}

function setVoiceStatus(status) {
  try {
    if (!voiceActions || typeof voiceActions.setStatus !== "function") {
      return;
    }
    voiceActions.setStatus(status);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[syncStore] failed to update voice status", error);
    }
  }
}

function getLastVoiceUtterance() {
  try {
    if (!voiceStoreApi || typeof voiceStoreApi.getState !== "function") {
      return null;
    }
    const transcripts = voiceStoreApi.getState().transcripts;
    if (!Array.isArray(transcripts) || transcripts.length === 0) {
      return null;
    }
    const lastEntry = transcripts[transcripts.length - 1];
    const text = typeof lastEntry?.text === "string" ? lastEntry.text.trim() : "";
    return text || null;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[syncStore] failed to read last utterance", error);
    }
    return null;
  }
}

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

function commit(event, nextState) {
  if (nextState === state) {
    return state;
  }

  state = nextState;
  notify();

  if (typeof window !== "undefined" && typeof window.__syncLog === "function") {
    try {
      window.__syncLog("dispatch", { event, state: nextState });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[syncStore] failed to log telemetry", error);
      }
    }
  }

  return state;
}

function handleVoiceStart(event) {
  const nextState = freezeState({
    ...state,
    mode: "listening",
    lastMicWasOn: true,
    resumeMicAfterSubmit: false,
    awaitingPreview: false,
    pausedForText: false,
  });
  return commit(event, nextState);
}

function handleVoiceStop(event) {
  const nextState = freezeState({
    ...state,
    mode: "idle",
    lastMicWasOn: false,
    resumeMicAfterSubmit: false,
    awaitingPreview: false,
    pausedForText: false,
  });
  return commit(event, nextState);
}

function handleVoiceError(event) {
  const nextState = freezeState({
    ...state,
    mode: "error",
    lastMicWasOn: false,
    resumeMicAfterSubmit: false,
    awaitingPreview: false,
    pausedForText: false,
  });
  return commit(event, nextState);
}

function handleTextFocus(event) {
  const status = getVoiceStatus();
  const wasActive = status === "listening" || status === "transcribing";
  if (wasActive) {
    try {
      if (asrService && typeof asrService.stop === "function") {
        asrService.stop();
      } else {
        setVoiceStatus("idle");
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[syncStore] failed to stop active voice stream", error);
      }
      setVoiceStatus("idle");
    }
  }

  const lastUtterance = wasActive ? getLastVoiceUtterance() : null;
  const nextState = freezeState({
    ...state,
    mode: "idle",
    lastMicWasOn: wasActive ? true : state.lastMicWasOn,
    resumeMicAfterSubmit: wasActive,
    awaitingPreview: false,
    pausedForText: wasActive,
  });
  const augmentedEvent = {
    ...event,
    pausedForText: wasActive,
    lastUserUtterance: lastUtterance ?? event?.lastUserUtterance,
  };
  return commit(augmentedEvent, nextState);
}

function handleTextSubmit(event) {
  const pausedForText = state.resumeMicAfterSubmit;

  const nextState = freezeState({
    ...state,
    mode: "thinking",
    awaitingPreview: true,
    pausedForText,
  });
  const augmentedEvent = { ...event, pausedForText };
  return commit(augmentedEvent, nextState);
}

function handlePreviewUpdated(event) {
  const source = event?.payload?.source;
  if (source !== "text") {
    return state;
  }

  if (!state.awaitingPreview) {
    return state;
  }

  const shouldResume = state.resumeMicAfterSubmit;
  const nextState = freezeState({
    ...state,
    mode: "speaking",
    awaitingPreview: false,
    pausedForText: false,
  });
  const augmentedEvent = { ...event, resumedMic: shouldResume };
  commit(augmentedEvent, nextState);

  if (!shouldResume) {
    return state;
  }

  setVoiceStatus("listening");
  const resumedState = freezeState({
    ...state,
    mode: "listening",
    lastMicWasOn: true,
    resumeMicAfterSubmit: false,
    pausedForText: false,
  });
  return commit({ type: "VOICE_RESUMED", resumed: true }, resumedState);
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

  switch (event.type) {
    case "VOICE_START":
      return handleVoiceStart(event);
    case "VOICE_STOP":
      return handleVoiceStop(event);
    case "VOICE_ERROR":
      return handleVoiceError(event);
    case "TEXT_FOCUS":
      return handleTextFocus(event);
    case "TEXT_SUBMIT":
      return handleTextSubmit(event);
    case "PREVIEW_UPDATED":
      return handlePreviewUpdated(event);
    default: {
      const nextState = applyEvent(state, event);
      return commit(event, nextState);
    }
  }
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
