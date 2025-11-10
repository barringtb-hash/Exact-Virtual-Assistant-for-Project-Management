import fs from "fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import esbuild from "esbuild";

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
const VALID_TOOL_ROLES = new Set(["user", "assistant", "system", "developer"]);

const __filename =
  typeof document === "undefined" ? fileURLToPath(import.meta.url) : "";
const __dirname = typeof document === "undefined" ? path.dirname(__filename) : "";

// Cache the compiled module to avoid repeated transforms
let charterExtractionModule = null;

/**
 * Dynamically compiles and loads the TS module that provides:
 *   - extractFieldsFromUtterance
 *   - extractFieldsFromUtterances
 */
async function loadCharterExtraction() {
  if (charterExtractionModule) return charterExtractionModule;

  const tsPath = path.resolve(
    __dirname,
    "../../server/charter/extractFieldsFromUtterance.ts",
  );
  let tsSource;
  try {
    tsSource = await fs.readFile(tsPath, "utf8");
  } catch (err) {
    // Surface a clear message rather than a generic 500
    throw new Error(`Charter extraction source not found at ${tsPath}`);
  }

  // Transform TypeScript -> ESM JavaScript
  const { code } = await esbuild.transform(tsSource, {
    loader: "ts",
    format: "esm",
    target: "es2022",
  });

  // Load the generated ESM via data URI
  const dataUri =
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  const module = await import(dataUri);

  // Basic shape assertion (optional but helpful)
  if (typeof module.extractFieldsFromUtterance !== "function") {
    throw new Error("extractFieldsFromUtterance export missing after transform");
  }
  if (typeof module.extractFieldsFromUtterances !== "function") {
    throw new Error("extractFieldsFromUtterances export missing after transform");
  }

  charterExtractionModule = module;
  return module;
}

/** Honors test overrides, then dynamic load */
async function resolveCharterExtraction() {
  const overrides = globalThis?.__charterExtractionOverrides__;
  if (overrides && typeof overrides === "object") {
    const fallbackSingle = async (...args) => {
      const module = await loadCharterExtraction();
      return module.extractFieldsFromUtterance(...args);
    };
    const fallbackBatch = async (...args) => {
      const module = await loadCharterExtraction();
      return module.extractFieldsFromUtterances(...args);
    };
    return {
      extractFieldsFromUtterance:
        typeof overrides.extractFieldsFromUtterance === "function"
          ? overrides.extractFieldsFromUtterance
          : fallbackSingle,
      extractFieldsFromUtterances:
        typeof overrides.extractFieldsFromUtterances === "function"
          ? overrides.extractFieldsFromUtterances
          : fallbackBatch,
    };
  }
  return await loadCharterExtraction();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

function sanitizeExtractionIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return [];
  }

  return issues
    .map((issue) => {
      if (!isPlainObject(issue)) {
        return null;
      }
      const normalized = { ...issue };
      if (typeof normalized.level !== "string") {
        normalized.level = "warning";
      }
      return normalized;
    })
    .filter(Boolean);
}

function sanitizeGuidedConfirmation(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const decisionRaw = typeof value.decision === "string" ? value.decision.trim().toLowerCase() : "";
  let decision = null;
  if (decisionRaw === "approve" || decisionRaw === "confirm" || decisionRaw === "accepted") {
    decision = "approve";
  } else if (decisionRaw === "reject" || decisionRaw === "deny" || decisionRaw === "rejected") {
    decision = "reject";
  }

  if (!decision) {
    return null;
  }

  const fields = isPlainObject(value.fields) ? value.fields : {};
  const warnings = sanitizeExtractionIssues(value.warnings);
  const argumentsValue =
    value.arguments !== undefined && value.arguments !== null ? value.arguments : null;
  const error = isPlainObject(value.error) ? { ...value.error } : null;

  return {
    decision,
    fields,
    warnings,
    arguments: argumentsValue,
    error,
  };
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

function sanitizeCharterMessagesForTool(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const text = extractMessageText(entry);
      if (!text) {
        return null;
      }

      const roleCandidate =
        typeof entry.role === "string" && entry.role.trim()
          ? entry.role.trim().toLowerCase()
          : "user";
      const role = VALID_TOOL_ROLES.has(roleCandidate) ? roleCandidate : "user";

      return { role, content: text };
    })
    .filter(Boolean);
}

function sanitizeCharterAttachmentsForTool(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .map((attachment) => {
      if (!attachment || typeof attachment !== "object") {
        return null;
      }

      const text = typeof attachment.text === "string" ? attachment.text.trim() : "";
      if (!text) {
        return null;
      }

      const entry = { text };

      if (typeof attachment.name === "string" && attachment.name.trim()) {
        entry.name = attachment.name.trim();
      }

      if (typeof attachment.mimeType === "string" && attachment.mimeType.trim()) {
        entry.mimeType = attachment.mimeType.trim();
      }

      return entry;
    })
    .filter(Boolean);
}

