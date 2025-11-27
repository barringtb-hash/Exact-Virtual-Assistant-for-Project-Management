import { useCallback, useRef, useState } from "react";

import { voiceActions } from "../state/voiceStore.ts";
import { dispatch } from "../sync/syncStore.js";
import type { TranscriptionResponse } from "../types/api.ts";

export interface SpeechInputOptions {
  onTranscript: (transcript: string) => void | Promise<void>;
  onError?: (error: unknown) => void;
}

export interface SpeechInputControls {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  setMuted: (muted: boolean) => void;
  isRecording: boolean;
}

function pickPreferredMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  try {
    if (typeof MediaRecorder.isTypeSupported === "function") {
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        return "audio/webm";
      }
      if (MediaRecorder.isTypeSupported("audio/mp4")) {
        return "audio/mp4";
      }
      if (MediaRecorder.isTypeSupported("audio/m4a")) {
        return "audio/m4a";
      }
      if (MediaRecorder.isTypeSupported("audio/mpeg")) {
        return "audio/mpeg";
      }
    }
  } catch (error) {
    console.warn("MediaRecorder.isTypeSupported failed", error);
  }

  return "";
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch (error) {
      console.error("Failed to stop media track", error);
    }
  }
}

export function useSpeechInput({ onTranscript, onError }: SpeechInputOptions): SpeechInputControls {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const handleError = useCallback(
    (error: unknown) => {
      if (onError) {
        try {
          onError(error);
        } catch (callbackError) {
          console.error("useSpeechInput onError handler threw", callbackError);
        }
      } else {
        console.error("Speech input error", error);
      }
    },
    [onError],
  );

  const resetRecorderState = useCallback(() => {
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      return;
    }

    try {
      recorder.stop();
    } catch (error) {
      handleError(error);
      resetRecorderState();
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      voiceActions.setStatus("idle");
      dispatch("VOICE_STOP");
    }
  }, [handleError, resetRecorderState]);

  const startRecording = useCallback(async () => {
    if (recorderRef.current) {
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      handleError(new Error("Microphone access is not supported in this environment."));
      return;
    }

    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      handleError(error);
      voiceActions.setStatus("idle");
      dispatch("VOICE_STOP");
      return;
    }

    dispatch("VOICE_START");

    const preferredMime = pickPreferredMimeType();
    chunksRef.current = [];

    try {
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;

      const handleDataAvailable = (event: BlobEvent | { data?: Blob }) => {
        const data = (event as BlobEvent).data ?? event.data;
        if (data && data.size > 0) {
          chunksRef.current.push(data);
        }
      };

      const handleStop = async () => {
        if (typeof recorder.removeEventListener === "function") {
          recorder.removeEventListener("dataavailable", handleDataAvailable as EventListener);
          recorder.removeEventListener("stop", handleStop as EventListener);
        } else {
          recorder.ondataavailable = null;
          recorder.onstop = null;
        }
        recorderRef.current = null;
        setIsRecording(false);
        const activeStream = streamRef.current;
        streamRef.current = null;

        const finalize = () => {
          stopMediaStream(activeStream);
          voiceActions.setStatus("idle");
          dispatch("VOICE_STOP");
        };

        const chunks = chunksRef.current.slice();
        chunksRef.current = [];

        if (!chunks.length) {
          finalize();
          return;
        }

        const fallbackMime = recorder.mimeType || preferredMime || "audio/webm";
        const blob = new Blob(chunks, { type: fallbackMime });

        if (!blob || blob.size === 0) {
          finalize();
          return;
        }

        voiceActions.setStatus("transcribing");

        try {
          const formData = new FormData();
          const normalizedMime = (blob.type || "").split(";")[0];
          const extension = normalizedMime.split("/")[1] || "webm";
          formData.append("audio", blob, `speech-input.${extension}`);
          if (normalizedMime) {
            formData.append("mimeType", normalizedMime);
          }

          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          let payload: TranscriptionResponse | null = null;
          try {
            payload = await response.json() as TranscriptionResponse;
          } catch (parseError) {
            payload = null;
          }

          if (!response.ok) {
            const message = payload?.error || `Transcription failed with status ${response.status}`;
            throw new Error(message);
          }

          const transcriptRaw =
            typeof payload?.transcript === "string" && payload.transcript.trim()
              ? payload.transcript
              : typeof payload?.text === "string"
                ? payload.text
                : "";
          const transcript = typeof transcriptRaw === "string" ? transcriptRaw.trim() : "";
          if (transcript) {
            await onTranscript(transcript);
          }
        } catch (error) {
          handleError(error);
        } finally {
          finalize();
        }
      };

      if (typeof recorder.addEventListener === "function") {
        recorder.addEventListener("dataavailable", handleDataAvailable as EventListener);
        recorder.addEventListener("stop", handleStop as EventListener);
      } else {
        recorder.ondataavailable = handleDataAvailable as (event: BlobEvent) => void;
        recorder.onstop = handleStop;
      }

      recorder.start();
      setIsRecording(true);
      voiceActions.setStatus("listening");
    } catch (error) {
      handleError(error);
      stopMediaStream(stream);
      recorderRef.current = null;
      chunksRef.current = [];
      setIsRecording(false);
      dispatch("VOICE_STOP");
      voiceActions.setStatus("idle");
    }
  }, [handleError, onTranscript]);

  const setMuted = useCallback((muted: boolean) => {
    const stream = streamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }, []);

  return {
    startRecording,
    stopRecording,
    setMuted,
    isRecording,
  };
}
