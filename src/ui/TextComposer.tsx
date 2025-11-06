import { useCallback, useEffect, useMemo, useState } from "react";

import { useStore } from "../lib/tinyStore.ts";
import { InputGateway } from "../sync/InputGateway.ts";
import type { InputChannel } from "../sync/InputGateway.ts";
import { syncStoreApi } from "../state/syncStore.ts";
import { useVoiceStatus } from "../state/voiceStore.ts";
import type { NormalizedInputEvent } from "../types/sync.ts";

type TextComposerProps = {
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  onSubmit?: (value: string) => void;
  submitLabel?: string;
};

type VoiceStatus = ReturnType<typeof useVoiceStatus>;

function useTypingDraftValue(): string {
  return useStore(syncStoreApi, (state) => {
    const preview = state.buffers.preview;
    const typingEvents = preview.filter((event) =>
      event.source === "user" && eventMatchesChannel(event, "typing"),
    );
    if (!typingEvents.length) {
      return "";
    }
    return typingEvents[typingEvents.length - 1]?.content ?? "";
  });
}

function useVoicePreviewActive(): boolean {
  return useStore(syncStoreApi, (state) =>
    state.buffers.preview.some(
      (event) => event.source === "user" && eventMatchesChannel(event, "voice"),
    ),
  );
}

function eventMatchesChannel(event: NormalizedInputEvent, channel: InputChannel) {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== "object") {
    return false;
  }
  const candidate = (metadata as { channel?: unknown }).channel;
  return candidate === channel;
}

function isMicActive(status: VoiceStatus) {
  return status === "listening" || status === "transcribing";
}

export function TextComposer({
  className,
  disabled = false,
  placeholder = "Type your update…",
  onSubmit,
  submitLabel = "Send",
}: TextComposerProps) {
  const [localDraft, setLocalDraft] = useState("");
  const storeDraft = useTypingDraftValue();
  const voiceStatus = useVoiceStatus();
  const policy = useStore(syncStoreApi, (state) => state.policy);
  const voicePreviewActive = useVoicePreviewActive();

  useEffect(() => {
    setLocalDraft(storeDraft);
  }, [storeDraft]);

  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = useCallback((event) => {
    const nextValue = event.target.value;
    setLocalDraft(nextValue);
    InputGateway.onTypingChange(nextValue);
  }, []);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = useCallback(
    (event) => {
      event.preventDefault();
      const trimmed = localDraft.trim();
      if (!trimmed) {
        InputGateway.submitFinalInput("typing");
        setLocalDraft("");
        return;
      }
      InputGateway.onTypingSubmit(trimmed);
      setLocalDraft("");
      onSubmit?.(trimmed);
    },
    [localDraft, onSubmit],
  );

  const typingDisabled = disabled || (policy === "exclusive" && isMicActive(voiceStatus));

  const typingPausedPill = useMemo(() => {
    if (!(policy === "exclusive" && isMicActive(voiceStatus))) {
      return null;
    }
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
        Typing paused (mic on)
      </span>
    );
  }, [policy, voiceStatus]);

  const listeningStatus = useMemo(() => {
    if (!voicePreviewActive) {
      return null;
    }
    return <span className="text-xs font-medium text-slate-500">Listening…</span>;
  }, [voicePreviewActive]);

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="flex flex-col gap-2">
        <textarea
          className="min-h-[120px] w-full resize-none rounded-md border border-slate-300 bg-white p-3 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-75"
          placeholder={placeholder}
          disabled={typingDisabled}
          value={localDraft}
          onChange={handleChange}
          data-testid="text-composer-input"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {typingPausedPill}
            {listeningStatus}
          </div>
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={typingDisabled || !localDraft.trim()}
            data-testid="text-composer-submit"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

export default TextComposer;