function sanitizeCharterVoiceForTool(voiceEvents) {
  if (!Array.isArray(voiceEvents)) {
    return [];
  }

  return voiceEvents
    .map((event) => {
      if (!event || typeof event !== "object") {
        return null;
      }

      const text = typeof event.text === "string" ? event.text.trim() : "";
      if (!text) {
        return null;
      }

      const entry = { text };

      if (typeof event.id === "string" && event.id.trim()) {
        entry.id = event.id.trim();
      }

      const timestampCandidate = event.timestamp;
      if (typeof timestampCandidate === "number" && Number.isFinite(timestampCandidate)) {
        entry.timestamp = timestampCandidate;
      }

      return entry;
    })
    .filter(Boolean);
}

function sanitizeRequestedFieldIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const result = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function sanitizeCharterSeed(seed) {
  if (seed === null) {
    return null;
  }

  if (!seed || typeof seed !== "object" || Array.isArray(seed)) {
    return undefined;
  }

  try {
    return JSON.parse(JSON.stringify(seed));
  } catch {
    return undefined;
  }
}

function mapExtractionErrorToStatus(code) {
  switch (code) {
    case "no_fields_requested":
      return 400;
    case "missing_required":
    case "validation_failed":
      return 409;
    case "configuration":
      return 500;
    case "openai_error":
    case "invalid_tool_payload":
    case "missing_tool_call":
      return 502;
    default:
      return 500;
  }
}

