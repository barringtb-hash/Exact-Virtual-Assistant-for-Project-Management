import OpenAI from "openai";
import fs from "fs/promises";

import { MissingDocAssetError, UnsupportedDocTypeError } from "../../lib/doc/errors.js";
import REGISTRY, { getDocTypeConfig } from "../../lib/doc/registry.js";
import { resolveDocType } from "../../lib/doc/utils.js";
import {
  recordDocumentAudit,
  resolveDetectionFromRequest,
} from "../../lib/doc/audit.js";
import { isIntentOnlyExtractionEnabled } from "../../config/featureFlags.js";
import { detectCharterIntent } from "../../src/utils/detectCharterIntent.js";

const ATTACHMENT_CHAR_LIMIT = 20_000;
const MIN_TEXT_CONTEXT_LENGTH = 25;

async function readFirstAvailableFile(paths = []) {
  for (const filePath of paths) {
    if (!filePath) {
      continue;
    }
    try {
      const content = await fs.readFile(filePath, "utf8");
      return { content, path: filePath };
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return null;
}

function formatDocTypeMetadata(metadata) {
  if (!metadata) {
    return "";
  }

  if (metadata.path.endsWith(".json")) {
    try {
      const parsed = JSON.parse(metadata.content);
      return `Doc Type Metadata:\n${JSON.stringify(parsed, null, 2)}`;
    } catch {
      // fall back to raw content
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

      const name =
        typeof attachment?.name === "string" && attachment.name.trim()
          ? attachment.name.trim()
          : `Attachment ${index + 1}`;
      const mimeType =
        typeof attachment?.mimeType === "string" && attachment.mimeType.trim()
          ? attachment.mimeType.trim()
          : "";

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
      const timestamp =
        typeof event?.timestamp === "number"
          ? new Date(event.timestamp).toISOString()
          : undefined;
      const prefix = timestamp ? `[${timestamp}] ` : "";
      return `${prefix}${text}`;
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return "";
  }

  return `Voice Context:\n${entries.join("\n")}`;
}

function normalizeIntent(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "object") {
    return value;
  }

  return null;
}

function extractMessageText(entry) {
  if (!entry || typeof entry !== "object") {
    return "";
  }

  const candidates = [entry.text, entry.content, entry.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return "";
}

function getLastUserMessageText(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    const role = typeof entry?.role === "string" && entry.role.trim() ? entry.role.trim() : "user";
    if (role !== "user") {
      continue;
    }

    const text = extractMessageText(entry);
    if (text) {
      return text;
    }
  }

  return "";
}

function computeUserTextLength(messages) {
  if (!Array.isArray(messages)) {
    return 0;
  }

  return messages.reduce((total, entry) => {
    const role = typeof entry?.role === "string" && entry.role.trim() ? entry.role.trim() : "user";
    if (role !== "user") {
      return total;
    }

    const text = extractMessageText(entry);
    return text ? total + text.length : total;
  }, 0);
}

function hasVoiceText(voiceEvents) {
  if (!Array.isArray(voiceEvents)) {
    return false;
  }

  return voiceEvents.some((event) => {
    if (!event || typeof event !== "object") {
      return false;
    }
    const text = typeof event.text === "string" ? event.text.trim() : "";
    return Boolean(text);
  });
}

function hasAttachmentContext(attachments) {
  if (!Array.isArray(attachments)) {
    return false;
  }

  return attachments.some((attachment) => attachment != null);
}

function normalizeRequestBody(body) {
  if (body == null) {
    return {};
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }

  return {};
}

async function loadExtractPrompt(docType, config) {
  const candidates = Array.isArray(config?.extract?.promptCandidates)
    ? [...config.extract.promptCandidates]
    : [];
  const fallback = config?.extract?.fallbackPromptPath;
  if (fallback && !candidates.includes(fallback)) {
    candidates.push(fallback);
  }

  const file = await readFirstAvailableFile(candidates);
  if (!file) {
    throw new MissingDocAssetError(docType, "extract prompt", candidates);
  }
  return file.content;
}

async function loadExtractMetadata(config) {
  const candidates = Array.isArray(config?.extract?.metadataCandidates)
    ? config.extract.metadataCandidates
    : [];
  if (candidates.length === 0) {
    return null;
  }
  return readFirstAvailableFile(candidates);
}

function buildOpenAIMessages(systemSections, messages) {
  const normalizedMessages = Array.isArray(messages) ? messages : [];
  return [
    { role: "system", content: systemSections.join("\n\n") },
    ...normalizedMessages.map((message) => ({
      role: message?.role || "user",
      content: message?.content || message?.text || "",
    })),
  ];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const body = normalizeRequestBody(req.body);
    const docType = resolveDocType(req.query?.docType, body?.docType);
    const config = getDocTypeConfig(docType);
    if (!config) {
      throw new UnsupportedDocTypeError(docType);
    }

    const detection = resolveDetectionFromRequest({ ...req, body });

    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const voice = Array.isArray(body.voice) ? body.voice : [];
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const seed = typeof body.seed === "number" ? body.seed : undefined;
    const intentRaw = body?.intent;
    const intentSourceRaw = body?.intentSource;
    const intentReasonRaw = body?.intentReason;
    const detectIntentRaw = body?.detect;

    const intentOnlyExtractionEnabled = isIntentOnlyExtractionEnabled();
    const allowIntentDetection = detectIntentRaw !== false;

    let resolvedIntent = intentOnlyExtractionEnabled ? normalizeIntent(intentRaw) : null;
    let resolvedIntentSource =
      typeof intentSourceRaw === "string" && intentSourceRaw.trim() ? intentSourceRaw.trim() : null;

    if (config.type === "charter") {
      if (intentOnlyExtractionEnabled && !resolvedIntent && allowIntentDetection) {
        const lastUserMessage = getLastUserMessageText(messages);
        const detectedIntent = detectCharterIntent(lastUserMessage);
        if (detectedIntent) {
          resolvedIntent = detectedIntent;
          if (!resolvedIntentSource) {
            resolvedIntentSource = "derived_last_user_message";
          }
        }
      }

      if (intentOnlyExtractionEnabled && !resolvedIntent) {
        return res.status(200).json({ status: "skipped", reason: "no_intent", fields: {} });
      }
    }

    const hasContext =
      hasAttachmentContext(attachments) ||
      hasVoiceText(voice) ||
      computeUserTextLength(messages) >= MIN_TEXT_CONTEXT_LENGTH;

    if (config.type === "charter" && !hasContext) {
      return res.status(422).json({
        error:
          "Please provide attachments, voice notes, or at least 25 characters of user text before extracting the document.",
        code: "insufficient-context",
      });
    }

    const extractPrompt = await loadExtractPrompt(docType, config);
    const docTypeMetadata = await loadExtractMetadata(config);

    const systemSections = [
      formatDocTypeMetadata(docTypeMetadata),
      formatAttachments(attachments),
      formatVoice(voice),
      extractPrompt,
    ]
      .map((section) => (section || "").trim())
      .filter(Boolean);

    const openaiMessages = buildOpenAIMessages(systemSections, messages);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: openaiMessages,
      response_format: { type: "json_object" },
      ...(typeof seed === "number" ? { seed } : {}),
    });

    const replyContent = completion.choices?.[0]?.message?.content || "";
    let payload;
    try {
      const parsed = JSON.parse(replyContent);
      if (parsed && typeof parsed === "object") {
        payload = parsed;
        res.status(200).json(parsed);
      } else {
        payload = { result: replyContent };
        res.status(200).json(payload);
      }
    } catch {
      payload = { result: replyContent };
      res.status(200).json(payload);
    }

    const auditOptions = {
      hashSource: payload,
      detection,
      finalType: config.type,
      templateVersion: config.templateVersion,
    };

    if (intentOnlyExtractionEnabled) {
      auditOptions.intentSource = resolvedIntentSource || null;
      auditOptions.intentReason = intentReasonRaw;
    }

    recordDocumentAudit("documents.extract", auditOptions, { logger: console });
  } catch (error) {
    if (error instanceof UnsupportedDocTypeError) {
      return res.status(400).json({
        error: `Extraction is not available for "${error.docType}" documents.`,
      });
    }

    if (error instanceof MissingDocAssetError) {
      console.error("doc extract asset missing", error);
      return res.status(error.statusCode || 500).json({
        error: error.message,
        docType: error.docType,
        assetType: error.assetType,
      });
    }

    console.error("doc extract failed", error);
    res.status(500).json({ error: error?.message || "Unknown error" });
  }
}

export const supportedDocTypes = Array.from(REGISTRY.keys());
