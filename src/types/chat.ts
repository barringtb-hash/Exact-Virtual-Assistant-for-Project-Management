/**
 * Consolidated chat type definitions
 * Single source of truth for chat-related types across the application
 */

/**
 * Chat message role type
 * Used consistently across ChatContext and chatStore
 */
export type ChatRole = 'user' | 'assistant' | 'system';

/**
 * Base chat message interface
 * Contains common fields used by all message representations
 */
export interface BaseChatMessage {
  /** Unique identifier for the message */
  id: string;
  /** Role of the message sender */
  role: ChatRole;
  /** Timestamp when the message was created */
  timestamp?: number;
}

/**
 * Chat message for display in UI (ChatContext)
 * Extended with UI-specific fields
 */
export interface ChatMessage extends BaseChatMessage {
  /** Message content text */
  content: string;
  /** Whether the message is still being generated */
  pending?: boolean;
  /** Error message if the message failed */
  error?: string | null;
  /** Whether the message can be retried */
  retryable?: boolean;
  /** Callback to retry the message */
  onRetry?: (() => void) | null;
}

/**
 * Message for internal state management (chatStore)
 * Optimized for streaming and state updates
 */
export interface StoreMessage extends BaseChatMessage {
  /** Message text content */
  text: string;
  /** Run ID for tracking streaming responses */
  runId?: string;
}

/**
 * Chat state for the global store
 */
export interface ChatState {
  /** All messages in the conversation */
  messages: StoreMessage[];
  /** Whether a response is currently streaming */
  isStreaming: boolean;
  /** Whether the assistant is processing (before streaming starts) */
  isAssistantThinking: boolean;
  /** Whether the preview is syncing */
  isSyncingPreview: boolean;
  /** Whether input is locked */
  inputLocked: boolean;
  /** Current active run ID */
  activeRunId?: string;
  /** Current draft in the composer */
  composerDraft: string;
}

/**
 * Function type for updating messages
 */
export type MessageUpdater<T extends BaseChatMessage> = (messages: T[]) => T[];

/**
 * Chat action types for reducers
 */
export type ChatActionType = 'append' | 'update' | 'reset';

/**
 * Chat action for appending a message
 */
export interface AppendMessageAction<T extends BaseChatMessage> {
  type: 'append';
  message: T;
}

/**
 * Chat action for updating a message
 */
export interface UpdateMessageAction<T extends BaseChatMessage> {
  type: 'update';
  id: string;
  updater: (message: T) => T;
}

/**
 * Chat action for resetting messages
 */
export interface ResetMessagesAction<T extends BaseChatMessage> {
  type: 'reset';
  messages: T[];
}

/**
 * Union type of all chat actions
 */
export type ChatAction<T extends BaseChatMessage> =
  | AppendMessageAction<T>
  | UpdateMessageAction<T>
  | ResetMessagesAction<T>;

/**
 * Convert a StoreMessage to a ChatMessage for display
 */
export function storeMessageToChatMessage(message: StoreMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.text,
    timestamp: message.timestamp,
  };
}

/**
 * Convert a ChatMessage to a StoreMessage for storage
 */
export function chatMessageToStoreMessage(message: ChatMessage): StoreMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.content,
    timestamp: message.timestamp,
  };
}

/**
 * Type guard for ChatMessage
 */
export function isChatMessage(value: unknown): value is ChatMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ChatMessage).id === 'string' &&
    typeof (value as ChatMessage).role === 'string' &&
    typeof (value as ChatMessage).content === 'string'
  );
}

/**
 * Type guard for StoreMessage
 */
export function isStoreMessage(value: unknown): value is StoreMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoreMessage).id === 'string' &&
    typeof (value as StoreMessage).role === 'string' &&
    typeof (value as StoreMessage).text === 'string'
  );
}
