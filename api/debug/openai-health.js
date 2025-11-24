// /api/debug/openai-health.js - Diagnostic endpoint to test OpenAI API key
import OpenAI from "openai";

export default async function handler(req, res) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();

  const diagnostics = {
    timestamp: new Date().toISOString(),
    apiKeyPresent: !!apiKey,
    apiKeyLength: apiKey.length,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + "..." : "N/A",
    apiKeySuffix: apiKey ? "..." + apiKey.substring(apiKey.length - 4) : "N/A",
    testResult: null,
    error: null,
    errorDetails: null,
  };

  if (!apiKey) {
    diagnostics.testResult = "FAIL";
    diagnostics.error = "No API key configured";
    return res.status(500).json(diagnostics);
  }

  try {
    const client = new OpenAI({ apiKey });

    // Make the smallest possible API call - list models
    const startTime = Date.now();
    const models = await client.models.list();
    const duration = Date.now() - startTime;

    diagnostics.testResult = "PASS";
    diagnostics.responseTime = `${duration}ms`;
    diagnostics.modelsAvailable = models.data?.length || 0;
    diagnostics.sampleModels = models.data?.slice(0, 3).map(m => m.id) || [];

    return res.status(200).json(diagnostics);
  } catch (error) {
    diagnostics.testResult = "FAIL";
    diagnostics.error = error.message;
    diagnostics.errorDetails = {
      status: error.status || error.statusCode,
      code: error.code,
      type: error.type,
      headers: error.headers ? Object.fromEntries(
        Object.entries(error.headers).filter(([k]) =>
          k.toLowerCase().includes('rate') ||
          k.toLowerCase().includes('limit') ||
          k.toLowerCase().includes('retry')
        )
      ) : null,
    };

    const status = error.status || error.statusCode || 500;
    return res.status(status).json(diagnostics);
  }
}
