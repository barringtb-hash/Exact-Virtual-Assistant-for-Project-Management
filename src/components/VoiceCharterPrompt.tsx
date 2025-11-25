/**
 * VoiceCharterPrompt - Modal prompt asking if user wants voice-guided charter creation.
 *
 * Appears when the user activates voice mode while the charter wizard is visible.
 *
 * @module components/VoiceCharterPrompt
 */

import React, { useCallback, useEffect, useRef } from "react";

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

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

export interface VoiceCharterPromptProps {
  /** Whether the prompt is visible */
  visible: boolean;
  /** Called when user chooses to use voice charter */
  onConfirm: () => void;
  /** Called when user declines voice charter (just use regular transcription) */
  onDecline: () => void;
  /** Called when user dismisses the prompt without choosing */
  onDismiss?: () => void;
}

/**
 * Modal prompt for voice charter activation.
 */
export const VoiceCharterPrompt = React.memo(
  ({ visible, onConfirm, onDecline, onDismiss }: VoiceCharterPromptProps) => {
    const modalRef = useRef<HTMLDivElement>(null);

    // Handle escape key to dismiss
    useEffect(() => {
      if (!visible) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          onDismiss?.() ?? onDecline();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [visible, onDismiss, onDecline]);

    // Handle click outside to dismiss
    const handleBackdropClick = useCallback(
      (event: React.MouseEvent) => {
        if (event.target === event.currentTarget) {
          onDismiss?.() ?? onDecline();
        }
      },
      [onDismiss, onDecline]
    );

    if (!visible) {
      return null;
    }

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-charter-prompt-title"
      >
        <div
          ref={modalRef}
          className={classNames(
            "mx-4 max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-800",
            "animate-in fade-in zoom-in-95 duration-200"
          )}
        >
          {/* Icon */}
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
              <MicrophoneIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>

          {/* Title */}
          <h2
            id="voice-charter-prompt-title"
            className="mb-2 text-center text-lg font-semibold text-slate-800 dark:text-slate-100"
          >
            Use Voice for Charter?
          </h2>

          {/* Description */}
          <p className="mb-6 text-center text-sm text-slate-600 dark:text-slate-300">
            Would you like to create your project charter using voice? I'll guide you through each field conversationally.
          </p>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onConfirm}
              className={classNames(
                "w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-sm",
                "transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
                "dark:bg-indigo-500 dark:hover:bg-indigo-400"
              )}
            >
              Yes, use voice
            </button>
            <button
              type="button"
              onClick={onDecline}
              className={classNames(
                "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700",
                "transition hover:bg-slate-50 hover:border-slate-300",
                "dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              )}
            >
              No, just transcribe
            </button>
          </div>

          {/* Hint */}
          <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            You can switch modes anytime by exiting voice
          </p>
        </div>
      </div>
    );
  }
);

VoiceCharterPrompt.displayName = "VoiceCharterPrompt";

export default VoiceCharterPrompt;
