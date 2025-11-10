/**
 * Shared map of `data-testid` selectors used throughout the Cypress harness.
 * Keeping the selectors centralized ensures that custom commands and tests stay
 * in sync whenever the application markup evolves.
 */
export const S = {
  appReady: '[data-testid="app-ready"]',
  appHeader: '[data-testid="app-header"]',
  chatPanel: '[data-testid="chat-panel"]',
  composerRoot: '[data-testid="composer-root"]',
  composerInput: '[data-testid="composer-input"]',
  composerTextareaLegacy: '[data-testid="composer-textarea"]',
  composerSend: '[data-testid="composer-send"]',
  micButton: '[data-testid="mic-button"]',
  previewPanel: '[data-testid="preview-panel"]',
  previewPendingOverlay: '[data-testid="preview-pending-overlay"]',
  charterStartButton: '[data-testid="btn-start-charter"]',
} as const;

export type SelectorKey = keyof typeof S;

export const getSelector = (key: SelectorKey): string => S[key];

export const resolveTestIdSelector = (testId: SelectorKey | string): string => {
  if (testId in S) {
    return S[testId as SelectorKey];
  }
  return `[data-testid="${String(testId)}"]`;
};
