import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

const ATTACHMENT_CHAR_LIMIT = 20_000;

function sanitizeDocType(value) {
  if (typeof value !== "string") return "charter";
  const trimmed = value.trim();
  if (!trimmed) return "charter";

  const normalized = trimmed
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  return normalized || "charter";
}

async function readFirstAvailableFile(paths) {
  for (const filePath of paths) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return { content, path: filePath };
    } catch (err) {
      if (err?.code !== "ENOENT") {
        throw err;
      }
    }
  }
  return null;
}

function formatDocTypeMetadata(metadata) {
  if (!metadata) return "";
  if (metadata.path.endsWith(".json")) {
    try {
      const parsed = JSON.parse(metadata.content);
      return `Doc Type Metadata:\n${JSON.stringify(parsed, null, 2)}`;
    } catch {
      // Fall through to returning raw content.
    }
  }
  const trimmed = metadata.content.trim();
  if (!trimmed) {
    return "";
  }
  return `Doc Type Metadata:\n${trimmed}`;
}

function formatAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return "";
  }

  const formatted = attachments
    .map((attachment, index) => {
      const rawText = typeof attachment?.text === "string" ? attachment.text : "";
      const text = rawText.slice(0, ATTACHMENT_CHAR_LIMIT).trim();
      if (!text) {
        return null;
      }

      const name = typeof attachment?.name === "string" && attachment.name.trim() ? attachment.name.trim() : `Attachment ${
        index + 1
      }`;
      const mimeType = typeof attachment?.mimeType === "string" && attachment.mimeType.trim() ? attachment.mimeType.trim() : "";

      const headerParts = [`### Attachment: ${name}`];
      if (mimeType) {
        headerParts.push(`Type: ${mimeType}`);
      }

      return [...headerParts, text].join("\n");
    })
    .filter(Boolean);

  if (formatted.length === 0) {
    return "";
  }

  return `Attachment Context:\n${formatted.join("\n\n")}`;
}

function formatVoice(voiceEvents) {
  if (!Array.isArray(voiceEvents) || voiceEvents.length === 0) {
    return "";
  }

  const entries = voiceEvents
    .map((event) => {
      const text = typeof event?.text === "string" ? event.text.trim() : "";
      if (!text) {
        return null;
      }
      const timestamp = typeof event?.timestamp === "number" ? new Date(event.timestamp).toISOString() : undefined;
      const prefix = timestamp ? `[${timestamp}] ` : "";
      return `${prefix}${text}`;
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return "";
  }

  return `Voice Context:\n${entries.join("\n")}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  try {
    const body = req.body || {};
    const docType = sanitizeDocType(body.docType);
    const seed = typeof body.seed === "number" ? body.seed : undefined;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const voice = Array.isArray(body.voice) ? body.voice : [];
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const templatesDir = path.join(process.cwd(), "templates");
    const fallbackPromptPath = path.join(templatesDir, "extract_prompt.txt");
    const docTypeLower = docType.toLowerCase();
    const docTypePrompt = await readFirstAvailableFile(
      [
        path.join(templatesDir, "doc-types", docType, "extract_prompt.txt"),
        docTypeLower !== docType ? path.join(templatesDir, "doc-types", docTypeLower, "extract_prompt.txt") : null,
        path.join(templatesDir, `extract_prompt.${docType}.txt`),
        docTypeLower !== docType ? path.join(templatesDir, `extract_prompt.${docTypeLower}.txt`) : null,
      ].filter(Boolean)
    );
    const extractPrompt = docTypePrompt?.content ?? (await fs.readFile(fallbackPromptPath, "utf8"));

    const docTypeMetadata = await readFirstAvailableFile(
      [
        path.join(templatesDir, "doc-types", docType, "metadata.json"),
        docTypeLower !== docType ? path.join(templatesDir, "doc-types", docTypeLower, "metadata.json") : null,
        path.join(templatesDir, "doc-types", docType, "metadata.txt"),
        docTypeLower !== docType ? path.join(templatesDir, "doc-types", docTypeLower, "metadata.txt") : null,
        path.join(templatesDir, `extract_metadata.${docType}.json`),
        docTypeLower !== docType ? path.join(templatesDir, `extract_metadata.${docTypeLower}.json`) : null,
        path.join(templatesDir, `extract_metadata.${docType}.txt`),
        docTypeLower !== docType ? path.join(templatesDir, `extract_metadata.${docTypeLower}.txt`) : null,
      ].filter(Boolean)
    );

    const systemSections = [formatDocTypeMetadata(docTypeMetadata), formatAttachments(attachments), formatVoice(voice), extractPrompt]
      .map((section) => (section || "").trim())
      .filter(Boolean);

    const openaiMessages = [
      { role: "system", content: systemSections.join("\n\n") },
      ...messages.map((m) => ({
        role: m.role || "user",
        content: m.content || m.text || "",
      })),
    ];

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: openaiMessages,
      response_format: { type: "json_object" },
      ...(typeof seed === "number" ? { seed } : {}),
    });

    const replyContent = completion.choices?.[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(replyContent);
      if (parsed && typeof parsed === "object") {
        return res.status(200).json(parsed);
      }
    } catch {
      // fall through
    }

    return res.status(200).json({ result: replyContent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err?.message || "Unknown error" });
  }
}
