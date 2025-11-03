import { useEffect, useRef, useState } from "react";
import { MicLevelEngine } from "../audio/micLevelEngine.ts";

type MicButtonProps = {
  isActive: boolean;
  onToggle: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
  engine?: MicLevelEngine | null;
};

const BLOCKED_TITLE = "Microphone blocked";

export default function MicButton({
  isActive,
  onToggle,
  disabled,
  title = "Microphone",
  engine,
}: MicButtonProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MicLevelEngine | null>(null);
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(blocked);

  useEffect(() => {
    if (engine) {
      engineRef.current = engine;
    }
  }, [engine]);

  useEffect(() => {
    let raf = 0;
    let mounted = true;

    const loop = () => {
      if (!mounted) return;
      if (engineRef.current && meterRef.current && isActive && !blockedRef.current) {
        const level = engineRef.current.getLevel();
        const clamped = Math.max(0.05, level);
        meterRef.current.style.transform = `translateX(-50%) scaleY(${clamped})`;
        const clip = level > 0.95;
        if (btnRef.current) {
          btnRef.current.dataset.clip = clip ? "true" : "false";
        }
      } else if (meterRef.current) {
        meterRef.current.style.transform = "translateX(-50%) scaleY(0.05)";
        if (btnRef.current) {
          btnRef.current.dataset.clip = "false";
        }
      }
      raf = requestAnimationFrame(loop);
    };

    const ensureEngine = async () => {
      if (!isActive) {
        engineRef.current?.stop();
        return;
      }

      if (!engineRef.current) {
        engineRef.current = engine ?? new MicLevelEngine();
      }

      try {
        await engineRef.current.start();
        setBlocked(false);
      } catch (error) {
        engineRef.current?.stop();
        setBlocked(true);
        engineRef.current = null;
      }
    };

    ensureEngine().then(() => {
      if (!mounted) return;
      if (isActive && !blockedRef.current) {
        raf = requestAnimationFrame(loop);
      } else if (meterRef.current) {
        meterRef.current.style.transform = "translateX(-50%) scaleY(0.05)";
      }
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      engineRef.current?.stop();
    };
  }, [engine, isActive]);

  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  useEffect(() => {
    if (btnRef.current) {
      btnRef.current.dataset.clip = "false";
    }
  }, [blocked]);

  return (
    <button
      ref={btnRef}
      type="button"
      className="mic-button"
      aria-pressed={isActive}
      aria-label={blocked ? BLOCKED_TITLE : title}
      title={blocked ? BLOCKED_TITLE : title}
      data-state={isActive ? "listening" : "idle"}
      data-blocked={blocked ? "true" : "false"}
      onClick={onToggle}
      disabled={disabled}
    >
      <div ref={meterRef} className="mic-button__meter" aria-hidden />
      <svg
        className="mic-button__icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        role="img"
        aria-hidden
      >
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 14 0h-2zM11 19h2v3h-2z" />
      </svg>
    </button>
  );
}
