/**
 * VoiceCharterSession - Voice-only UI for charter creation.
 *
 * This component displays a minimal, voice-focused interface for creating
 * project charters through conversation with the AI assistant.
 *
 * @module components/VoiceCharterSession
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  voiceCharterService,
  type VoiceCharterEvent,
  type VoiceCharterState,
  type VoiceCharterStep,
  type CapturedFieldValue,
  type FieldValueSource,
} from "../voice/VoiceCharterService";
import type { CharterFormField } from "../features/charter/utils/formSchema";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/**
 * Pulsing animation for listening state.
 */
const PulseIndicator = React.memo(({ active }: { active: boolean }) => (
  <div className="relative flex items-center justify-center">
    <div
      className={classNames(
        "absolute h-24 w-24 rounded-full transition-all duration-300",
        active
          ? "animate-ping bg-indigo-400/30"
          : "bg-slate-200/30 dark:bg-slate-700/30"
      )}
    />
    <div
      className={classNames(
        "absolute h-20 w-20 rounded-full transition-all duration-300",
        active
          ? "animate-pulse bg-indigo-400/50"
          : "bg-slate-200/50 dark:bg-slate-700/50"
      )}
    />
    <div
      className={classNames(
        "relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300",
        active
          ? "bg-indigo-500 shadow-lg shadow-indigo-500/50"
          : "bg-slate-300 dark:bg-slate-600"
      )}
    >
      <MicrophoneIcon
        className={classNames(
          "h-8 w-8 transition-colors",
          active ? "text-white" : "text-slate-500 dark:text-slate-400"
        )}
      />
    </div>
  </div>
));

PulseIndicator.displayName = "PulseIndicator";

/**
 * Microphone icon component.
 */
