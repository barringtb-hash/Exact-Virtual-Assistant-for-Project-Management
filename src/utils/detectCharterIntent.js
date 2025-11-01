export function detectCharterIntent(raw) {
  const s = String(raw || "").toLowerCase();

  // Create / start a charter
  const createPhrases = [
    /\b(create|make|draft|generate|build|prepare|produce|start|begin)\b.*\b(project\s+)?charter\b/,
    /\b(i|we)\b.*\b(want|would like|need|plan|going)\b.*\b(to\s+)?(create|make|draft|generate|start|begin)\b.*\b(project\s+)?charter\b/,
    /\b(project\s+)?charter\b.*\b(from|using|based on)\b.*\b(file|doc|document|attachment|upload)\b/,
  ];
  if (createPhrases.some((re) => re.test(s))) return "create_charter";

  // Update / refresh a charter
  const updatePhrases = [
    /\b(update|refresh|revise|amend|sync)\b.*\b(project\s+)?charter\b/,
    /\b(project\s+)?charter\b.*\b(update|refresh|revise|amend|sync)\b/,
  ];
  if (updatePhrases.some((re) => re.test(s))) return "update_charter";

  return null;
}
