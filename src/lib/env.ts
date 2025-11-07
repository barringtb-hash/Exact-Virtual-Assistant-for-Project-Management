type Raw = string | number | boolean | undefined | null;

declare global {
  // eslint-disable-next-line no-var
  var __FLAG_OVERRIDES__:
    | Record<string, Raw>
    | undefined;
}

function readEnv(key: string): Raw {
  if (typeof globalThis !== "undefined") {
    const overrides = globalThis.__FLAG_OVERRIDES__;
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
      return overrides[key];
    }
  }

  const env = (import.meta?.env ?? {}) as Record<string, Raw>;
  return Object.prototype.hasOwnProperty.call(env, key) ? env[key] : undefined;
}

export function envTruthy(v: Raw): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

export const SAFE_MODE = envTruthy(readEnv("VITE_CYPRESS_SAFE_MODE"));
export const GUIDED_BACKEND_ON = envTruthy(readEnv("VITE_CHARTER_GUIDED_BACKEND"));
export const WIZARD_VISIBLE = envTruthy(readEnv("VITE_CHARTER_WIZARD_VISIBLE"));
export const AUTO_EXTRACTION_ENABLED = envTruthy(readEnv("VITE_AUTO_EXTRACTION_ENABLED"));
