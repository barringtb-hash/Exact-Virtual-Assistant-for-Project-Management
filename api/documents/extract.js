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

// Import extracted modules
import {
  sanitizeExtractionIssues,
  sanitizeGuidedConfirmation,
  sanitizeCharterMessagesForTool,
  sanitizeCharterAttachmentsForTool,
  sanitizeCharterVoiceForTool,
  sanitizeRequestedFieldIds,
  sanitizeCharterSeed,
  sanitizeUserMessages,
} from "../../server/documents/sanitization/sanitizers.js";

import {
  MIN_TEXT_CONTEXT_LENGTH,
  normalizeIntent,
  getLastUserMessageText,
  normalizeRequestBody,
  isGuidedEnabled,
  computeUserTextLength,
  hasVoiceText,
  hasAttachmentContext,
  formatDocTypeMetadata,
  formatAttachments,
  formatVoice,
} from "../../server/documents/utils/index.js";

import {
  loadExtractPrompt,
  loadExtractMetadata,
  executeOpenAIExtraction,
} from "../../server/documents/openai/client.js";

import {
  processGuidedConfirmation,
  processBatchGuidedExtraction,
  processSingleGuidedExtraction,
} from "../../server/documents/extraction/guided.js";

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
      const result = await processGuidedConfirmation(guidedConfirmation);
      payload = result.payload;
      statusCode = result.statusCode;
      auditStatus = result.auditStatus;
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
        const result = await processBatchGuidedExtraction({
          charterExtraction,
          guidedRequestsRaw,
          toolMessages,
          toolAttachments,
          toolVoice,
          seedValue,
        });
        payload = result.payload;
        statusCode = result.statusCode;
        auditStatus = result.auditStatus;
      } else {
        const result = await processSingleGuidedExtraction({
          charterExtraction,
          baseRequest,
        });
        payload = result.payload;
        statusCode = result.statusCode;
        auditStatus = result.auditStatus;
      }
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

      payload = await executeOpenAIExtraction({
        systemSections,
        messages,
        seed,
      });
      auditStatus = payload?.status || "ok";
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

    // Handle API-related errors with appropriate status codes
    // Check both statusCode and status since different error types use different properties
    const statusCode = error?.statusCode || error?.status || 500;
    const errorCode = error?.code || "internal_error";
    const errorMessage = error?.message || "Unknown error";

    console.error("doc extract failed", {
      statusCode,
      code: errorCode,
      message: errorMessage,
      stack: error?.stack,
    });

    res.status(statusCode).json({
      error: errorMessage,
      code: errorCode,
    });
  }
}

export const supportedDocTypes = Array.from(REGISTRY.keys());
