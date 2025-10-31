const activeControllers = new Map();

function registerStreamController(clientStreamId, threadId, controller) {
  const id = String(clientStreamId || "").trim();
  if (!id) {
    throw new Error("clientStreamId is required");
  }
  const normalizedThreadId = String(threadId || "").trim();
  for (const [existingId, entry] of activeControllers.entries()) {
    if (entry.threadId === normalizedThreadId && existingId !== id) {
      try {
        entry.controller.abort("replaced");
      } catch {
        // ignore abort errors
      }
      activeControllers.delete(existingId);
    }
  }

  activeControllers.set(id, { threadId: normalizedThreadId, controller });
  return () => {
    const existing = activeControllers.get(id);
    if (existing && existing.controller === controller) {
      activeControllers.delete(id);
    }
  };
}

function getStreamController(clientStreamId) {
  const id = String(clientStreamId || "").trim();
  if (!id) return null;
  return activeControllers.get(id) || null;
}

function removeStreamController(clientStreamId, controller) {
  const id = String(clientStreamId || "").trim();
  if (!id) return;
  const existing = activeControllers.get(id);
  if (existing && (!controller || existing.controller === controller)) {
    activeControllers.delete(id);
  }
}

function clearStreamControllers() {
  for (const entry of activeControllers.values()) {
    try {
      entry.controller.abort("cleared");
    } catch {
      // ignore abort failures
    }
  }
  activeControllers.clear();
}

export { activeControllers, registerStreamController, getStreamController, removeStreamController, clearStreamControllers };
