// /api/debug/chat-test.js - Test chat completions directly
import OpenAI from "openai";

export default async function handler(req, res) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  const configuredModel = process.env.CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

  const diagnostics = {
    timestamp: new Date().toISOString(),
    configuredModel,
    apiKeyLength: apiKey.length,
    envVars: {
      CHAT_MODEL: process.env.CHAT_MODEL || "(not set)",
      OPENAI_MODEL: process.env.OPENAI_MODEL || "(not set)",
      OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL || "(not set)",
    },
    testResult: null,
    request: null,
    response: null,
    error: null,
  };

  if (!apiKey) {
    diagnostics.testResult = "FAIL";
    diagnostics.error = "No API key";
    return res.status(500).json(diagnostics);
  }

  // Test with a simple chat completion
  const testMessages = [
    { role: "system", content: "You are a helpful assistant. Respond with exactly: OK" },
    { role: "user", content: "Test" }
  ];

  // Try with the configured model first, then fallback to gpt-3.5-turbo
  const modelsToTry = [configuredModel, "gpt-4o-mini", "gpt-3.5-turbo"];

  for (const model of modelsToTry) {
    try {
      const client = new OpenAI({ apiKey });

      diagnostics.request = {
        model,
        messages: testMessages,
        max_tokens: 10,
      };

      console.log(`[chat-test] Trying model: ${model}`);
      const startTime = Date.now();

      const completion = await client.chat.completions.create({
        model,
        messages: testMessages,
        max_tokens: 10,
        temperature: 0,
      });

      const duration = Date.now() - startTime;

      diagnostics.testResult = "PASS";
      diagnostics.response = {
        model: completion.model,
        content: completion.choices?.[0]?.message?.content,
        usage: completion.usage,
        duration: `${duration}ms`,
      };

      console.log(`[chat-test] Success with model: ${model}`);
      return res.status(200).json(diagnostics);

    } catch (error) {
      console.log(`[chat-test] Failed with model ${model}:`, error.message, "Status:", error.status);

      diagnostics.error = {
        model,
        message: error.message,
        status: error.status || error.statusCode,
        code: error.code,
        type: error.type,
        headers: error.headers ? {
          'x-ratelimit-limit-requests': error.headers['x-ratelimit-limit-requests'],
          'x-ratelimit-limit-tokens': error.headers['x-ratelimit-limit-tokens'],
          'x-ratelimit-remaining-requests': error.headers['x-ratelimit-remaining-requests'],
          'x-ratelimit-remaining-tokens': error.headers['x-ratelimit-remaining-tokens'],
          'x-ratelimit-reset-requests': error.headers['x-ratelimit-reset-requests'],
          'x-ratelimit-reset-tokens': error.headers['x-ratelimit-reset-tokens'],
          'retry-after': error.headers['retry-after'],
        } : null,
      };

      // If it's not a model-specific error, don't try other models
      if (error.status !== 404 && error.status !== 400) {
        diagnostics.testResult = "FAIL";
        return res.status(error.status || 500).json(diagnostics);
      }
    }
  }

  diagnostics.testResult = "FAIL";
  diagnostics.error = diagnostics.error || "All models failed";
  return res.status(500).json(diagnostics);
}
