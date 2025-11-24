/**
 * API-related type definitions
 * Provides proper typing for API responses and requests
 */

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Transcription API response
 */
export interface TranscriptionResponse {
  transcript?: string;
  text?: string;
  error?: string;
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiErrorResponse;
}

/**
 * Streaming response chunk types
 */
export interface StreamingChunk {
  id?: string;
  object?: string;
  choices?: StreamingChoice[];
  error?: ApiErrorResponse;
}

export interface StreamingChoice {
  index: number;
  delta?: StreamingDelta;
  finish_reason?: string | null;
}

export interface StreamingDelta {
  content?: string;
  role?: string;
}

/**
 * OpenAI-compatible message format
 */
export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string | OpenAIMessageContent[];
}

export interface OpenAIMessageContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Chat attachment type
 */
export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  content?: string;
}

/**
 * Chat request body
 */
export interface ChatRequestBody {
  messages: OpenAIMessage[];
  attachments?: ChatAttachment[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/**
 * Document extraction response
 */
export interface ExtractionResponse {
  fields: Record<string, unknown>;
  issues?: ExtractionIssue[];
  confidence?: number;
}

export interface ExtractionIssue {
  fieldId: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Document validation response
 */
export interface ValidationResponse {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: ValidationWarning[];
}

export interface ValidationError {
  fieldId: string;
  code: string;
  message: string;
}

export interface ValidationWarning {
  fieldId: string;
  code: string;
  message: string;
}

/**
 * Typed error for API operations
 */
export interface TypedApiError extends Error {
  status?: number;
  code?: string;
  response?: ApiErrorResponse;
}

/**
 * Type guard for API error responses
 */
export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorResponse).error === 'string'
  );
}

/**
 * Type guard for transcription response
 */
export function isTranscriptionResponse(value: unknown): value is TranscriptionResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.transcript === 'string' ||
    typeof obj.text === 'string' ||
    typeof obj.error === 'string'
  );
}
