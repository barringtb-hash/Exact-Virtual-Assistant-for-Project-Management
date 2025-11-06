// Safe environment helpers that work in Vite, SSR, and Node-based tests.

type AnyEnv = Record<string, unknown> | undefined;

const getViteEnv = (): AnyEnv => {
  try {
    if (typeof import.meta !== "undefined" && (import.meta as any)?.env) {
      return (import.meta as any).env as Record<string, unknown>;
    }
  } catch (error) {
    // Swallow reference errors in Node test environments where import.meta is undefined.
  }
  return undefined;
};

const viteEnv: AnyEnv = getViteEnv();

const readOverride = (key: string): string | undefined => {
  if (typeof globalThis === "undefined") {
    return undefined;
  }

  const overrides = (globalThis as typeof globalThis & {
    __FLAG_OVERRIDES__?: Record<string, unknown>;
  }).__FLAG_OVERRIDES__;
  if (!overrides || !(key in overrides)) {
    return undefined;
  }

  const value = overrides[key];
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return undefined;
};

const readProcessEnv = (key: string): string | undefined => {
  if (typeof process === "undefined" || typeof process.env === "undefined") {
    return undefined;
  }

  return process.env[key];
};

const readViteEnv = (key: string): string | undefined => {
  if (!viteEnv || !(key in viteEnv)) {
    return undefined;
  }

  const value = viteEnv[key];
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }

  return undefined;
};

export const readEnv = (key: string, fallback?: string): string | undefined => {
  const override = readOverride(key);
  if (override !== undefined) {
    return override;
  }

  const fromVite = readViteEnv(key);
  if (fromVite !== undefined) {
    return fromVite;
  }

  const fromProcess = readProcessEnv(key);
  if (fromProcess !== undefined) {
    return fromProcess;
  }

  return fallback;
};

export const flag = (key: string, defaultBool = false): boolean => {
  const raw = readEnv(key);
  if (raw == null) {
    return defaultBool;
  }

  if (raw === "true" || raw === "1" || raw === "TRUE" || raw === "yes") {
    return true;
  }

  if (raw === "false" || raw === "0" || raw === "FALSE" || raw === "no") {
    return false;
  }

  return defaultBool;
};

export const isDevEnvironment = (): boolean => {
  if (viteEnv && Object.prototype.hasOwnProperty.call(viteEnv, "DEV")) {
    const dev = (viteEnv as Record<string, unknown>).DEV;
    if (typeof dev === "boolean") {
      return dev;
    }
    if (typeof dev === "string") {
      return dev === "true";
    }
  }

  const nodeEnv = readProcessEnv("NODE_ENV");
  if (nodeEnv) {
    return nodeEnv !== "production";
  }

  return false;
};

export const isCypress = (): boolean => flag("VITE_CYPRESS_SAFE_MODE", false);
