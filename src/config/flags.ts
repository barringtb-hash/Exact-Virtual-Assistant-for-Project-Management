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

// Default ON (true) when the env variable is not provided.
export const FEATURE_MIC_LEVEL =
  rawMicLevelFlag === undefined
    ? true
    : rawMicLevelFlag === "1" || rawMicLevelFlag === "true";
