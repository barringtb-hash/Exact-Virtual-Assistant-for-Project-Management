import React, { useCallback, useEffect, useId, useMemo, useRef } from "react";

import {
  chatActions,
  useComposerDraft,
  useInputLocked,
  useIsAssistantThinking,
  useIsStreaming,
} from "../state/chatStore.ts";
import { useVoiceStatus } from "../state/voiceStore.ts";
import { dispatch } from "../sync/syncStore.js";

import { useDocType } from "../state/docType.js";
import { useMicLevel } from "../hooks/useMicLevel.ts";
import { FEATURE_MIC_LEVEL } from "../config/flags.ts";

export type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

type RtcState = "idle" | "connecting" | "live" | "error";

type VoiceStatus = "ready" | "recording" | "processing" | "error";

const voiceStatusLabel = (status: VoiceStatus): string => {
  switch (status) {
    case "recording":
      return "Recording…";
    case "processing":
      return "Processing audio…";
    case "error":
      return "Voice connection error";
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
  stopRealtime?: (options?: { dispatchStop?: boolean }) => void;
  placeholder?: string;
  onDrop?: React.DragEventHandler<HTMLTextAreaElement>;
  onDragOver?: React.DragEventHandler<HTMLTextAreaElement>;
  IconUpload: IconComponent;
  IconMic: IconComponent;
  IconMicMute: IconComponent;
  IconSend: IconComponent;
  children?: React.ReactNode;
}

const rtcStateClasses: Record<RtcState, string> = {
  idle:
    "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700",
  connecting:
    "bg-amber-100 border-amber-300 text-amber-700 animate-pulse dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-300",
  live:
    "bg-emerald-100 border-emerald-300 text-emerald-700 dark:bg-emerald-900/50 dark:border-emerald-700 dark:text-emerald-300",
  error:
    "bg-red-100 border-red-300 text-red-700 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300",
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
  placeholder,
  onDrop,
  onDragOver,
  IconUpload,
  IconMic,
  IconMicMute,
  IconSend,
  children,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaId = useId();
  const { previewDocTypeLabel } = useDocType();
  const draft = useComposerDraft();
  const isAssistantThinking = useIsAssistantThinking();
  const isStreaming = useIsStreaming();
  const inputLocked = useInputLocked();
  const voiceStatus = useVoiceStatus();
  const recording =
    typeof recordingOverride === "boolean" ? recordingOverride : voiceStatus === "listening";
  const resolvedSendDisabled =
    sendDisabled || isAssistantThinking || isStreaming || inputLocked;
  const resolvedDraftDisabled = inputLocked;

  // Mic level monitoring (optional feature)
  const micLevel = FEATURE_MIC_LEVEL ? useMicLevel() : null;

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
      chatActions.setComposerDraft(event.target.value);
      adjustTextareaHeight();
      dispatch("PREVIEW_UPDATED", { source: "text" });
    },
    [adjustTextareaHeight]
  );

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        if (!resolvedSendDisabled) {
          dispatch("TEXT_SUBMIT");
          onSend();
        }
      }
    },
    [onSend, resolvedSendDisabled]
  );

  const handleMicClick = useCallback(async () => {
    if (recording) {
      dispatch("VOICE_STOP");
      if (onStopRecording) {
        onStopRecording();
      }
      if (micLevel) {
        await micLevel.stop();
      }
      if (!onStopRecording) {
        onMicToggle?.();
      }
    } else {
      dispatch("VOICE_START");
      if (onStartRecording) {
        onStartRecording();
      }
      if (micLevel) {
        await micLevel.start(micLevel.selectedDeviceId);
      }
      if (!onStartRecording) {
        onMicToggle?.();
      }
    }
  }, [onMicToggle, onStartRecording, onStopRecording, recording, micLevel]);

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

  const handleRealtimeClick = useCallback(async () => {
    if (rtcState === "live" || rtcState === "connecting") {
      dispatch("VOICE_STOP");
      stopRealtime?.({ dispatchStop: false });
      if (micLevel) {
        await micLevel.stop();
      }
    } else {
      dispatch("VOICE_START");
      startRealtime?.();
      if (micLevel) {
        await micLevel.start(micLevel.selectedDeviceId);
      }
    }
  }, [rtcState, startRealtime, stopRealtime, micLevel]);

  const handleMuteToggle = useCallback(() => {
    if (micLevel) {
      micLevel.toggleMute();
    }
  }, [micLevel]);

  const micButtonClasses = recording
    ? "bg-red-100 border-red-300 text-red-600 hover:bg-red-200 dark:bg-red-900/50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/70"
    : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700";

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

  const recordingAriaLabel = useMemo(
    () => voiceStatusLabel(recording ? "recording" : "ready"),
    [recording]
  );

  const liveVoiceLabel = realtimeEnabled ? realtimeAriaLabel : recordingAriaLabel;

  return (
    <div className="sticky bottom-0 left-0 right-0 z-40" data-testid="composer-root">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all dark:border-slate-700 dark:bg-slate-800 dark:focus-within:ring-indigo-500/30 dark:focus-within:border-indigo-500">
        <label htmlFor={textareaId} className="sr-only">
          Message composer
        </label>
        <textarea
          id={textareaId}
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => dispatch("TEXT_FOCUS")}
          onDrop={onDrop}
          onDragOver={onDragOver}
          placeholder={resolvedPlaceholder}
          disabled={resolvedDraftDisabled}
          data-testid="composer-input"
          data-legacy-testid="composer-textarea"
          className="w-full min-h-[3.25rem] max-h-40 resize-none overflow-y-auto bg-transparent text-[15px] leading-6 text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {children}
            <button
              type="button"
              onClick={onUploadClick}
              disabled={uploadDisabled}
              className={`shrink-0 rounded-lg border p-2.5 transition-colors ${
                uploadDisabled
                  ? "cursor-not-allowed bg-slate-50 text-slate-300 border-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-600"
                  : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
              title="Attach files"
            >
              <IconUpload className="h-5 w-5" />
            </button>
            {realtimeEnabled ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={handleRealtimeClick}
                  disabled={!startRealtime && !stopRealtime}
                  className={`relative shrink-0 rounded-lg border p-2.5 transition-colors ${rtcStateClasses[rtcState]}`}
                  title={realtimeButtonTitle}
                  aria-label={realtimeAriaLabel}
                  data-testid="mic-button"
                  aria-pressed={rtcState === "live" || rtcState === "connecting"}
                >
                  <IconMic
                    className="h-5 w-5"
                    style={
                      rtcState !== "idle" && micLevel && micLevel.isActive && !micLevel.isMuted
                        ? {
                            transform: `scale(${1 + Math.pow(micLevel.level, 0.6) * 0.3}) translateY(${-Math.pow(micLevel.level, 0.6) * 2}px)`,
                            transition: "transform 60ms ease-out",
                          }
                        : undefined
                    }
                  />
                </button>
                {rtcState !== "idle" && micLevel && (
                  <button
                    type="button"
                    onClick={handleMuteToggle}
                    className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors ${
                      micLevel.isMuted
                        ? "bg-amber-500 border-amber-600 text-white dark:bg-amber-600 dark:border-amber-700"
                        : "bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-600"
                    }`}
                    title={micLevel.isMuted ? "Unmute microphone" : "Mute microphone"}
                    aria-label={micLevel.isMuted ? "Unmute microphone" : "Mute microphone"}
                    aria-pressed={micLevel.isMuted}
                    data-testid="mute-button"
                  >
                    <IconMicMute className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={handleMicClick}
                  disabled={micDisabled}
                  className={`relative shrink-0 rounded-lg border p-2.5 transition-colors ${
                    micDisabled
                      ? "cursor-not-allowed bg-slate-50 text-slate-300 border-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-600"
                      : micButtonClasses
                  }`}
                  title={recording ? "Stop recording" : "Voice input (mock)"}
                  aria-label={recordingAriaLabel}
                  data-testid="mic-button"
                  aria-pressed={recording}
                >
                  <IconMic
                    className="h-5 w-5"
                    style={
                      recording && micLevel && micLevel.isActive && !micLevel.isMuted
                        ? {
                            transform: `scale(${1 + Math.pow(micLevel.level, 0.6) * 0.3}) translateY(${-Math.pow(micLevel.level, 0.6) * 2}px)`,
                            transition: "transform 60ms ease-out",
                          }
                        : undefined
                    }
                  />
                </button>
                {recording && micLevel && (
                  <button
                    type="button"
                    onClick={handleMuteToggle}
                    className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors ${
                      micLevel.isMuted
                        ? "bg-amber-500 border-amber-600 text-white dark:bg-amber-600 dark:border-amber-700"
                        : "bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-600"
                    }`}
                    title={micLevel.isMuted ? "Unmute microphone" : "Mute microphone"}
                    aria-label={micLevel.isMuted ? "Unmute microphone" : "Mute microphone"}
                    aria-pressed={micLevel.isMuted}
                    data-testid="mute-button"
                  >
                    <IconMicMute className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSend}
              disabled={resolvedSendDisabled}
              className={`shrink-0 rounded-lg p-2.5 shadow-sm transition-all ${
                resolvedSendDisabled
                  ? "cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                  : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg dark:bg-indigo-500 dark:hover:bg-indigo-400"
              }`}
              title={resolvedSendDisabled ? "EVA is responding…" : "Send message"}
              data-testid="composer-send"
            >
              <IconSend className="h-5 w-5" />
            </button>
          </div>
        </div>
        <span className="sr-only" aria-live="polite">
          {liveVoiceLabel}
        </span>
      </div>
    </div>
  );
};

export default Composer;
