/**
 * LLM-based intent detection for charter creation.
 * Uses reasoning to understand user intent rather than relying on key phrases.
 */

const INTENT_DETECTION_PROMPT = `You are an intent classifier. Analyze the user's message and determine if they want to create or start a new project charter.

The user might express this intent in many ways, such as:
- Directly asking to create/make/draft a charter
- Asking to start a new project
- Saying they want to document a project
- Asking for help with project planning or kickoff
- Mentioning they have a new project idea
- Asking to set up project goals, scope, or objectives
- Any indication they want to begin the charter creation process

Respond with ONLY one of these exact words:
- "create_charter" - if the user wants to create/start a new project charter
- "update_charter" - if the user wants to update/modify an existing charter
- "none" - if the user's intent is unrelated to charter creation/updates

User message: "{MESSAGE}"

Your classification:`;

/**
 * Detects charter intent using LLM reasoning.
 * @param {string} message - The user's message to analyze
 * @returns {Promise<"create_charter" | "update_charter" | null>} The detected intent or null
 */
export async function detectCharterIntentLLM(message) {
  if (!message || typeof message !== "string" || !message.trim()) {
    return null;
  }

  try {
    const prompt = INTENT_DETECTION_PROMPT.replace("{MESSAGE}", message.trim());

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are a precise intent classifier. Respond with exactly one word: create_charter, update_charter, or none.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        // Use a smaller/faster model if available, or default
        temperature: 0,
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      console.warn("[detectCharterIntentLLM] API request failed:", response.status);
      return null;
    }

    const data = await response.json();
    const result = (data?.content || data?.message || "").toLowerCase().trim();

    if (result.includes("create_charter")) {
      return "create_charter";
    }
    if (result.includes("update_charter")) {
      return "update_charter";
    }

    return null;
  } catch (error) {
    console.warn("[detectCharterIntentLLM] Error detecting intent:", error);
    return null;
  }
}
