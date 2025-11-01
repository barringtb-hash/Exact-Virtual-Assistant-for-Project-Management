import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import {
  chatActions,
  useComposerDraft,
  useInputLocked,
  useIsAssistantThinking,
  useIsStreaming,
} from "../state/chatStore.ts";
import { useMicStore } from "../state/micStore.ts";
import useVoiceEngine from "../hooks/useVoiceEngine.ts";
import { useVuMeter } from "../hooks/useVuMeter.ts";

import { useDocType } from "../state/docType.js";

export type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

type RtcState = "idle" | "connecting" | "live" | "error";

type VoiceStatus = "ready" | "recording" | "processing" | "error" | "muted";

const voiceStatusLabel = (status: VoiceStatus): string => {
  switch (status) {
    case "recording":
      return "Recording…";
    case "processing":
      return "Processing audio…";
    case "error":
      return "Voice connection error";
    case "muted":
      return "Microphone muted";
    default:
      return "Ready";
  }
};

export interface ComposerProps {
  onSend: () => void;
  onUploadClick: () => void;
  onMicToggle?: () => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  sendDisabled?: boolean;
  uploadDisabled?: boolean;
  micDisabled?: boolean;
  recording?: boolean;
  realtimeEnabled?: boolean;
  rtcState?: RtcState;
  startRealtime?: () => void;
  stopRealtime?: () => void;
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
  onSend,
  onUploadClick,
  onMicToggle,
  onStartRecording,
  onStopRecording,
  sendDisabled = false,
  uploadDisabled = false,
  micDisabled = false,
  recording: recordingOverride,
  realtimeEnabled = false,
  rtcState = "idle",
  startRealtime,
  stopRealtime,
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
  const micButtonRef = useRef<HTMLButtonElement | null>(null);
  const textareaId = useId();
  const { previewDocTypeLabel } = useDocType();
  const draft = useComposerDraft();
  const isAssistantThinking = useIsAssistantThinking();
  const isStreaming = useIsStreaming();
  const inputLocked = useInputLocked();
  const { startListening, stopListening, getStream } = useVoiceEngine();
  const { isMuted, recState, setRecState, toggleMute } = useMicStore(
    (state) => ({
      isMuted: state.isMuted,
      recState: state.recState,
      setRecState: state.setRecState,
      toggleMute: state.toggleMute,
    }),
    shallow
  );
  const externallyControlled = typeof recordingOverride === "boolean";
  const effectiveRecState = externallyControlled
    ? recordingOverride
      ? "recording"
      : "idle"
    : recState;
  const isRecording = effectiveRecState === "recording";
  const isProcessing = effectiveRecState === "processing";
  const showMute = isMuted || isRecording || isProcessing;
  const composerVoiceStatus: VoiceStatus = isMuted
    ? "muted"
    : isProcessing
      ? "processing"
      : isRecording
        ? "recording"
        : "ready";
  const srVoiceLabel = voiceStatusLabel(composerVoiceStatus);
  const srPoliteness: "polite" | "assertive" = isMuted || isRecording || isProcessing ? "assertive" : "polite";
  const micButtonStyle = useMemo(() => ({ ["--vu" as const]: "0" }) as React.CSSProperties, []);
  const micButtonLabel = srVoiceLabel;
  const micButtonTitle = isMuted
    ? "Microphone muted"
    : isRecording
      ? "Stop recording"
      : isProcessing
        ? "Processing audio…"
        : "Start voice input";
  const muteButtonLabel = isMuted ? "Unmute microphone" : "Mute microphone";
  const resolvedSendDisabled =
    sendDisabled || isAssistantThinking || isStreaming || inputLocked;
  const resolvedDraftDisabled = inputLocked;

  useVuMeter({
    targetRef: micButtonRef,
    stream: getStream(),
    enabled: isRecording && !isMuted,
  });

