/**
 * Audio-related type definitions
 * Provides proper typing for Web Audio API usage across browsers
 */

/**
 * AudioContext constructor type that handles browser compatibility
 * Supports standard AudioContext and webkit-prefixed version for Safari
 */
export type AudioContextConstructor = typeof AudioContext;

/**
 * Extended Window interface with webkit AudioContext support
 */
export interface AudioWindow extends Window {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
}

/**
 * Gets the AudioContext constructor with cross-browser support
 * @param win - Window object (defaults to global window)
 * @returns AudioContext constructor or undefined if not available
 */
export function getAudioContextConstructor(win: AudioWindow = window as AudioWindow): AudioContextConstructor | undefined {
  return win.AudioContext || win.webkitAudioContext;
}

/**
 * Microphone level data emitted during audio analysis
 */
export interface MicLevelData {
  /** Normalized audio level (0-1) */
  level: number;
  /** Audio level in decibels (~-100 to 0) */
  db: number;
  /** Peak level for visual feedback (0-1) */
  peak: number;
}

/**
 * Microphone state for the useMicLevel hook
 */
export interface MicState {
  /** Whether the microphone is currently active */
  isActive: boolean;
  /** Permission status: true (granted), false (denied), null (unknown) */
  hasPermission: boolean | null;
  /** Current normalized audio level (0-1) */
  level: number;
  /** Current audio level in decibels (~-100 to 0) */
  db: number;
  /** Current peak level (0-1) */
  peak: number;
  /** Error message if an error occurred */
  error?: string;
  /** Available audio input devices */
  devices: MediaDeviceInfo[];
  /** Currently selected device ID */
  selectedDeviceId?: string;
}

/**
 * Audio recording state
 */
export type RecordingStatus = 'idle' | 'listening' | 'transcribing';

/**
 * Supported audio MIME types for recording
 */
export type AudioMimeType =
  | 'audio/webm'
  | 'audio/mp4'
  | 'audio/m4a'
  | 'audio/mpeg'
  | '';

/**
 * Error type for audio-related operations
 */
export interface AudioError {
  message: string;
  code?: string;
  originalError?: unknown;
}
