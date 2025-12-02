/**
 * Detects user intent from voice transcripts for PMO tools.
 * This enables intent-driven activation of voice-based tools rather than
 * automatic triggering when the mic button is pressed.
 *
 * @param {string} transcript - The transcribed voice input
 * @returns {{ type: 'charter' | 'ddp' | 'sow' | 'general', action: string | null }}
 */
export function detectVoiceIntent(transcript) {
  const s = String(transcript || "").toLowerCase();

  // Charter creation intent - explicit requests to create/start a charter via voice
  const charterPhrases = [
    // Direct charter creation requests
    /\b(create|make|start|begin|draft|generate|build)\b.*\b(project\s+)?charter\b/,
    /\b(project\s+)?charter\b.*\b(create|make|start|begin|draft|generate|build)\b/,
    // Voice-specific charter requests
    /\bvoice\s+charter\b/,
    /\b(use\s+)?voice\b.*\b(for|to)\b.*\bcharter\b/,
    // Conversational charter requests
    /\b(help\s+me|let'?s|i\s+want\s+to|i\s+need\s+to|can\s+you)\b.*\b(project\s+)?charter\b/,
    // Guide me through charter
    /\b(guide|walk)\s+(me\s+)?through\b.*\bcharter\b/,
  ];
  if (charterPhrases.some((re) => re.test(s))) {
    return { type: "charter", action: "create" };
  }

  // Future: Design & Development Plan intent
  const ddpPhrases = [
    /\b(create|make|start|begin|draft|generate)\b.*\b(design\s*(and|&)?\s*development|d\s*&?\s*d)\s+plan\b/,
    /\b(design\s*(and|&)?\s*development|d\s*&?\s*d)\s+plan\b.*\b(create|make|start|begin|draft)\b/,
  ];
  if (ddpPhrases.some((re) => re.test(s))) {
    return { type: "ddp", action: "create" };
  }

  // Future: Statement of Work intent
  const sowPhrases = [
    /\b(create|make|start|begin|draft|generate)\b.*\b(statement\s+of\s+work|sow)\b/,
    /\b(statement\s+of\s+work|sow)\b.*\b(create|make|start|begin|draft)\b/,
  ];
  if (sowPhrases.some((re) => re.test(s))) {
    return { type: "sow", action: "create" };
  }

  // No specific PMO tool intent detected - general voice input
  return { type: "general", action: null };
}
