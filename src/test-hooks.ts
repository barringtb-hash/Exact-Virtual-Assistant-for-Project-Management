export type TestHookOptions = {
  setPreviewText: (text: string) => void;
};

export function registerTestHooks(options: TestHookOptions) {
  if (typeof window === "undefined") {
    return;
  }

  if (import.meta.env.VITE_CYPRESS_SAFE_MODE !== "true") {
    return;
  }

  const globalScope = window as typeof window & {
    __test?: Record<string, unknown>;
  };

  const inject = (text: string) => {
    options.setPreviewText(text);
    window.dispatchEvent(
      new CustomEvent("test:preview-updated", {
        detail: { text },
      }),
    );
  };

  globalScope.__test = globalScope.__test || {};
  globalScope.__test.injectTranscript = inject;
}
