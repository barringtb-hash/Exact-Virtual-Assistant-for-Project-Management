export async function docApi(operation, payload, { fetchImpl, signal, bases } = {}) {
  const supportedOperations = new Set(['extract', 'validate', 'render']);
  if (!supportedOperations.has(operation)) {
    throw new Error(`Unsupported doc API operation: ${operation}`);
  }

  const fetchFn = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  const body = payload === undefined ? undefined : JSON.stringify(payload);

  const baseList = Array.isArray(bases) && bases.length > 0 ? bases : ['/api/documents', '/api/doc'];
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
        return response.json();
      }
      if (response.status === 404) {
        lastError = new Error(`${base}/${operation} returned 404`);
        lastError.status = response.status;
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
