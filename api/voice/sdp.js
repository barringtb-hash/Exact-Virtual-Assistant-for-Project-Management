export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb"
    }
  }
};

const DEFAULT_REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
const DEFAULT_REALTIME_VOICE = "verse";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { sdp, voice, instructions } = req.body ?? {};
  if (typeof sdp !== "string" || sdp.trim() === "") {
    res.status(400).json({ error: "Missing SDP offer in request body." });
    return;
  }

  const model = process.env.OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL;
  const selectedVoice = typeof voice === "string" && voice.trim() !== ""
    ? voice.trim()
    : process.env.OPENAI_REALTIME_VOICE?.trim() || DEFAULT_REALTIME_VOICE;

  try {
    const params = new URLSearchParams({ model, voice: selectedVoice });
    if (typeof instructions === "string" && instructions.trim() !== "") {
      params.set("instructions", instructions.trim());
    }

    const response = await fetch(`https://api.openai.com/v1/realtime?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      },
      body: sdp
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Realtime SDP relay failed:", response.status, errorText);
      res.status(response.status).json({
        error: "Failed to exchange SDP with OpenAI Realtime API.",
        details: errorText
      });
      return;
    }

    const answer = await response.text();
    res.status(200);
    res.setHeader("Content-Type", "application/sdp");
    res.send(answer);
  } catch (err) {
    console.error("Realtime SDP handler error:", err);
    res.status(500).json({
      error: "Unexpected error while contacting OpenAI Realtime API.",
      details: err instanceof Error ? err.message : String(err)
    });
  }
}