const MicrophoneIcon = React.memo(({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
    <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
  </svg>
));

MicrophoneIcon.displayName = "MicrophoneIcon";

/**
 * Speaker icon for AI speaking state.
 */
const SpeakerIcon = React.memo(({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
    <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
  </svg>
));

SpeakerIcon.displayName = "SpeakerIcon";

/**
 * Progress bar component.
 */
const ProgressBar = React.memo(
  ({ current, total }: { current: number; total: number }) => {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;

    return (
      <div className="w-full">
        <div className="mb-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            Field {current} of {total}
          </span>
          <span>{percent}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }
);

ProgressBar.displayName = "ProgressBar";

/**
 * Status indicator text.
 */
function getStatusText(step: VoiceCharterStep, aiSpeaking: boolean): string {
  if (aiSpeaking) {
    return "Assistant is speaking...";
  }

  switch (step) {
    case "idle":
      return "Ready to start";
    case "initializing":
      return "Setting up voice session...";
    case "asking":
      return "Listening for your response...";
    case "listening":
      return "Processing your response...";
    case "confirming":
      return "Confirming your response...";
    case "navigating":
      return "Navigating...";
    case "completed":
      return "Charter complete!";
    default:
      return "Ready";
  }
}

/**
 * Field badge showing current field with optional confirmation indicator.
 */
const FieldBadge = React.memo(
  ({
    field,
    awaitingConfirmation,
    capturedValue,
  }: {
    field: CharterFormField | null;
    awaitingConfirmation?: boolean;
    capturedValue?: CapturedFieldValue | null;
  }) => {
    if (!field) {
      return null;
    }

    const isExtracted = capturedValue?.source === "extraction";
    const needsConfirmation = awaitingConfirmation && isExtracted && !capturedValue?.userConfirmed;

    return (
      <div
        className={classNames(
          "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-sm",
          needsConfirmation
            ? "animate-pulse border border-amber-400/50 bg-amber-50/80 text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/30 dark:text-amber-200"
            : "bg-white/80 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
        )}
      >
        <span
          className={classNames(
            "h-2 w-2 rounded-full",
            needsConfirmation ? "bg-amber-500" : "bg-indigo-500"
          )}
        />
        {field.label}
        {field.required && (
          <span className="text-xs text-red-500 dark:text-red-400">*</span>
        )}
        {needsConfirmation && (
          <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
            (confirm?)
          </span>
        )}
      </div>
    );
  }
);

FieldBadge.displayName = "FieldBadge";

/**
 * Captured values list with source badges and confirmation status.
 */
const CapturedValuesList = React.memo(
  ({
    values,
    fields,
    currentFieldId,
    awaitingFieldConfirmation,
    onConfirm,
    onChange,
  }: {
    values: Map<string, CapturedFieldValue>;
    fields: CharterFormField[];
    currentFieldId?: string | null;
    awaitingFieldConfirmation?: boolean;
    onConfirm?: (fieldId: string) => void;
    onChange?: (fieldId: string) => void;
  }) => {
    const capturedFields = fields.filter((f) => values.has(f.id));

    if (capturedFields.length === 0) {
      return null;
    }

    return (
      <div className="mt-4 max-h-40 overflow-y-auto rounded-xl bg-white/60 p-3 dark:bg-slate-800/60">
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Captured
        </h4>
        <ul className="space-y-2 text-xs">
          {capturedFields.map((field) => {
            const captured = values.get(field.id);
            const isCurrentField = field.id === currentFieldId;
            const isAwaitingConfirmation = isCurrentField && awaitingFieldConfirmation && captured?.source === "extraction" && !captured?.userConfirmed;

            return (
              <li
                key={field.id}
                className={classNames(
                  "rounded-lg p-2 transition-all",
                  isAwaitingConfirmation
                    ? "animate-pulse border border-amber-400/50 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-900/20"
                    : "bg-slate-50/50 dark:bg-slate-700/30"
                )}
              >
                <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                  <span
                    className={classNames(
                      "mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full",
                      captured?.userConfirmed ? "bg-emerald-500" : captured?.source === "extraction" ? "bg-amber-500" : "bg-emerald-500"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{field.label}:</span>
                      <FieldSourceBadge source={captured?.source} />
                      <ConfirmationStatusIndicator
                        source={captured?.source}
                        userConfirmed={captured?.userConfirmed}
                      />
                    </div>
                    <span className="mt-0.5 block truncate text-slate-500 dark:text-slate-400">
                      {captured?.value}
                    </span>
                    {/* Quick action buttons for fields awaiting confirmation */}
                    {isAwaitingConfirmation && (onConfirm || onChange) && (
                      <div className="mt-2 flex gap-2">
                        {onConfirm && (
                          <button
                            type="button"
                            onClick={() => onConfirm(field.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                            aria-label={`Keep value for ${field.label}`}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Keep
                          </button>
                        )}
                        {onChange && (
                          <button
                            type="button"
                            onClick={() => onChange(field.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:hover:bg-slate-700"
                            aria-label={`Change value for ${field.label}`}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Change
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
);

CapturedValuesList.displayName = "CapturedValuesList";

/**
 * Voice commands hint.
 */
const VoiceCommandsHint = React.memo(() => (
  <div className="mt-4 rounded-xl bg-slate-100/80 p-3 text-center text-xs text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
    <p className="mb-1 font-medium">Voice Commands</p>
    <p>"Go back" | "Skip" | "Review" | "Done"</p>
  </div>
));

VoiceCommandsHint.displayName = "VoiceCommandsHint";

/**
 * Badge indicating the source of a captured field value.
 */
const FieldSourceBadge = React.memo(({ source }: { source?: FieldValueSource }) => {
  if (!source || source === "manual") {
    return null;
  }

  if (source === "extraction") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
        aria-label="Value from document"
      >
        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        From document
      </span>
    );
  }

  if (source === "voice") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        aria-label="Value from voice"
      >
        <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
          <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
        </svg>
        Voice
      </span>
    );
  }

  return null;
});

FieldSourceBadge.displayName = "FieldSourceBadge";

/**
 * Indicator showing confirmation status for extracted fields.
 */
const ConfirmationStatusIndicator = React.memo(
  ({ source, userConfirmed }: { source?: FieldValueSource; userConfirmed?: boolean }) => {
    // Only show for extracted fields
    if (source !== "extraction") {
      return null;
    }

    if (userConfirmed) {
      return (
        <span
          className="inline-flex items-center text-emerald-600 dark:text-emerald-400"
          aria-label="Confirmed"
          title="Confirmed"
        >
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path
              fillRule="evenodd"
              d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"
        aria-label="Needs confirmation"
        title="Needs confirmation"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-[10px]">Unconfirmed</span>
      </span>
    );
  }
);

ConfirmationStatusIndicator.displayName = "ConfirmationStatusIndicator";

export interface VoiceCharterSessionProps {
  className?: string;
  visible?: boolean;
  aiSpeaking?: boolean;
  /** Compact mode for overlay/sidebar display */
  compact?: boolean;
  onComplete?: (values: Record<string, string>) => void;
  onExit?: () => void;
}

/**
 * Voice-only charter session component.
 */
export const VoiceCharterSession = React.memo(
  ({
    className,
    visible = true,
    aiSpeaking = false,
    compact = false,
    onComplete,
    onExit,
  }: VoiceCharterSessionProps) => {
    const [state, setState] = useState<VoiceCharterState>(
      voiceCharterService.getState()
    );
    const [currentField, setCurrentField] = useState<CharterFormField | null>(
      voiceCharterService.getCurrentField()
    );

    // Subscribe to service events
    useEffect(() => {
      const unsubscribe = voiceCharterService.subscribe(
        (event: VoiceCharterEvent) => {
          if (event.type === "state_changed") {
            setState(event.state);
            setCurrentField(voiceCharterService.getCurrentField());
          } else if (event.type === "completed") {
            const values = voiceCharterService.getCapturedValuesObject();
            onComplete?.(values);
          }
        }
      );

      // Get initial state
      setState(voiceCharterService.getState());
      setCurrentField(voiceCharterService.getCurrentField());

      return unsubscribe;
    }, [onComplete]);

    const progress = useMemo(
      () => voiceCharterService.getProgress(),
      [state.currentFieldIndex]
    );

    const fields = useMemo(() => voiceCharterService.getFields(), [state.step]);

    const isListening = state.step === "asking" || state.step === "listening";
    const statusText = getStatusText(state.step, aiSpeaking);

    const handleExitClick = useCallback(() => {
      onExit?.();
    }, [onExit]);

    // Handle confirm button click - triggers voice service to keep extracted value
    const handleConfirmField = useCallback((fieldId: string) => {
      // Send "keep it" as a user transcript to trigger the confirmation flow
      voiceCharterService.processTranscript("keep it", "user");
    }, []);

    // Handle change button click - triggers voice service to request new value
    const handleChangeField = useCallback((fieldId: string) => {
      // Send "change it" as a user transcript to trigger the edit flow
      voiceCharterService.processTranscript("change it", "user");
    }, []);

    if (!visible) {
      return null;
    }

    // Compact mode: horizontal layout optimized for overlay
    if (compact) {
      return (
        <section
          className={classNames(
            "rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800",
            className
          )}
          aria-live="polite"
        >
          <div className="flex items-center gap-3">
            {/* Compact visual indicator */}
            <div className="flex-shrink-0">
              {aiSpeaking ? (
                <div className="relative flex h-10 w-10 items-center justify-center">
                  <div className="absolute h-10 w-10 animate-pulse rounded-full bg-emerald-400/30" />
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 shadow-md">
                    <SpeakerIcon className="h-4 w-4 text-white" />
                  </div>
                </div>
              ) : (
                <div className="relative flex h-10 w-10 items-center justify-center">
                  <div
                    className={classNames(
                      "absolute h-10 w-10 rounded-full transition-all",
                      isListening ? "animate-ping bg-indigo-400/30" : "bg-slate-200/30 dark:bg-slate-700/30"
                    )}
                  />
                  <div
                    className={classNames(
                      "relative flex h-8 w-8 items-center justify-center rounded-full transition-all",
                      isListening ? "bg-indigo-500 shadow-md" : "bg-slate-300 dark:bg-slate-600"
                    )}
                  >
                    <MicrophoneIcon
                      className={classNames(
                        "h-4 w-4 transition-colors",
                        isListening ? "text-white" : "text-slate-500 dark:text-slate-400"
                      )}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Compact info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-800 dark:text-slate-100">
                  Voice Charter
                </span>
                {state.step !== "completed" && state.step !== "idle" && currentField && (
                  <>
                    <span
                      className={classNames(
                        "truncate text-xs",
                        state.awaitingFieldConfirmation && state.capturedValues.get(currentField.id)?.source === "extraction"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-indigo-600 dark:text-indigo-400"
                      )}
                    >
                      {currentField.label}
                      {currentField.required && <span className="text-red-500">*</span>}
                    </span>
                    {state.awaitingFieldConfirmation && state.capturedValues.get(currentField.id)?.source === "extraction" && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        Confirm?
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {statusText}
              </p>
              {/* Compact progress */}
              {state.step !== "idle" && state.step !== "completed" && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {progress.current}/{progress.total}
                  </span>
                </div>
              )}
            </div>

            {/* Exit button */}
            <button
              type="button"
              onClick={handleExitClick}
              className="flex-shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              title={state.step === "completed" ? "Close" : "Exit Voice Mode"}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Error display */}
          {state.error && (
            <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {state.error}
            </div>
          )}
        </section>
      );
    }

    // Full mode: centered layout for standalone display
    return (
      <section
        className={classNames(
          "flex flex-col items-center justify-center rounded-2xl border border-white/60 bg-gradient-to-b from-slate-50 to-white p-6 shadow-lg dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800",
          className
        )}
        aria-live="polite"
      >
        {/* Header */}
        <header className="mb-6 text-center">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Voice Charter
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {statusText}
          </p>
        </header>

        {/* Current field badge */}
        {state.step !== "completed" && state.step !== "idle" && (
          <FieldBadge
            field={currentField}
            awaitingConfirmation={state.awaitingFieldConfirmation}
            capturedValue={currentField ? state.capturedValues.get(currentField.id) : null}
          />
        )}

        {/* Main visual indicator */}
        <div className="my-8">
          {aiSpeaking ? (
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div className="absolute h-24 w-24 animate-pulse rounded-full bg-emerald-400/30" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50">
                <SpeakerIcon className="h-8 w-8 text-white" />
              </div>
            </div>
          ) : (
            <PulseIndicator active={isListening} />
          )}
        </div>

        {/* Progress bar */}
        {state.step !== "idle" && state.step !== "completed" && (
          <div className="w-full max-w-xs">
            <ProgressBar current={progress.current} total={progress.total} />
          </div>
        )}

        {/* Completed state */}
        {state.step === "completed" && (
          <div className="mt-4 text-center">
            <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-6 w-6 text-emerald-600 dark:text-emerald-400"
              >
                <path
                  fillRule="evenodd"
                  d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your charter is ready for review!
            </p>
          </div>
        )}

        {/* Captured values preview */}
        {state.capturedValues.size > 0 && state.step !== "completed" && (
          <CapturedValuesList
            values={state.capturedValues}
            fields={fields}
            currentFieldId={state.currentFieldId}
            awaitingFieldConfirmation={state.awaitingFieldConfirmation}
            onConfirm={handleConfirmField}
            onChange={handleChangeField}
          />
        )}

        {/* Voice commands hint */}
        {state.step !== "idle" && state.step !== "completed" && (
          <VoiceCommandsHint />
        )}

        {/* Exit button */}
        <button
          type="button"
          onClick={handleExitClick}
          className="mt-6 rounded-lg px-4 py-2 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          {state.step === "completed" ? "Close" : "Exit Voice Mode"}
        </button>

        {/* Error display */}
        {state.error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {state.error}
          </div>
        )}
      </section>
    );
  }
);

VoiceCharterSession.displayName = "VoiceCharterSession";

export default VoiceCharterSession;
