import React, { useCallback, useState, useRef, useEffect } from "react";

export interface CompactComposerProps {
  onSubmit: (text: string) => void;
  onMicStart: () => void;
  onMicStop: () => void;
  isRecording?: boolean;
  disabled?: boolean;
}

const IconMic = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <path d="M12 19v3" />
  </svg>
);

const CompactComposer: React.FC<CompactComposerProps> = ({
  onSubmit,
  onMicStart,
  onMicStop,
  isRecording = false,
  disabled = false,
}) => {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(() => {
    if (text.trim() && !disabled) {
      onSubmit(text.trim());
      setText("");
    }
  }, [text, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleMicClick = useCallback(() => {
    if (disabled) return;
    if (isRecording) {
      onMicStop();
    } else {
      onMicStart();
    }
  }, [isRecording, onMicStart, onMicStop, disabled]);

  const micButtonClasses = isRecording
    ? "shrink-0 rounded-full border p-2 transition bg-red-50 border-red-200 text-red-600 hover:bg-red-100/80 dark:bg-red-900 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-800/60"
    : "shrink-0 rounded-full border p-2 transition bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600";

  return (
    <div
      className="fixed right-6 bottom-6 z-30 flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 shadow-lg dark:border-gray-600 dark:bg-gray-800"
      role="complementary"
      aria-label="Quick chat input"
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask EVA…"
        className="min-w-[220px] max-w-[360px] border-0 focus:outline-none text-sm text-gray-800 dark:text-gray-100 bg-transparent placeholder-gray-400 dark:placeholder-gray-500"
        data-testid="compact-composer-input"
        aria-label="Quick message input"
      />
      <button
        type="button"
        onClick={handleMicClick}
        disabled={disabled}
        className={micButtonClasses}
        title={isRecording ? "Stop recording" : "Voice input"}
        aria-label={isRecording ? "Stop recording" : "Start voice input"}
        aria-pressed={isRecording}
        data-testid="compact-composer-mic"
      >
        <IconMic className="h-4 w-4" />
      </button>
    </div>
  );
};

export default CompactComposer;
