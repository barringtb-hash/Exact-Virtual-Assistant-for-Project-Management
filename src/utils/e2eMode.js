const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function toBoolean(value) {
  if (value === true) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') {
      return false;
    }
    if (TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (!Number.isNaN(Number(normalized))) {
      return Number(normalized) !== 0;
    }
    return false;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return false;
}

function readCypressVoiceFlag(targetWindow) {
  if (!targetWindow) {
    return false;
  }

  const cypress = targetWindow.Cypress;
  if (!cypress) {
    return false;
  }

  const { env } = cypress;
  if (typeof env === 'function') {
    try {
      return toBoolean(env('VOICE_E2E'));
    } catch (error) {
      return false;
    }
  }

  if (env && typeof env === 'object') {
    return toBoolean(env.VOICE_E2E);
  }

  return false;
}

function readQueryFlag(targetWindow) {
  if (!targetWindow || !targetWindow.location || typeof targetWindow.location.search !== 'string') {
    return false;
  }

  try {
    const params = new URLSearchParams(targetWindow.location.search);
    const value = params.get('e2e');
    return toBoolean(value ?? false);
  } catch (error) {
    return false;
  }
}

export function isVoiceE2EModeActive(targetWindow = typeof window !== 'undefined' ? window : undefined) {
  return readQueryFlag(targetWindow) || readCypressVoiceFlag(targetWindow);
}

export function getVoiceE2EModeDebugInfo(targetWindow = typeof window !== 'undefined' ? window : undefined) {
  return {
    queryFlag: readQueryFlag(targetWindow),
    cypressFlag: readCypressVoiceFlag(targetWindow),
  };
}

export default isVoiceE2EModeActive;
