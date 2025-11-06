export function isCypress(): boolean {
  if (typeof window !== "undefined") {
    const overrides = (window as typeof window & {
      __FLAG_OVERRIDES__?: Record<string, unknown>;
    }).__FLAG_OVERRIDES__;
    const override = overrides?.VITE_CYPRESS_SAFE_MODE;
    if (override === true || override === "true") {
      return true;
    }
  }

  return import.meta.env.VITE_CYPRESS_SAFE_MODE === "true";
}
