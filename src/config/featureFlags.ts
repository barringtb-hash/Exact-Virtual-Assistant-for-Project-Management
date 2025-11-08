import type { InputPolicy, InputSyncLayer } from "../types/sync.ts";

type EnvValue = string | number | boolean | undefined | null;

const VALID_LAYERS: readonly InputSyncLayer[] = ["none", "local", "remote"];
const VALID_POLICIES: readonly InputPolicy[] = ["exclusive", "mixed"];

const DEFAULT_LAYER: InputSyncLayer = "none";
const DEFAULT_POLICY: InputPolicy = "exclusive";

function coerceString(value: EnvValue): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function pickEnvValue(keys: readonly string[]): EnvValue {
  if (typeof globalThis !== "undefined") {
    const overrides = globalThis.__FLAG_OVERRIDES__;
    if (overrides && typeof overrides === "object") {
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          return overrides[key];
        }
      }
    }
  }

  const env = (import.meta?.env ?? {}) as Record<string, EnvValue>;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      return env[key];
    }
  }

  return undefined;
}

function readEnumFlag<T extends string>(
  keys: readonly string[] | string,
  allowed: readonly T[],
  fallback: T,
): T {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const raw = pickEnvValue(keyList);
  const normalized = coerceString(raw)?.toLowerCase();

  if (!normalized) {
    return fallback;
  }

  const match = allowed.find((value) => value === normalized);
  return match ?? fallback;
}

export const FEATURE_FLAGS = {
  INPUT_SYNC_LAYER: readEnumFlag<InputSyncLayer>("VITE_INPUT_SYNC_LAYER", VALID_LAYERS, DEFAULT_LAYER),
  INPUT_POLICY: readEnumFlag<InputPolicy>("VITE_INPUT_POLICY", VALID_POLICIES, DEFAULT_POLICY),
} as const;

export type FeatureFlags = typeof FEATURE_FLAGS;