  const adjustTextareaHeight = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [draft, adjustTextareaHeight]);

  useEffect(() => {
    if (!externallyControlled) return;
    const next = recordingOverride ? "recording" : "idle";
    if (recState !== next) {
      setRecState(next);
    }
  }, [externallyControlled, recordingOverride, setRecState]);

  useEffect(() => {
    if (!isMuted || recState !== "recording") {
      return;
    }

    stopListening();
    if (recState !== "idle") setRecState("idle");

    if (onStopRecording) {
      onStopRecording();
    } else if (onMicToggle) {
      onMicToggle();
    }
  }, [isMuted, recState, onMicToggle, onStopRecording, setRecState, stopListening]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key.toLowerCase() !== "m") {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (tagName === "INPUT" || tagName === "TEXTAREA") {
          return;
        }

        if (target.isContentEditable) {
          return;
        }
      }

      event.preventDefault();
      toggleMute();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleMute]);

  const handleStartRecording = useCallback(async () => {
    if (isMuted) {
      return;
    }

    setRecState("processing");

    try {
      await startListening();
      setRecState("recording");
    } catch (error) {
      console.error("Microphone start failed", error);
      setRecState("idle");
      return;
    }

    if (onStartRecording) {
      onStartRecording();
    } else {
      onMicToggle?.();
    }
  }, [isMuted, onMicToggle, onStartRecording, setRecState, startListening]);

  const handleStopRecording = useCallback(() => {
    if (recState === "idle") {
      if (onStopRecording) {
        onStopRecording();
      } else if (onMicToggle) {
        onMicToggle();
      }

      return;
    }

    setRecState("processing");

    try {
      stopListening();
    } catch (error) {
      console.error("Microphone stop failed", error);
    } finally {
      setRecState("idle");
    }

    if (onStopRecording) {
      onStopRecording();
    } else {
      onMicToggle?.();
    }
  }, [onMicToggle, onStopRecording, recState, setRecState, stopListening]);

  const handleMuteToggle = useCallback(() => {
    toggleMute();
  }, [toggleMute]);

  const handleMicClick = useCallback(() => {
    if (micDisabled) {
      return;
    }

    if (isRecording) {
      handleStopRecording();
      return;
    }

    if (isProcessing || isMuted) {
      return;
    }

    void handleStartRecording();
  }, [handleStartRecording, handleStopRecording, isMuted, isProcessing, isRecording, micDisabled]);

  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      chatActions.setComposerDraft(event.target.value);
      adjustTextareaHeight();
    },
    [adjustTextareaHeight]
  );

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (!resolvedSendDisabled) {
          onSend();
        }
      }
    },
    [onSend, resolvedSendDisabled]
  );

  const resolvedPlaceholder = useMemo(() => {
    if (placeholder) return placeholder;
    const label = (previewDocTypeLabel || "document").toLowerCase();
    return `Ask questions or paste details for the ${label}.`;
  }, [placeholder, previewDocTypeLabel]);

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

  const micButtonClasses = isRecording || isProcessing
    ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100/80 dark:bg-red-900 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-800/60"
    : isMuted
      ? "cursor-not-allowed bg-white/60 border-white/50 text-slate-400 hover:bg-white/60 dark:bg-slate-800/60 dark:border-slate-700/50 dark:text-slate-500"
      : "bg-white/80 border-white/60 text-slate-600 hover:bg-white dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-700/60";
  const micVuState = micDisabled || isMuted ? "muted" : isRecording ? "active" : "idle";
  const muteToggleVisible = showMute;
  const [muteRendered, setMuteRendered] = useState(muteToggleVisible);

  useEffect(() => {
    if (muteToggleVisible) {
      setMuteRendered(true);
      return;
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || typeof window === "undefined") {
      setMuteRendered(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setMuteRendered(false);
    }, 220);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [muteToggleVisible]);

  const realtimeVoiceStatus: VoiceStatus = useMemo(() => {
    if (rtcState === "live") return "recording";
    if (rtcState === "connecting") return "processing";
    if (rtcState === "error") return "error";
    return "ready";
  }, [rtcState]);

  const realtimeAriaLabel = useMemo(
    () => voiceStatusLabel(realtimeVoiceStatus),
    [realtimeVoiceStatus]
  );

  const liveVoiceLabel = realtimeEnabled ? realtimeAriaLabel : srVoiceLabel;

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
          placeholder={resolvedPlaceholder}
          disabled={resolvedDraftDisabled}
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
                  aria-label={realtimeAriaLabel}
                >
                  <IconMic className="h-5 w-5" />
                </button>
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
                onClick={handleMicClick}
                disabled={micDisabled}
                ref={micButtonRef}
                data-vu-state={micVuState}
                className={`icon-btn mic shrink-0 rounded-xl border p-2 transition ${
                  micDisabled
                    ? "cursor-not-allowed bg-white/50 text-slate-400 border-white/50 dark:bg-slate-800/40 dark:border-slate-700/50 dark:text-slate-500"
                    : micButtonClasses
                }`}
                style={micButtonStyle}
                title={micButtonTitle}
                aria-label={micButtonLabel}
                aria-pressed={isRecording}
                aria-disabled={micDisabled || (isMuted && !isRecording && !isProcessing)}
              >
                <IconMic className="h-5 w-5" />
              </button>
            )}
            {muteRendered ? (
              <button
                type="button"
                onClick={handleMuteToggle}
                data-test="mute-mic"
                data-visible={muteToggleVisible ? "true" : "false"}
                className={`shrink-0 rounded-xl border px-3 py-1 text-xs font-medium transition ${
                  isMuted
                    ? "bg-red-50 border-red-200 text-red-600 hover:bg-red-100/80 dark:bg-red-900 dark:border-red-700 dark:text-red-200 dark:hover:bg-red-800/60"
                    : "bg-white/80 border-white/60 text-slate-600 hover:bg-white dark:bg-slate-800/70 dark:border-slate-600/60 dark:text-slate-200 dark:hover:bg-slate-700/60"
                } ${
                  muteToggleVisible
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0"
                }`}
                title={muteButtonLabel}
                aria-label={muteButtonLabel}
                aria-pressed={isMuted}
                aria-hidden={muteToggleVisible ? undefined : true}
                tabIndex={muteToggleVisible ? 0 : -1}
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSend}
              disabled={resolvedSendDisabled}
              className={`shrink-0 rounded-xl p-2 shadow-sm transition ${
                resolvedSendDisabled
                  ? "cursor-not-allowed bg-slate-500/70 text-white/80 opacity-60 dark:bg-indigo-300/60 dark:text-slate-200"
                  : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              }`}
              title={resolvedSendDisabled ? "Assistant is responding…" : "Send"}
            >
              <IconSend className="h-5 w-5" />
            </button>
          </div>
        </div>
        <span className="sr-only" aria-live={srPoliteness}>
          {liveVoiceLabel}
        </span>
      </div>
    </div>
  );
};

export default Composer;
