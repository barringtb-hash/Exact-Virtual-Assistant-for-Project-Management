/**
 * Health check endpoint to verify API key configuration
 * GET /api/debug/health
 */

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const checks = {
      timestamp: new Date().toISOString(),
      apiKeyConfigured: false,
      apiKeyLength: 0,
      apiKeyPrefix: "",
      nodeEnv: process.env.NODE_ENV || "unknown",
      vercelEnv: process.env.VERCEL_ENV || "not-vercel",
    };

    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey && typeof apiKey === "string") {
      const trimmed = apiKey.trim();
      checks.apiKeyConfigured = trimmed.length > 0;
      checks.apiKeyLength = trimmed.length;

      // Only show first 7 chars for security (sk-proj-)
      if (trimmed.length > 7) {
        checks.apiKeyPrefix = trimmed.substring(0, 7) + "...";
      }
    }

    // Don't cache this response
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.status(200).json({
      status: "ok",
      checks,
      message: checks.apiKeyConfigured
        ? "API key is configured"
        : "⚠️ OPENAI_API_KEY is missing or empty",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({
      status: "error",
      error: error?.message || "Health check failed",
    });
  }
}
