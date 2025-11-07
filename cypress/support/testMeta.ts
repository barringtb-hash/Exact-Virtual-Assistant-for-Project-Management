export interface ScenarioMetadata {
  scenario: string;
  feature?: string;
  subsystem?: string;
  envs?: string[];
  risk?: string;
  owner?: string;
  ci_suites?: string[];
  flaky?: boolean;
  needs_review?: boolean;
  preconditions?: string[];
  data_setup?: string;
  refs?: string[];
}

/**
 * Utility wrapper that emits a structured log for the Cypress runner so that
 * the metadata header is visible in the command log during triage.
 */
export function withScenario(meta: ScenarioMetadata, run: () => void) {
  describe(meta.scenario, () => {
    before(() => {
      Cypress.log({
        name: 'scenario-meta',
        message: JSON.stringify(meta, null, 2),
      });
    });

    run();
  });
}
