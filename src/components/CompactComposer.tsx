import React, { useState } from "react";

interface CompactComposerProps {
  onSubmit: (text: string) => void;
  onMicStart?: () => void;
  onMicStop?: () => void;
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

export default function CompactComposer({
  onSubmit,
  onMicStart,
  onMicStop,
  isRecording = false,
  disabled = false,
}: CompactComposerProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (text.trim() && !disabled) {
      onSubmit(text.trim());
      setText("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleMicClick = () => {
    if (disabled) return;
    // Defensive check: only call handlers if they exist
    if (isRecording) {
      onMicStop?.();
    } else {
      onMicStart?.();
    }
  };

  // Determine if mic button should be available
  const micAvailable = onMicStart !== undefined && onMicStop !== undefined;

  return (
    <div className="fixed right-6 bottom-6 z-30 flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 shadow-lg dark:border-gray-600 dark:bg-gray-800">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={disabled}
        placeholder="Ask EVA…"
        className="min-w-[220px] max-w-[360px] border-0 focus:outline-none text-sm text-gray-800 dark:text-gray-100 bg-transparent placeholder-gray-400"
        aria-label="Send message to EVA"
        data-testid="compact-composer-input"
      />
      {micAvailable && (
        <button
          type="button"
          onClick={handleMicClick}
          disabled={disabled}
          aria-pressed={isRecording}
          aria-label={isRecording ? "Stop recording" : "Start voice recording"}
          className={`p-2 rounded-full transition-colors ${
            isRecording
              ? "bg-red-500 text-white hover:bg-red-600"
              : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          data-testid="compact-composer-mic"
        >
          <IconMic className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