function isGuidedEnabled(value) {
  if (value === true) {
    return true;
  }
  if (value === 1) {
    return true;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return trimmed === "true" || trimmed === "1" || trimmed === "yes";
  }
  return false;
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

function sanitizeUserMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((entry) => {
      const role = typeof entry?.role === "string" ? entry.role.trim() : "user";
      if (role !== "user") {
        return null;
      }
      const text = extractMessageText(entry);
      if (!text) {
        return null;
      }
      return { role: "user", content: text, text };
    })
    .filter(Boolean);
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
    const messages = sanitizeUserMessages(body.messages);
    const toolMessages = sanitizeCharterMessagesForTool(body.messages);
    const toolAttachments = sanitizeCharterAttachmentsForTool(body.attachments);
    const toolVoice = sanitizeCharterVoiceForTool(body.voice);
    const sanitizedRequestedFieldIds = sanitizeRequestedFieldIds(
      body?.requestedFieldIds
    );
    const seedValue = sanitizeCharterSeed(body.seed);
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

    const guidedRequestsRaw = Array.isArray(body?.guidedRequests)
      ? body.guidedRequests
      : Array.isArray(body?.requests)
      ? body.requests
      : null;
    const guidedConfirmation = sanitizeGuidedConfirmation(body?.guidedConfirmation);

    const guidedFlagEnabled = isGuidedEnabled(body?.guided);
    const hasGuidedRequestPayload =
      Array.isArray(guidedRequestsRaw) && guidedRequestsRaw.length > 0;
    const isGuidedCharterRequest =
      config.type === "charter" && (guidedFlagEnabled || hasGuidedRequestPayload || !!guidedConfirmation);

    const hasGuidedContext = Array.isArray(guidedRequestsRaw)
      ? guidedRequestsRaw.some((entry) => {
          if (!entry || typeof entry !== "object") {
            return false;
          }

          const entryAttachments = Array.isArray(entry.attachments) ? entry.attachments : [];
          const entryVoice = Array.isArray(entry.voice) ? entry.voice : [];
          const entryMessages = sanitizeUserMessages(entry.messages);

          return (
            hasAttachmentContext(entryAttachments) ||
            hasVoiceText(entryVoice) ||
            computeUserTextLength(entryMessages) >= MIN_TEXT_CONTEXT_LENGTH
          );
        })
      : false;

    const hasContext =
      hasAttachmentContext(attachments) ||
      hasVoiceText(voice) ||
      computeUserTextLength(messages) >= MIN_TEXT_CONTEXT_LENGTH ||
      hasGuidedContext;

    const shouldEnforceContext = config.type === "charter" && !guidedConfirmation;

    if (shouldEnforceContext && !hasContext) {
      return res.status(422).json({
        error:
          "Please provide attachments, voice notes, or at least 25 characters of user text before extracting the document.",
        code: "insufficient-context",
      });
    }

    let payload;
    let statusCode = 200;
    let auditStatus = null;

    if (isGuidedCharterRequest && guidedConfirmation) {
      if (guidedConfirmation.decision === "approve") {
        payload = {
          status: "ok",
          fields: guidedConfirmation.fields,
          ...(guidedConfirmation.warnings.length > 0
            ? { warnings: guidedConfirmation.warnings }
            : {}),
        };
        statusCode = 200;
        auditStatus = "confirmed";
      } else {
        const confirmationError = guidedConfirmation.error || null;
        const errorStatus = confirmationError?.code
          ? mapExtractionErrorToStatus(confirmationError.code)
          : 409;
        statusCode = errorStatus >= 400 ? errorStatus : 409;
        payload = {
          status: "error",
          error:
            confirmationError || {
              code: "confirmation_rejected",
              message: "Pending extraction proposal was rejected.",
            },
          fields: {},
          ...(guidedConfirmation.warnings.length > 0
            ? { warnings: guidedConfirmation.warnings }
            : {}),
        };
        auditStatus = confirmationError?.code || "rejected";
      }
    } else if (isGuidedCharterRequest) {
      const charterExtraction = await resolveCharterExtraction();
      const baseRequest = {
        messages: toolMessages,
        attachments: toolAttachments,
        voice: toolVoice,
        requestedFieldIds: sanitizedRequestedFieldIds,
        ...(seedValue !== undefined ? { seed: seedValue } : {}),
      };

      if (Array.isArray(guidedRequestsRaw) && guidedRequestsRaw.length > 0) {
        const requests = guidedRequestsRaw
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }
            const requestFieldIds = sanitizeRequestedFieldIds(
              entry.requestedFieldIds
            );
            if (requestFieldIds.length === 0) {
              return null;
            }
            const requestSeed =
              entry.seed !== undefined
                ? sanitizeCharterSeed(entry.seed)
                : seedValue;
            const requestMessages = Array.isArray(entry.messages)
              ? sanitizeCharterMessagesForTool(entry.messages)
              : toolMessages;
            const requestAttachments = Array.isArray(entry.attachments)
              ? sanitizeCharterAttachmentsForTool(entry.attachments)
              : toolAttachments;
            const requestVoice = Array.isArray(entry.voice)
              ? sanitizeCharterVoiceForTool(entry.voice)
              : toolVoice;

            return {
              messages: requestMessages,
              attachments: requestAttachments,
              voice: requestVoice,
              requestedFieldIds: requestFieldIds,
              ...(requestSeed !== undefined ? { seed: requestSeed } : {}),
            };
          })
          .filter(Boolean);

        if (requests.length === 0) {
          payload = {
            status: "error",
            error: {
              code: "no_fields_requested",
              message: "No valid charter field ids were requested for extraction.",
            },
            fields: {},
          };
          statusCode = 400;
          auditStatus = "error";
        } else {
          const results = await charterExtraction.extractFieldsFromUtterances(
            requests
          );
          let highestStatus = 200;
          const mappedResults = results.map((result) => {
            if (result.ok) {
              const resultWarnings = sanitizeExtractionIssues(result.warnings);
              if (resultWarnings.length > 0) {
                highestStatus = Math.max(highestStatus, 202);
                return {
                  status: "pending",
                  pending: {
                    fields: result.fields || {},
                    warnings: resultWarnings,
                    ...(result.rawToolArguments !== undefined
                      ? { arguments: result.rawToolArguments }
                      : {}),
                  },
                };
              }
              return {
                status: "ok",
                fields: result.fields || {},
                warnings: resultWarnings,
              };
            }

            const errorStatus = mapExtractionErrorToStatus(result.error?.code);
            if (errorStatus > highestStatus) {
              highestStatus = errorStatus;
            }
            return {
              status: "error",
              error: result.error,
              fields: result.fields || {},
              ...(sanitizeExtractionIssues(result.warnings).length > 0
                ? { warnings: sanitizeExtractionIssues(result.warnings) }
                : {}),
            };
          });

          payload = { status: "batch", results: mappedResults };
          statusCode = highestStatus;
          auditStatus = "batch";
        }
      } else {
        const result = await charterExtraction.extractFieldsFromUtterance(
          baseRequest
        );
        if (result.ok) {
          const resultWarnings = sanitizeExtractionIssues(result.warnings);
          if (resultWarnings.length > 0) {
            payload = {
              status: "pending",
              pending: {
                fields: result.fields || {},
                warnings: resultWarnings,
                ...(result.rawToolArguments !== undefined
                  ? { arguments: result.rawToolArguments }
                  : {}),
              },
            };
            statusCode = 202;
            auditStatus = "pending";
          } else {
            payload = {
              status: "ok",
              fields: result.fields || {},
              warnings: resultWarnings,
            };
            auditStatus = "ok";
          }
        } else {
          statusCode = mapExtractionErrorToStatus(result.error?.code);
          payload = {
            status: "error",
            error: result.error,
            fields: result.fields || {},
            ...(sanitizeExtractionIssues(result.warnings).length > 0
              ? { warnings: sanitizeExtractionIssues(result.warnings) }
              : {}),
          };
          auditStatus = result.error?.code || "error";
        }
      }
    } else {
      if (!process.env.OPENAI_API_KEY) {
        statusCode = 501;
        payload = { error: "OpenAI extraction not configured" };
        auditStatus = "openai_not_configured";
      } else {
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
        const { OpenAI } = await import("openai");
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
            payload = parsed;
          } else {
            payload = { result: replyContent };
          }
        } catch {
          payload = { result: replyContent };
        }
        auditStatus = payload?.status || "ok";
      }
    }

    res.status(statusCode).json(payload);

    const auditOptions = {
      hashSource: payload,
      detection,
      finalType: config.type,
      templateVersion: config.templateVersion,
      status: auditStatus ?? (typeof payload?.status === "string" ? payload.status : null),
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
