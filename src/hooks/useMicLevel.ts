import { useCallback, useEffect, useRef, useState } from "react";

import { levelStreamFactory } from "./levelStreamFactory.ts";

const SMOOTHING_FACTOR = 0.2;

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = (error as { name?: string }).name;
  if (typeof name === "string") {
    return (
      name === "NotAllowedError" ||
      name === "PermissionDeniedError" ||
      name === "SecurityError"
    );
  }

  const message = (error as { message?: string }).message;
  return typeof message === "string" && message.toLowerCase().includes("denied");
}

export interface MicLevelState {
  isMicOn: boolean;
  isBlocked: boolean;
  level: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useMicLevel(): MicLevelState {
  const teardownRef = useRef<(() => void) | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const levelRef = useRef(0);

  const [isMicOn, setIsMicOn] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [level, setLevel] = useState(0);

  const stop = useCallback(async () => {
    const teardown = teardownRef.current;
    teardownRef.current = null;
    if (teardown) {
      try {
        teardown();
      } catch {
        // ignore teardown errors to keep stop idempotent
      }
    }

    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore track stop errors
        }
      }
    }

    levelRef.current = 0;
    setLevel(0);
    setIsMicOn(false);
    setIsBlocked(false);
  }, []);

  const start = useCallback(async () => {
    await stop();
    setIsBlocked(false);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is not supported in this environment");
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (isPermissionError(error)) {
        setIsBlocked(true);
      }
      throw error;
    }

    streamRef.current = stream;
    levelRef.current = 0;
    setLevel(0);

    try {
      const handle = levelStreamFactory.create(stream, (rawLevel) => {
        const clamped = clampLevel(rawLevel);
        const previous = levelRef.current;
        const smoothed = previous + SMOOTHING_FACTOR * (clamped - previous);
        levelRef.current = smoothed;
        setLevel(smoothed);
      });

      teardownRef.current = handle.teardown;
    } catch (error) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore stop errors in failure path
        }
      }
      streamRef.current = null;
      throw error;
    }

    setIsMicOn(true);
  }, [stop]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return {
    isMicOn,
    isBlocked,
    level,
    start,
    stop,
  };
}
