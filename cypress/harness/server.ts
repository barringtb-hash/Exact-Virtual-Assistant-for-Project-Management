export interface TestServerConfig {
  /**
   * Base URL that Cypress should target. Typically pulled from the environment
   * in `cypress.config.ts`, but we keep it configurable for ad-hoc runs.
   */
  baseUrl: string;
}

/**
 * Placeholder for future harness server helpers. The function currently acts as
 * a simple factory that returns the resolved configuration so tests can import
 * a single helper without needing to duplicate defaults.
 */
export const createTestServerConfig = (
  config: TestServerConfig
): TestServerConfig => ({
  ...config,
});
