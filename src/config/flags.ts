/**
 * Feature flags for the application
 * Enable/disable features for safe rollout and testing
 */

const rawMicLevelFlag =
  typeof import.meta !== "undefined" &&
  import.meta.env &&
  typeof import.meta.env.VITE_FEATURE_MIC_LEVEL !== "undefined"
    ? import.meta.env.VITE_FEATURE_MIC_LEVEL
    : undefined;

const truthyValues = new Set(["1", "true", "on", "yes"]);
const falsyValues = new Set(["0", "false", "off", "no"]);

const parseEnvBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;

  const normalized = value.trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falsyValues.has(normalized)) return false;

  return defaultValue;
};

// Default ON (true) when the env variable is not provided or unrecognised.
export const FEATURE_MIC_LEVEL = parseEnvBoolean(rawMicLevelFlag, true);
