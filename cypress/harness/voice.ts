export interface VoiceHarnessOptions {
  /** Whether to stub out the MediaStream API for tests. */
  useMockMedia?: boolean;
  /** Whether to replace speech-to-text calls with fixtures. */
  useMockSpeechToText?: boolean;
}

/**
 * Returns a normalized set of voice testing options. Individual tests can
 * import this helper and spread the result into `Cypress.env` overrides.
 */
export const resolveVoiceHarnessOptions = (
  options: VoiceHarnessOptions = {}
): Required<VoiceHarnessOptions> => ({
  useMockMedia: options.useMockMedia ?? false,
  useMockSpeechToText: options.useMockSpeechToText ?? false,
});
