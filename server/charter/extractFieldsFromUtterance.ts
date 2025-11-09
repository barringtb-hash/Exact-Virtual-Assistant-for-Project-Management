import OpenAI from "openai";
import {
  CHARTER_FIELDS,
  type CharterField,
  type CharterFieldChild,
  type CharterFieldId,
} from "../../src/features/charter/schema";
import { type CharterDTOValue } from "../../src/features/charter/persist";
import { validateField } from "../../src/features/charter/validate";
import {
  normalizeObjectEntries,
  normalizeStringList,
  toTrimmedString,
} from "../../lib/charter/normalize.js";

const TOOL_NAME = "extract_charter_fields";
const ISO_DATE_PATTERN = "^(?:\\d{4})-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$";

const runtimeEnv: Record<string, string | undefined> =
  typeof globalThis !== "undefined" &&
  typeof (globalThis as any)?.process?.env !== "undefined"
    ? ((globalThis as any).process.env as Record<string, string | undefined>)
    : {};

const CHARTER_FIELD_MAP = new Map<CharterFieldId, CharterField>();
for (const field of CHARTER_FIELDS) {
  CHARTER_FIELD_MAP.set(field.id, field);
}

export interface CharterUtteranceMessage {
  role: "user" | "assistant" | "system" | "developer";
  content: string;
}

export interface CharterAttachment {
  name?: string;
  text: string;
  mimeType?: string;
}

export interface CharterVoiceEvent {
  id?: string;
  text: string;
  timestamp?: number;
}

export interface CharterExtractionRequest {
  messages?: CharterUtteranceMessage[];
  attachments?: CharterAttachment[];
  voice?: CharterVoiceEvent[];
  seed?: Record<string, unknown> | null;
  requestedFieldIds: CharterFieldId[];
  /** Optional explicit model override. */
  model?: string;
}

export interface CharterExtractionOptions {
  client?: OpenAI;
  signal?: AbortSignal;
}

export interface ExtractionIssue {
  code: "validation_failed" | "missing_required" | "invalid_tool_payload";
  message: string;
  fieldId?: CharterFieldId;
  details?: unknown;
  level: "warning" | "error";
}

export interface ExtractionError {
  code:
    | "configuration"
    | "no_fields_requested"
    | "missing_tool_call"
    | "invalid_tool_payload"
    | "openai_error"
    | "missing_required"
    | "validation_failed";
  message: string;
  details?: unknown;
  fields?: CharterFieldId[];
}

export interface ExtractFieldsSuccess {
  ok: true;
  fields: Partial<Record<CharterFieldId, CharterDTOValue>>;
  warnings: ExtractionIssue[];
  rawToolArguments: unknown;
}

export interface ExtractFieldsFailure {
  ok: false;
  error: ExtractionError;
  warnings: ExtractionIssue[];
  fields: Partial<Record<CharterFieldId, CharterDTOValue>>;
  rawToolArguments: unknown;
}

export type ExtractFieldsResult = ExtractFieldsSuccess | ExtractFieldsFailure;

