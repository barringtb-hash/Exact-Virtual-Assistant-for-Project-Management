import type { FlagEnvValue, FlagState } from "../config/flags.ts";

export {};

declare global {
  interface Window {
    __FLAG_OVERRIDES__?: Record<string, FlagEnvValue>;
    __APP_FLAGS__?: FlagState;
    __E2E_FLAGS__?: Partial<FlagState>;
  }

  // eslint-disable-next-line no-var
  var __FLAG_OVERRIDES__:
    | Record<string, FlagEnvValue>
    | undefined;
}
