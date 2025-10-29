import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";

export type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

type RtcState = "idle" | "connecting" | "live" | "error";

export interface ComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onUploadClick: () => void;
  onMicToggle?: () => void;
  recording?: boolean;
  statusText?: string | null;
  onSyncNow?: () => void;
  canSync?: boolean;
  syncDisabled?: boolean;
  syncLabel?: string;
  sendDisabled?: boolean;
  uploadDisabled?: boolean;
  micDisabled?: boolean;
  disableDraft?: boolean;
  realtimeEnabled?: boolean;
  rtcState?: RtcState;
  startRealtime?: () => void;
  stopRealtime?: () => void;
  rtcStatusLabel?: string;
  rtcReset?: () => void;
  placeholder?: string;
  onDrop?: React.DragEventHandler<HTMLTextAreaElement>;
  onDragOver?: React.DragEventHandler<HTMLTextAreaElement>;
  IconUpload: IconComponent;
  IconMic: IconComponent;
  IconSend: IconComponent;
  children?: React.ReactNode;
}

const rtcStateClasses: Record<RtcState, string> = {
  idle:
    "bg-white/80 border-white/60 text-slate-600 dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-200",
  connecting:
    "bg-amber-50 border-amber-200 text-amber-600 animate-pulse dark:bg-amber-900 dark:border-amber-700 dark:text-amber-200",
  live:
    "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900 dark:border-emerald-700 dark:text-emerald-200",
  error:
    "bg-red-50 border-red-200 text-red-600 dark:bg-red-900 dark:border-red-700 dark:text-red-200",
};

const Composer: React.FC<ComposerProps> = ({
  draft,
  onDraftChange,
  onSend,
  onUploadClick,
  onMicToggle,
  recording = false,
  statusText,
  onSyncNow,
  canSync = true,
  syncDisabled = false,
  syncLabel,
  sendDisabled = false,
  uploadDisabled = false,
  micDisabled = false,
  disableDraft = false,
  realtimeEnabled = false,
  rtcState = "idle",
  startRealtime,
  stopRealtime,
  rtcStatusLabel,
  rtcReset,
  placeholder,
  onDrop,
  onDragOver,
  IconUpload,
  IconMic,
  IconSend,
  children,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaId = useId();

  const adjustTextareaHeight = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [draft, adjustTextareaHeight]);

  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      onDraftChange(event.target.value);
      adjustTextareaHeight();
    },
    [adjustTextareaHeight, onDraftChange]
  );

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (!sendDisabled) {
          onSend();
        }
      }
    },
    [onSend, sendDisabled]
  );

  const resolvedSyncLabel = useMemo(() => {
    if (syncLabel) return syncLabel;
    return syncDisabled && canSync ? "Syncing…" : "Sync now";
  }, [canSync, syncDisabled, syncLabel]);

  const realtimeButtonTitle = useMemo(() => {
    if (rtcState === "live") return "Stop realtime voice";
    if (rtcState === "connecting") return "Connecting realtime audio…";
    if (rtcState === "error") return "Retry realtime voice";
    return "Start realtime voice";
  }, [rtcState]);

  const handleRealtimeClick = useCallback(() => {
    if (rtcState === "live" || rtcState === "connecting") {
      stopRealtime?.();
    } else {
      startRealtime?.();
    }
  }, [rtcState, startRealtime, stopRealtime]);

  const handleSyncClick = useCallback(() => {
    if (syncDisabled || !canSync) return;
    onSyncNow?.();
  }, [canSync, onSyncNow, syncDisabled]);

  const micButtonClasses = recording
    ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100/80 dark:bg-red-900 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-800/60"
    : "bg-white/80 border-white/60 text-slate-600 hover:bg-white dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-700/60";

  return (
    <div className="sticky bottom-0 left-0 right-0">
      <div className="rounded-3xl border border-white/60 bg-white/80 px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-indigo-300 dark:border-slate-700/60 dark:bg-slate-900/50 dark:focus-within:ring-indigo-500">
        <label htmlFor={textareaId} className="sr-only">
          Message composer
        </label>
        <textarea
          id={textareaId}
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onDrop={onDrop}
          onDragOver={onDragOver}
          placeholder={placeholder}
          disabled={disableDraft}
          className="w-full min-h-[3.25rem] max-h-40 resize-none overflow-y-auto bg-transparent text-[15px] leading-6 text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {children}
            <button
              type="button"
              onClick={onUploadClick}
              disabled={uploadDisabled}
              className={`shrink-0 rounded-xl border p-2 transition ${
                uploadDisabled
                  ? "cursor-not-allowed bg-white/50 text-slate-400 border-white/50 dark:bg-slate-800/40 dark:border-slate-700/50 dark:text-slate-500"
                  : "bg-white/80 border-white/60 text-slate-600 hover:bg-white dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
              }`}
              title="Attach files"
            >
              <IconUpload className="h-5 w-5" />
            </button>
            {realtimeEnabled ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRealtimeClick}
                  disabled={!startRealtime && !stopRealtime}
                  className={`shrink-0 rounded-xl border p-2 transition ${rtcStateClasses[rtcState]}`}
                  title={realtimeButtonTitle}
                >
                  <IconMic className="h-5 w-5" />
                </button>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-lg border ${rtcStateClasses[rtcState]}`}
                >
                  {rtcStatusLabel || "Idle"}
                </span>
                {rtcState !== "idle" && (
                  <button
                    type="button"
                    onClick={rtcReset ?? stopRealtime}
                    className="rounded-lg border bg-white/80 px-2 py-1 text-xs transition hover:bg-white dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700/60"
                    title="Reset realtime call"
                  >
                    Reset
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onMicToggle}
                disabled={micDisabled}
                className={`shrink-0 rounded-xl border p-2 transition ${
                  micDisabled
                    ? "cursor-not-allowed bg-white/50 text-slate-400 border-white/50 dark:bg-slate-800/40 dark:border-slate-700/50 dark:text-slate-500"
                    : micButtonClasses
                }`}
                title={recording ? "Stop recording" : "Voice input (mock)"}
              >
                <IconMic className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onSyncNow && (
              <button
                type="button"
                onClick={handleSyncClick}
                disabled={syncDisabled || !canSync}
                className={`shrink-0 rounded-xl border px-3 py-2 text-sm transition ${
                  syncDisabled || !canSync
                    ? "cursor-not-allowed bg-white/50 text-slate-400 border-white/50 dark:bg-slate-800/40 dark:border-slate-700/50 dark:text-slate-500"
                    : "bg-white/80 border-white/60 text-slate-700 hover:bg-white dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-100 dark:hover:bg-slate-700"
                }`}
                title="Commit the latest updates to the preview"
              >
                {resolvedSyncLabel}
              </button>
            )}
            <button
              type="button"
              onClick={onSend}
              disabled={sendDisabled}
              className={`shrink-0 rounded-xl p-2 shadow-sm transition ${
                sendDisabled
                  ? "cursor-not-allowed bg-slate-500/70 text-white/80 opacity-60 dark:bg-indigo-300/60 dark:text-slate-200"
                  : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              }`}
              title={sendDisabled ? "Assistant is responding…" : "Send"}
            >
              <IconSend className="h-5 w-5" />
            </button>
          </div>
        </div>
        {statusText ? (
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
            <span aria-live="polite">{statusText}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Composer;
