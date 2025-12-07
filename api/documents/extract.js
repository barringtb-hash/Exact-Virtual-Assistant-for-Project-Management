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
import { isIntentOnlyExtractionEnabled, isDocumentAnalysisEnabled } from "../../config/featureFlags.js";
import { getAnalysis, confirmAnalysis } from "../../server/documents/analysis/AnalysisCache.js";
import { detectCharterIntent } from "../../src/utils/detectCharterIntent.js";
import {
  formatErrorResponse,
  MethodNotAllowedError,
  InsufficientContextError,
  InvalidRequestBodyError,
  ERROR_CODES,
} from "../../server/utils/apiErrors.js";
import { securityMiddleware } from "../../server/middleware/security.js";
import { sanitizeErrorMessage } from "../../server/utils/sanitize.js";

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
  isGuidedEnabled,
  computeUserTextLength,
  hasVoiceText,
  hasAttachmentContext,
  formatDocTypeMetadata,
  formatAttachments,
  formatVoice,
} from "../../server/documents/utils/index.js";

/**
 * Parse and validate request body with explicit error handling.
 * Unlike normalizeRequestBody which silently returns {}, this throws
 * an InvalidRequestBodyError on malformed input.
 *
 * @param {unknown} body - The raw request body
 * @returns {Object} - Validated request body object
 * @throws {InvalidRequestBodyError} - On malformed input
 */
function parseRequestBody(body) {
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
      throw new InvalidRequestBodyError(
        "Request body must be a JSON object, not an array or primitive value."
      );
    } catch (error) {
      if (error instanceof InvalidRequestBodyError) {
        throw error;
      }
      throw new InvalidRequestBodyError(
        "Request body contains invalid JSON.",
        error?.message
      );
    }
  }

  if (typeof body === "object" && !Array.isArray(body)) {
    return body;
  }

  throw new InvalidRequestBodyError(
    "Request body must be a JSON object."
  );
}

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
 * Try to load the pre-compiled JavaScript module.
 * This is the production path - compiled by build:server.
 */
async function loadPrecompiledCharterExtraction() {
  // In Vercel production, the compiled JS is at dist/server/server/charter/
  // relative to the project root
  const compiledPaths = [
    // Production: compiled output from build:server
    path.resolve(__dirname, "../../dist/server/server/charter/extractFieldsFromUtterance.js"),
    // Alternative production path (flat structure)
    path.resolve(__dirname, "../../dist/server/extractFieldsFromUtterance.js"),
  ];

  for (const compiledPath of compiledPaths) {
    try {
      // Check if file exists before importing
      await fs.access(compiledPath);
      const module = await import(compiledPath);
      if (
        typeof module.extractFieldsFromUtterance === "function" &&
        typeof module.extractFieldsFromUtterances === "function"
      ) {
        return module;
      }
    } catch {
      // File doesn't exist or import failed, try next path
      continue;
    }
  }

  return null;
}

/**
 * Dynamically compile TypeScript source at runtime.
 * This is the development fallback when pre-compiled JS isn't available.
 */
