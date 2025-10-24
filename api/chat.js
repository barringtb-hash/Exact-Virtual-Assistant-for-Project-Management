// /api/chat.js - Vercel Serverless Function (Node runtime)
import OpenAI from "openai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  try {
    const body = req.body || {};
    // Expect: { messages: [{role, content}, ...] }
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    // Minimal system prompt for PMO tone
    const system = {
      role: "system",
      content:
        "You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff."
    };
    const messages = [system, ...incoming].slice(-18); // keep latest
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages
    });
    const reply = completion.choices?.[0]?.message?.content ?? "";
    res.status(200).json({ reply });
  } catch (err) {
    console.error("API /api/chat error:", err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}
