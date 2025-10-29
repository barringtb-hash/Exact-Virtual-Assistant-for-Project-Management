export function formatDocRenderError(error) {
  const docType =
    typeof error?.docType === "string" && error.docType.trim()
      ? error.docType.trim()
      : "document";
  const docLabel =
    typeof error?.docLabel === "string" && error.docLabel.trim()
      ? error.docLabel.trim()
      : docType.charAt(0).toUpperCase() + docType.slice(1);

  const details = [];
  const structuredErrors = [];
  const explanations = error?.properties?.errors;

  if (Array.isArray(explanations)) {
    for (const item of explanations) {
      const explanation = item?.properties?.explanation;
      if (typeof explanation === "string" && explanation.trim().length > 0) {
        const message = explanation.trim();
        details.push(message);
        structuredErrors.push({ message });
      }
    }
  }

  const validationErrors = Array.isArray(error?.validationErrors)
    ? error.validationErrors
    : [];

  for (const validationError of validationErrors) {
    if (!validationError || typeof validationError !== "object") {
      continue;
    }

    const instancePath =
      typeof validationError.instancePath === "string"
        ? validationError.instancePath
        : "";
    const message =
      typeof validationError.message === "string"
        ? validationError.message
        : "is invalid";

    structuredErrors.push({ ...validationError, instancePath, message });

    const displayPath = instancePath.replace(/^\//, "").replace(/\//g, " › ");
    const formatted = displayPath ? `${displayPath} – ${message}` : message;
    details.push(formatted);
  }

  if (details.length === 0 && typeof error?.message === "string") {
    details.push(error.message);
  }

  const normalizedErrors = structuredErrors.map((item) => ({
    instancePath: typeof item.instancePath === "string" ? item.instancePath : undefined,
    message: typeof item.message === "string" ? item.message : "is invalid",
    keyword: typeof item.keyword === "string" ? item.keyword : undefined,
    params:
      item.params && typeof item.params === "object"
        ? { ...item.params }
        : undefined,
    schemaPath: typeof item.schemaPath === "string" ? item.schemaPath : undefined,
  }));

  const safeType = docType.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "document";

  return {
    error: {
      code: `invalid_${safeType}_payload`,
      message: `${docLabel} payload is invalid for the export template.`,
      details: details.length > 1 ? details : details[0],
    },
    errors: normalizedErrors.length > 0 ? normalizedErrors : undefined,
  };
}

export function isDocRenderValidationError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (Array.isArray(error?.validationErrors)) {
    return true;
  }

  if (Array.isArray(error?.properties?.errors)) {
    return true;
  }

  const name = typeof error.name === "string" ? error.name : "";
  return /ValidationError$/u.test(name);
}

export function formatInvalidDocPayload(message, details, { docType, docLabel } = {}) {
  const safeType =
    typeof docType === "string" && docType.trim()
      ? docType.trim().replace(/[^a-z0-9]+/gi, "_").toLowerCase()
      : "document";
  const label =
    typeof docLabel === "string" && docLabel.trim()
      ? docLabel.trim()
      : safeType.charAt(0).toUpperCase() + safeType.slice(1);

  return {
    error: {
      code: `invalid_${safeType}_payload`,
      message: message || `${label} payload is invalid.`,
      details: details || undefined,
    },
  };
}

