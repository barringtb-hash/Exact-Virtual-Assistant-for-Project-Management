// /api/chat.js - Vercel Serverless Function (Node runtime)
import OpenAI from "openai";

const MAX_ATTACHMENT_TEXT_LENGTH = 4000;
const BASE_SYSTEM_PROMPT =
  "You are the Exact Virtual Assistant for Project Management. Be concise, ask one clarifying question at a time, and output clean bullets when listing tasks. Avoid fluff.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }
  try {
    const body = req.body || {};
    // Expect: { messages: [{role, content}, ...], attachments?: [{ name, text }] }
    const incoming = Array.isArray(body.messages) ? body.messages : [];
    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];

    const attachments = rawAttachments.map((item, index) => {
      if (!item || typeof item !== "object") {
        throw new Error(`Attachment at index ${index} must be an object.`);
      }
      const name = typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : `Attachment ${index + 1}`;
      if (typeof item.text !== "string") {
        throw new Error(`Attachment "${name}" is missing required text.`);
      }
      const text = item.text.trim();
      if (!text) {
        throw new Error(`Attachment "${name}" must include non-empty text.`);
      }
      if (text.length > MAX_ATTACHMENT_TEXT_LENGTH) {
        throw new Error(
          `Attachment "${name}" text is too long (max ${MAX_ATTACHMENT_TEXT_LENGTH} characters).`
        );
      }
      return { name, text };
    });

    const attachmentsBlock = attachments
      .map((att) => `### ${att.name}\n${att.text}`)
      .join("\n\n");

    const system = {
      role: "system",
      content: attachmentsBlock
        ? `${attachmentsBlock}\n\n${BASE_SYSTEM_PROMPT}`
        : BASE_SYSTEM_PROMPT
    };

    const historyLimit = 17; // keep total messages (including system) at roughly 18
    const trimmedIncoming = incoming.slice(-historyLimit);
    const messages = [system, ...trimmedIncoming];
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
    const message = err?.message || "Unknown error";
    const status = message.startsWith("Attachment") ? 400 : 500;
    res.status(status).json({ error: message });
  }
}
