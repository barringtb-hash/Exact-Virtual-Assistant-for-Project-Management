import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const extractPromptPath = path.join(process.cwd(), "templates", "extract_prompt.txt");
    const extractPrompt = await fs.readFile(extractPromptPath, "utf8");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const openaiMessages = [
      { role: "system", content: extractPrompt },
      ...messages.map((m) => ({
        role: m.role || "user",
        content: m.content || m.text || "",
      })),
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: openaiMessages,
      response_format: { type: "json_object" },
    });

    const replyContent = completion.choices?.[0]?.message?.content || "";
    let json;
    try {
      json = JSON.parse(replyContent);
    } catch {
      return res.status(200).json({ result: replyContent });
    }
    res.status(200).json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}