async function loadCharterExtractionFromSource() {
  const tsPath = path.resolve(
    __dirname,
    "../../server/charter/extractFieldsFromUtterance.ts",
  );

  let tsSource;
  try {
    tsSource = await fs.readFile(tsPath, "utf8");
  } catch (err) {
    return null;
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

  if (
    typeof module.extractFieldsFromUtterance !== "function" ||
    typeof module.extractFieldsFromUtterances !== "function"
  ) {
    return null;
  }

  return module;
}

/**
 * Loads the charter extraction module:
 *   - extractFieldsFromUtterance
 *   - extractFieldsFromUtterances
 *
 * Tries pre-compiled JavaScript first (production), falls back to
 * dynamic TypeScript compilation (development).
 */
async function loadCharterExtraction() {
  if (charterExtractionModule) return charterExtractionModule;

  // Try pre-compiled JavaScript first (production path)
  const precompiled = await loadPrecompiledCharterExtraction();
  if (precompiled) {
    charterExtractionModule = precompiled;
    return precompiled;
  }

  // Fall back to dynamic TypeScript compilation (development path)
  const fromSource = await loadCharterExtractionFromSource();
  if (fromSource) {
    charterExtractionModule = fromSource;
    return fromSource;
  }

  // Neither worked - provide helpful error message
  const tsPath = path.resolve(__dirname, "../../server/charter/extractFieldsFromUtterance.ts");
  const jsPath = path.resolve(__dirname, "../../dist/server/server/charter/extractFieldsFromUtterance.js");
  throw new Error(
    `Charter extraction module not found. Expected either:\n` +
    `  - Pre-compiled: ${jsPath}\n` +
    `  - TypeScript source: ${tsPath}\n` +
    `Run 'npm run build:server' to compile the TypeScript module.`
  );
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
  // CRIT-01/02/HIGH-05: Apply security middleware (rate limiting, CSRF, headers)
  const securityCheck = securityMiddleware({ isOpenAI: true });
  await new Promise((resolve) => securityCheck(req, res, resolve));
  if (res.headersSent) return;

  const requestPath = req?.path || "/api/documents/extract";

  if (req.method !== "POST") {
    const error = new MethodNotAllowedError(req.method, ["POST"]);
    return res.status(405).json(formatErrorResponse(error, { path: requestPath }));
  }

  try {
    const body = parseRequestBody(req.body);
    const docType = resolveDocType(req.query?.docType, body?.docType);
    const config = getDocTypeConfig(docType);
    if (!config) {
      throw new UnsupportedDocTypeError(docType);
    }

    const detection = resolveDetectionFromRequest({ ...req, body });

    // Check for analysisId - if provided and valid, use cached analysis context
    // This enables the analysis-driven extraction flow (DOCUMENT_ANALYSIS_ENABLED=true)
    const analysisId = body?.analysisId;
    let cachedAnalysis = null;
    const documentAnalysisEnabled = isDocumentAnalysisEnabled();

    if (analysisId && typeof analysisId === "string" && documentAnalysisEnabled) {
      cachedAnalysis = getAnalysis(analysisId);
      if (cachedAnalysis) {
        // Mark analysis as used and confirm it
        confirmAnalysis(analysisId);
      }
    }

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

    // When document analysis is enabled and we have a cached analysis, bypass intent-only extraction
    const hasAnalysisContext = !!cachedAnalysis;
    const intentOnlyExtractionEnabled = isIntentOnlyExtractionEnabled() && !hasAnalysisContext;
    const allowIntentDetection = detectIntentRaw !== false;

    let resolvedIntent = intentOnlyExtractionEnabled ? normalizeIntent(intentRaw) : null;
    let resolvedIntentSource =
      typeof intentSourceRaw === "string" && intentSourceRaw.trim() ? intentSourceRaw.trim() : null;

    // Determine if this is a guided request BEFORE checking intent
    // Guided requests bypass intent-only extraction requirements
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

    // Intent check only applies to non-guided charter requests
    if (config.type === "charter" && !isGuidedCharterRequest) {
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
      const error = new InsufficientContextError(
        "Please provide attachments, voice notes, or at least 25 characters of user text before extracting the document."
      );
      return res.status(422).json(formatErrorResponse(error, { path: requestPath }));
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
      // Parallelize file operations for better performance
      const [extractPrompt, docTypeMetadata] = await Promise.all([
        loadExtractPrompt(docType, config),
        loadExtractMetadata(config),
      ]);

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
    // Use standardized error response format
    const statusCode = error?.statusCode || 500;

    // Handle malformed request body errors explicitly
    if (error instanceof InvalidRequestBodyError) {
      return res.status(400).json(formatErrorResponse(error, { path: requestPath }));
    }

    if (error instanceof UnsupportedDocTypeError) {
      error.message = `Extraction is not available for "${error.docType}" documents.`;
      return res.status(400).json(formatErrorResponse(error, { path: requestPath }));
    }

    if (error instanceof MissingDocAssetError) {
      console.error("doc extract asset missing", error);
      return res.status(statusCode).json(formatErrorResponse(error, { path: requestPath }));
    }

    // Handle API-related errors with appropriate status codes
    const errorCode = error?.code || ERROR_CODES.INTERNAL_ERROR;
    const errorMessage = error?.message || "Unknown error";

    // HIGH-02: Only log stack traces in development mode
    const logData = {
      statusCode,
      code: errorCode,
      message: sanitizeErrorMessage(errorMessage),
    };
    if (process.env.NODE_ENV === "development") {
      logData.stack = error?.stack;
    }
    console.error("doc extract failed", logData);

    res.status(statusCode).json(formatErrorResponse(error, { path: requestPath }));
  }
}

export const supportedDocTypes = Array.from(REGISTRY.keys());
