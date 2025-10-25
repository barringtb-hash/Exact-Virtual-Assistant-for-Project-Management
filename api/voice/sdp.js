// Vercel Serverless Function: exchange browser SDP with OpenAI Realtime
export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const { sdp } = req.body || {};
    if (typeof sdp !== "string" || !sdp.trim()) {
      return res.status(400).json({ error: "Missing SDP offer" });
    }

    const model = (process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime").trim();
    const voice = (process.env.OPENAI_REALTIME_VOICE || "alloy").trim();

    const resp = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/sdp",
        },
        body: sdp,
      }
    );

    if (!resp.ok) {
      const errTxt = await resp.text().catch(() => "");
      return res.status(resp.status).json({ error: "Realtime exchange failed", detail: errTxt });
    }

    const answerSdp = await resp.text();
    return res.status(200).send(answerSdp);
  } catch (err) {
    console.error("voice/sdp error:", err);
    return res.status(500).json({ error: "Failed to create realtime session" });
  }
}
