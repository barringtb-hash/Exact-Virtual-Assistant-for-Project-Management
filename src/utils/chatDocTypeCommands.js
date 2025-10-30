import { isDocTypeConfirmed, normalizeDocTypeSuggestion } from "./docTypeRouter.js";

function toDocTypeId(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed;
}

export function resolveManualSyncDocType({ snapshot, confirmThreshold = 0.7 } = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const {
    docRouterEnabled,
    previewDocType,
    defaultDocType,
    supportedDocTypes,
    docType,
    suggestedDocType,
  } = snapshot;

  const allowed = supportedDocTypes instanceof Set ? supportedDocTypes : new Set();

  if (!docRouterEnabled) {
    return previewDocType || defaultDocType || null;
  }

  if (typeof docType === "string" && allowed.has(docType)) {
    return docType;
  }

  const suggestion = suggestedDocType || snapshot.suggested || null;
  if (
    suggestion &&
    typeof suggestion.type === "string" &&
    allowed.has(suggestion.type) &&
    isDocTypeConfirmed({
      selectedDocType: docType && allowed.has(docType) ? docType : null,
      suggestion,
      threshold: confirmThreshold,
      allowedTypes: allowed,
    })
  ) {
    return suggestion.type;
  }

  return null;
}

export function handleTypeCommand({
  command,
  metadataMap,
  supportedDocTypes,
  setDocType,
  setSuggested,
  closeDocTypeModal,
  pushToast,
} = {}) {
  const registry = supportedDocTypes instanceof Set ? supportedDocTypes : new Set();
  const docsMetadata = metadataMap instanceof Map ? metadataMap : new Map();

  const match = typeof command === "string" ? command.match(/^\s*\/type\s+(\S+)/i) : null;
  const rawId = match?.[1] || "";
  const nextId = toDocTypeId(rawId);

  if (!nextId) {
    if (typeof pushToast === "function") {
      pushToast({
        tone: "warning",
        message: "Include a document ID after `/type`. Example: `/type charter`.",
      });
    }
    return { handled: true, ok: false, reason: "missing-id" };
  }

  if (!registry.has(nextId)) {
    const options = Array.from(registry.values()).join(", ");
    if (typeof pushToast === "function") {
      pushToast({
        tone: "warning",
        message: `“${rawId.trim() || nextId}” isn’t a recognized document template. Try one of: ${options}.`,
      });
    }
    return { handled: true, ok: false, reason: "unknown-type", docType: nextId };
  }

  if (typeof setDocType === "function") {
    setDocType(nextId);
  }

  if (typeof setSuggested === "function") {
    setSuggested(normalizeDocTypeSuggestion({ type: nextId, confidence: 1 }));
  }

  if (typeof closeDocTypeModal === "function") {
    closeDocTypeModal();
  }

  const label = docsMetadata.get(nextId)?.label || nextId;
  if (typeof pushToast === "function") {
    pushToast({
      tone: "success",
      message: `I’ll use the ${label} template for syncing.`,
    });
  }

  return { handled: true, ok: true, docType: nextId, label };
}

export async function handleSyncCommand({
  docRouterEnabled,
  docTypeOverride,
  resolveDocType,
  openDocTypePicker,
  manualDocTypePrompt,
  pushToast,
  isBusy,
  canSyncNow,
  appendAssistantMessage,
  extractAndPopulate,
  buildDocTypeConfig,
  parseFallbackMessage = "I couldn’t parse the last turn—keeping your entries.",
  onStart,
  onSuccess,
  onParseFallback,
  onError,
  onComplete,
} = {}) {
  const determineDocType = () => {
    const overrideId = toDocTypeId(docTypeOverride);
    if (overrideId) {
      return overrideId;
    }
    if (typeof resolveDocType === "function") {
      const resolved = toDocTypeId(resolveDocType());
      if (resolved) {
        return resolved;
      }
    }
    return "";
  };

  const targetDocType = determineDocType();

  if (!targetDocType) {
    if (docRouterEnabled && typeof openDocTypePicker === "function") {
      openDocTypePicker();
    }
    if (typeof pushToast === "function" && manualDocTypePrompt) {
      pushToast({ tone: "warning", message: manualDocTypePrompt });
    }
    return { handled: true, ok: false, reason: "docTypeRequired" };
  }

  const config = typeof buildDocTypeConfig === "function"
    ? buildDocTypeConfig(targetDocType)
    : { label: "Document" };
  const label = config?.label || "Document";
  const previewLabel = `${label} preview`;

  if (isBusy) {
    if (typeof appendAssistantMessage === "function") {
      appendAssistantMessage(
        `I’m already updating the ${previewLabel}. I’ll let you know when it’s ready.`
      );
    }
    return { handled: true, ok: false, reason: "busy", docType: targetDocType };
  }

  if (!canSyncNow) {
    if (typeof appendAssistantMessage === "function") {
      appendAssistantMessage(
        `Share some scope details, notes, or attachments and I’ll update the ${previewLabel}.`
      );
    }
    return { handled: true, ok: false, reason: "idle", docType: targetDocType };
  }

  if (typeof onStart === "function") {
    onStart(targetDocType);
  }

  try {
    const result = typeof extractAndPopulate === "function"
      ? await extractAndPopulate({ docType: targetDocType })
      : { ok: false, reason: "unavailable" };

    if (result?.reason === "parse-fallback") {
      const message = parseFallbackMessage;
      if (typeof onParseFallback === "function") {
        onParseFallback(message, result);
      }
      if (typeof appendAssistantMessage === "function") {
        appendAssistantMessage(`${message}`);
      }
      return {
        handled: true,
        ok: false,
        reason: "parse-fallback",
        docType: targetDocType,
        data: result?.data,
      };
    }

    if (!result?.ok) {
      const fallbackMessage = `Unable to update the ${previewLabel}. Please try again.`;
      if (typeof onError === "function") {
        onError(fallbackMessage, result?.error);
      }
      if (typeof appendAssistantMessage === "function") {
        appendAssistantMessage(`I couldn’t update the preview: ${fallbackMessage}`);
      }
      return {
        handled: true,
        ok: false,
        reason: result?.reason || "error",
        docType: targetDocType,
        error: result?.error,
      };
    }

    if (typeof onSuccess === "function") {
      onSuccess(result);
    }
    if (typeof appendAssistantMessage === "function") {
      appendAssistantMessage(`I’ve refreshed the ${previewLabel} with the latest context.`);
    }
    return { handled: true, ok: true, docType: targetDocType, draft: result.draft };
  } catch (error) {
    const fallbackMessage =
      typeof error?.message === "string" && error.message.trim()
        ? error.message.trim()
        : `Unable to update the ${previewLabel}. Please try again.`;
    if (typeof onError === "function") {
      onError(fallbackMessage, error);
    }
    if (typeof appendAssistantMessage === "function") {
      appendAssistantMessage(`I couldn’t update the preview: ${fallbackMessage}`);
    }
    return { handled: true, ok: false, reason: "error", docType: targetDocType, error };
  } finally {
    if (typeof onComplete === "function") {
      onComplete(targetDocType);
    }
  }
}
