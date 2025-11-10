/**
 * Central place to describe selectors that are shared across Cypress support
 * helpers and the test harness. Keeping them in one file helps avoid drift
 * between the tests and custom commands that rely on the same DOM hooks.
 */
export const COMPOSER_SELECTOR_PRIORITIES = [
  '[data-testid="composer-input"]',
  '[data-testid="composer-textarea"]',
  '[data-testid="charter-wizard-input"]',
  '[data-testid="guided-input"]',
  '[data-testid="charter-guided-input"]',
] as const;

export type ComposerSelector = (typeof COMPOSER_SELECTOR_PRIORITIES)[number];

export const harnessSelectors = {
  composerRoot: '[data-testid="composer-root"]',
  composerInputOrTextarea: COMPOSER_SELECTOR_PRIORITIES.join(', '),
} as const;

export type HarnessSelectorKey = keyof typeof harnessSelectors;

export const getHarnessSelector = (key: HarnessSelectorKey) =>
  harnessSelectors[key];