function resolveApiKey(): string | null {
  const candidates = [
    runtimeEnv.OPENAI_API_KEY,
    runtimeEnv.openai_api_key,
    runtimeEnv.OPENAI_KEY,
    runtimeEnv.openai_key,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function resolveModel(explicit?: string): string {
  const candidates = [
    explicit,
    runtimeEnv.CHARTER_EXTRACTION_MODEL,
    runtimeEnv.charter_extraction_model,
    runtimeEnv.OPENAI_EXTRACTION_MODEL,
    runtimeEnv.openai_extraction_model,
    runtimeEnv.OPENAI_MODEL,
    runtimeEnv.openai_model,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    return trimmed;
  }

  return "gpt-4.1-mini";
}

function createOpenAIClient(): OpenAI {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new CharterExtractionConfigurationError(
      "Missing OpenAI API key for charter field extraction."
    );
  }
  return new OpenAI({ apiKey });
}

export class CharterExtractionConfigurationError extends Error {
  code: ExtractionError["code"];

  constructor(message: string) {
    super(message);
    this.code = "configuration";
  }
}

export class CharterExtractionToolError extends Error {
  code: ExtractionError["code"];
  details?: unknown;

  constructor(message: string, code: ExtractionError["code"], details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function sanitizeMessages(messages: CharterUtteranceMessage[] | undefined): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  return messages
    .map((message) => {
      if (!message || typeof message.content !== "string") {
        return null;
      }
      const role =
        message.role === "assistant" ||
        message.role === "system" ||
        message.role === "developer"
          ? message.role
          : "user";
      const text = message.content.trim();
      if (!text) {
        return null;
      }
      return `${role.toUpperCase()}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

function sanitizeAttachments(attachments: CharterAttachment[] | undefined): string {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return "";
  }

  return attachments
    .map((attachment, index) => {
      if (!attachment || typeof attachment.text !== "string") {
        return null;
      }
      const text = attachment.text.trim();
      if (!text) {
        return null;
      }
      const name =
        typeof attachment.name === "string" && attachment.name.trim()
          ? attachment.name.trim()
          : `Attachment ${index + 1}`;
      return `### ${name}\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function sanitizeVoice(voice: CharterVoiceEvent[] | undefined): string {
  if (!Array.isArray(voice) || voice.length === 0) {
    return "";
  }

  return voice
    .map((event) => {
      if (!event || typeof event.text !== "string") {
        return null;
      }
      const text = event.text.trim();
      if (!text) {
        return null;
      }
      const timestamp =
        typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
          ? new Date(event.timestamp).toISOString()
          : null;
      return timestamp ? `${timestamp}: ${text}` : text;
    })
    .filter(Boolean)
    .join("\n");
}

export function buildToolFieldSchema(field: CharterField): Record<string, unknown> {
  switch (field.type) {
    case "string":
    case "textarea":
      return {
        type: "string",
        description: field.question,
        ...(field.maxLength ? { maxLength: field.maxLength } : {}),
      };
    case "date":
      return {
        type: "string",
        description: field.question,
        pattern: ISO_DATE_PATTERN,
      };
    case "string_list":
      return {
        description: field.question,
        anyOf: [
          {
            type: "array",
            items: { type: "string" },
          },
          { type: "string" },
        ],
      };
    case "object_list": {
      const children = Array.isArray(field.children) ? field.children : [];
      const childProperties: Record<string, unknown> = {};
      for (const child of children) {
        childProperties[child.id] = buildChildPropertySchema(child);
      }
      return {
        description: field.question,
        anyOf: [
          {
            type: "array",
            items: {
              type: "object",
              properties: childProperties,
              additionalProperties: false,
            },
          },
          {
            type: "array",
            items: {
              anyOf: [{ type: "string" }, { type: "object" }],
            },
          },
          { type: "string" },
        ],
      };
    }
    default:
      return { type: "string" };
  }
}

function buildChildPropertySchema(child: CharterFieldChild): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: "string",
    description: child.label,
  };
  if (child.type === "date") {
    base.pattern = ISO_DATE_PATTERN;
  }
  return base;
}

export function buildToolSchema(requestedFieldIds: CharterFieldId[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: CharterFieldId[] = [];

  for (const fieldId of requestedFieldIds) {
    const field = CHARTER_FIELD_MAP.get(fieldId);
    if (!field) continue;
    properties[fieldId] = buildToolFieldSchema(field);
    if (field.required) {
      required.push(fieldId);
    }
  }

  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function buildRequestedFieldSummary(ids: CharterFieldId[]): string {
  return ids
    .map((id) => {
      const field = CHARTER_FIELD_MAP.get(id);
      if (!field) {
        return null;
      }
      const statusLabel = field.required ? "required" : "optional";
      return `${id}: ${field.label} (${statusLabel})`;
    })
    .filter(Boolean)
    .join("\n");
}

function buildResponseInput(payload: CharterExtractionRequest): string {
  const segments: string[] = [];
  segments.push(
    "You analyze project charter conversations and must call the extract_charter_fields tool with the requested fields."
  );

  const messageBlock = sanitizeMessages(payload.messages);
  if (messageBlock) {
    segments.push("Conversation History:\n" + messageBlock);
  }

  const attachmentBlock = sanitizeAttachments(payload.attachments);
  if (attachmentBlock) {
    segments.push("Attachments:\n" + attachmentBlock);
  }

  const voiceBlock = sanitizeVoice(payload.voice);
  if (voiceBlock) {
    segments.push("Voice Transcript:\n" + voiceBlock);
  }

  if (payload.seed && Object.keys(payload.seed).length > 0) {
    segments.push(
      "Existing Charter Seed:\n" + JSON.stringify(payload.seed, null, 2)
    );
  }

  segments.push(
    "Requested Charter Fields:\n" + buildRequestedFieldSummary(payload.requestedFieldIds)
  );

  segments.push(
    "Only call the extract_charter_fields tool and ensure values follow the charter schema."
  );

  return segments.join("\n\n");
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch (error) {
      throw new CharterExtractionToolError(
        "Failed to parse tool arguments JSON.",
        "invalid_tool_payload",
        { raw }
      );
    }
  }

  throw new CharterExtractionToolError(
    "Unexpected tool arguments payload.",
    "invalid_tool_payload",
    { raw }
  );
}

function createChildValidationField(
  parent: CharterField,
  child: CharterFieldChild
): CharterField {
  return {
    ...parent,
    type: child.type,
    required: false,
    maxLength: null,
    placeholder: child.placeholder,
    children: undefined,
  };
}

interface SanitizedFieldResult {
  value?: CharterDTOValue;
  issues: ExtractionIssue[];
}

function sanitizeSimpleField(
  field: CharterField,
  rawValue: unknown
): SanitizedFieldResult {
  const issues: ExtractionIssue[] = [];
  const normalized = Array.isArray(rawValue)
    ? toTrimmedString(rawValue[0] as unknown)
    : toTrimmedString(rawValue as unknown);

  if (!normalized) {
    const validation = validateField(field, normalized);
    if (!validation.valid) {
      issues.push({
        code: "validation_failed",
        message: validation.message,
        fieldId: field.id,
        details: { rawValue },
        level: field.required ? "error" : "warning",
      });
    }
    return { issues };
  }

  const validation = validateField(field, normalized);
  if (!validation.valid) {
    issues.push({
      code: "validation_failed",
      message: validation.message,
      fieldId: field.id,
      details: { rawValue },
      level: field.required ? "error" : "warning",
    });
    return { issues };
  }

  return { value: normalized, issues };
}

function sanitizeStringListField(
  field: CharterField,
  rawValue: unknown
): SanitizedFieldResult {
  const issues: ExtractionIssue[] = [];
  const normalizedList = normalizeStringList(rawValue as any);
  if (!normalizedList.length) {
    if (field.required) {
      const validation = validateField(field, "");
      if (!validation.valid) {
        issues.push({
          code: "missing_required",
          message: validation.message,
          fieldId: field.id,
          details: { rawValue },
          level: "error",
        });
      }
    }
    return { issues };
  }

  const validEntries: string[] = [];
  for (const entry of normalizedList) {
    const validation = validateField(field, entry);
    if (!validation.valid) {
      issues.push({
        code: "validation_failed",
        message: validation.message,
        fieldId: field.id,
        details: { entry, rawValue },
        level: "warning",
      });
      continue;
    }
    validEntries.push(entry);
  }

  if (!validEntries.length) {
    if (field.required) {
      issues.push({
        code: "missing_required",
        message: "No valid entries for required list field.",
        fieldId: field.id,
        details: { rawValue },
        level: "error",
      });
    }
    return { issues };
  }

  return { value: validEntries, issues };
}

function sanitizeObjectListField(
  field: CharterField,
  rawValue: unknown
): SanitizedFieldResult {
  const issues: ExtractionIssue[] = [];
  const childIds = Array.isArray(field.children)
    ? field.children.map((child) => child.id)
    : [];
  const normalizedEntries = normalizeObjectEntries(rawValue as any, childIds);

  if (!normalizedEntries.length) {
    if (field.required) {
      issues.push({
        code: "missing_required",
        message: "No valid entries for required object list field.",
        fieldId: field.id,
        details: { rawValue },
        level: "error",
      });
    }
    return { issues };
  }

  const sanitizedEntries: Record<string, string>[] = [];
  const children = Array.isArray(field.children) ? field.children : [];

  for (const entry of normalizedEntries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const sanitized: Record<string, string> = {};
    let hasValidValue = false;

    for (const child of children) {
      const value = toTrimmedString((entry as Record<string, unknown>)[child.id]);
      if (!value) {
        continue;
      }

      const validation = validateField(createChildValidationField(field, child), value);
      if (!validation.valid) {
        issues.push({
          code: "validation_failed",
          message: `${child.label}: ${validation.message}`,
          fieldId: field.id,
          details: { child: child.id, value },
          level: "warning",
        });
        continue;
      }

      sanitized[child.id] = value;
      hasValidValue = true;
    }

    if (hasValidValue && Object.keys(sanitized).length > 0) {
      sanitizedEntries.push(sanitized);
    }
  }

  if (!sanitizedEntries.length) {
    if (field.required) {
      issues.push({
        code: "missing_required",
        message: "All object entries were invalid for required field.",
        fieldId: field.id,
        details: { rawValue },
        level: "error",
      });
    }
    return { issues };
  }

  return { value: sanitizedEntries, issues };
}

export function sanitizeFieldValue(
  field: CharterField,
  rawValue: unknown
): SanitizedFieldResult {
  switch (field.type) {
    case "string":
    case "textarea":
    case "date":
      return sanitizeSimpleField(field, rawValue);
    case "string_list":
      return sanitizeStringListField(field, rawValue);
    case "object_list":
      return sanitizeObjectListField(field, rawValue);
    default:
      return { issues: [] };
  }
}

function splitIssues(issues: ExtractionIssue[]): {
  warnings: ExtractionIssue[];
  errors: ExtractionIssue[];
} {
  const warnings: ExtractionIssue[] = [];
  const errors: ExtractionIssue[] = [];

  for (const issue of issues) {
    if (issue.level === "error") {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  }

  return { warnings, errors };
}

export function normalizeExtractedFields(
  parsedArguments: Record<string, unknown>,
  requestedFieldIds: CharterFieldId[]
): {
  fields: Partial<Record<CharterFieldId, CharterDTOValue>>;
  warnings: ExtractionIssue[];
  errors: ExtractionIssue[];
} {
  const fieldPatch: Partial<Record<CharterFieldId, CharterDTOValue>> = {};
  const aggregatedIssues: ExtractionIssue[] = [];

  for (const fieldId of requestedFieldIds) {
    const field = CHARTER_FIELD_MAP.get(fieldId);
    if (!field) continue;
    const rawValue = parsedArguments[fieldId];

    if (rawValue === undefined) {
      if (field.required) {
        aggregatedIssues.push({
          code: "missing_required",
          message: "Required field was omitted from the tool output.",
          fieldId,
          level: "error",
        });
      }
      continue;
    }

    const { value, issues } = sanitizeFieldValue(field, rawValue);
    aggregatedIssues.push(...issues);
    if (value !== undefined) {
      fieldPatch[fieldId] = value;
    }
  }

  const { warnings, errors } = splitIssues(aggregatedIssues);
  return { fields: fieldPatch, warnings, errors };
}

function extractToolArguments(response: any): unknown {
  const getToolCallDetails = (call: any) => {
    if (!call) return null;

    if (call.type === "function_call") {
      return { name: call.name, arguments: call.arguments };
    }

    if (call.type === "function" && call.function) {
      return {
        name: call.function?.name,
        arguments: call.function?.arguments,
      };
    }

    return null;
  };

  const output = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    const call = getToolCallDetails(item);
    if (call?.name === TOOL_NAME) {
      return call.arguments;
    }
  }

  const toolCalls = Array.isArray(response?.output?.[0]?.tool_calls)
    ? response.output[0].tool_calls
    : [];
  for (const callEntry of toolCalls) {
    const call = getToolCallDetails(callEntry);
    if (call?.name === TOOL_NAME) {
      return call.arguments;
    }
  }

  return null;
}

export async function extractFieldsFromUtterance(
  payload: CharterExtractionRequest,
  options: CharterExtractionOptions = {}
): Promise<ExtractFieldsResult> {
  const requestedFieldIds = Array.isArray(payload.requestedFieldIds)
    ? payload.requestedFieldIds.filter((id): id is CharterFieldId =>
        CHARTER_FIELD_MAP.has(id)
      )
    : [];

  if (requestedFieldIds.length === 0) {
    return {
      ok: false,
      error: {
        code: "no_fields_requested",
        message: "No valid charter field ids were requested for extraction.",
      },
      warnings: [],
      fields: {},
      rawToolArguments: null,
    };
  }

  const client = options.client ?? createOpenAIClient();
  const schema = buildToolSchema(requestedFieldIds);
  const model = resolveModel(payload.model);
  const input = buildResponseInput({ ...payload, requestedFieldIds });

  let response;
  try {
    const requestBody = {
      model,
      input,
      tools: [
        {
          type: "function",
          function: {
            name: TOOL_NAME,
            description:
              "Populate project charter fields extracted from the provided context.",
            parameters: schema,
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME, strict: true },
    } as const;

    response = await client.responses.create(
      requestBody,
      options.signal ? { signal: options.signal } : undefined
    );
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "openai_error",
        message: "Failed to invoke charter field extraction model.",
        details: error instanceof Error ? { message: error.message } : error,
      },
      warnings: [],
      fields: {},
      rawToolArguments: null,
    };
  }

  const toolArgumentsRaw = extractToolArguments(response);
  if (!toolArgumentsRaw) {
    return {
      ok: false,
      error: {
        code: "missing_tool_call",
        message: "The model response did not include the extract_charter_fields tool call.",
      },
      warnings: [],
      fields: {},
      rawToolArguments: toolArgumentsRaw,
    };
  }

  let parsedArguments: Record<string, unknown>;
  try {
    parsedArguments = parseToolArguments(toolArgumentsRaw);
  } catch (error) {
    if (error instanceof CharterExtractionToolError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        warnings: [],
        fields: {},
        rawToolArguments: toolArgumentsRaw,
      };
    }
    return {
      ok: false,
      error: {
        code: "invalid_tool_payload",
        message: "Unexpected tool payload returned by the model.",
        details: { error: error instanceof Error ? error.message : error },
      },
      warnings: [],
      fields: {},
      rawToolArguments: toolArgumentsRaw,
    };
  }

  const { fields: fieldPatch, warnings, errors } = normalizeExtractedFields(
    parsedArguments,
    requestedFieldIds
  );

  if (errors.length > 0) {
    const primaryError = errors[0];
    return {
      ok: false,
      error: {
        code: primaryError.code === "missing_required"
          ? "missing_required"
          : "validation_failed",
        message: primaryError.message,
        details: { issues: errors },
        fields: errors
          .map((issue) => issue.fieldId)
          .filter((id): id is CharterFieldId => Boolean(id)),
      },
      warnings,
      fields: fieldPatch,
      rawToolArguments: parsedArguments,
    };
  }

  return {
    ok: true,
    fields: fieldPatch,
    warnings,
    rawToolArguments: parsedArguments,
  };
}

export async function extractFieldsFromUtterances(
  requests: CharterExtractionRequest[],
  options: CharterExtractionOptions = {}
): Promise<ExtractFieldsResult[]> {
  if (!Array.isArray(requests) || requests.length === 0) {
    return [];
  }

  const client = options.client ?? createOpenAIClient();
  const results: ExtractFieldsResult[] = [];

  for (const request of requests) {
    try {
      const result = await extractFieldsFromUtterance(request, {
        ...options,
        client,
      });
      results.push(result);
    } catch (error) {
      results.push({
        ok: false,
        error: {
          code: "openai_error",
          message: "Charter field extraction batch request failed.",
          details: error instanceof Error ? { message: error.message } : error,
        },
        warnings: [],
        fields: {},
        rawToolArguments: null,
      });
    }
  }

  return results;
}
