export async function docApi(operation, payload, { fetchImpl, signal, bases } = {}) {
  const supportedOperations = new Set(['extract', 'validate', 'render']);
  if (!supportedOperations.has(operation)) {
    throw new Error(`Unsupported doc API operation: ${operation}`);
  }

  const fetchFn = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  const body = payload === undefined ? undefined : JSON.stringify(payload);

  const baseList = Array.isArray(bases) && bases.length > 0 ? bases : ['/api/documents', '/api/doc'];
  const fallbackStatuses = new Set([401, 403]);
  let lastError;

  for (const base of baseList) {
    try {
      const response = await fetchFn(`${base}/${operation}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal,
      });
      if (response.ok) {
        try {
          return await response.json();
        } catch (parseError) {
          const contentType =
            typeof response.headers?.get === "function"
              ? response.headers.get("content-type")
              : undefined;
          const message = `${base}/${operation} returned a non-JSON response.`;
          const error = new Error(message);
          error.status = response.status;
          error.cause = parseError;
          error.payload = {
            error: {
              message,
              contentType: contentType || null,
            },
          };
          error.contentType = contentType || null;
          throw error;
        }
      }
      if (response.status === 404) {
        lastError = new Error(`${base}/${operation} returned 404`);
        lastError.status = response.status;
        continue;
      }

      if (fallbackStatuses.has(response.status)) {
        const error = new Error(`${base}/${operation} failed with status ${response.status}`);
        error.status = response.status;
        error.payload = await response.json().catch(() => undefined);
        lastError = error;
        continue;
      }

      const error = new Error(`${base}/${operation} failed with status ${response.status}`);
      error.status = response.status;
      error.payload = await response.json().catch(() => undefined);
      throw error;
    } catch (error) {
      if (error?.status === 404) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('Doc API not available');
}

export default docApi;
