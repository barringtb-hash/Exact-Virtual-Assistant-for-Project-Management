import {
  type KeyboardEventHandler,
  useEffect,
  useRef,
  useState,
} from "react";
import { MicLevelEngine } from "../audio/micLevelEngine.ts";

type MicButtonProps = {
  isActive: boolean;
  onToggle: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
  engine?: MicLevelEngine | null;
  deviceId?: string;
  blocked?: boolean;
};

const BLOCKED_TITLE = "Microphone blocked";

export default function MicButton({
  isActive,
  onToggle,
  disabled,
  title = "Microphone",
  engine,
  deviceId,
  blocked: blockedProp,
}: MicButtonProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MicLevelEngine | null>(null);
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(blocked);
  const [optimisticPressed, setOptimisticPressed] = useState(false);
  const keyActivationGuard = useRef(false);

  useEffect(() => {
    if (engine) {
      engineRef.current = engine;
    }
  }, [engine]);

  useEffect(() => {
    if (blockedProp !== undefined) {
      setBlocked(blockedProp);
      blockedRef.current = blockedProp;
      if (btnRef.current) {
        btnRef.current.dataset.blocked = blockedProp ? "true" : "false";
      }
    }
  }, [blockedProp]);

  const handleClick = async () => {
    if (disabled) return;

    const targetPressed = !isActive;
    setOptimisticPressed(targetPressed);

    if (!isActive && blockedProp === undefined) {
      try {
        if (!engineRef.current) engineRef.current = engine ?? new MicLevelEngine();
        void engineRef.current
          .start(deviceId)
          .then(() => {
            setBlocked(false);
            blockedRef.current = false;
            if (btnRef.current) btnRef.current.dataset.blocked = "false";
          })
          .catch(() => {
            setBlocked(true);
            blockedRef.current = true;
            if (btnRef.current) btnRef.current.dataset.blocked = "true";
            setOptimisticPressed(false);
            engineRef.current?.stop();
            engineRef.current = null;
          });
      } catch {
        setBlocked(true);
        blockedRef.current = true;
        if (btnRef.current) btnRef.current.dataset.blocked = "true";
        setOptimisticPressed(false);
        engineRef.current?.stop();
        engineRef.current = null;
      }
    }

    try {
      void onToggle();
    } catch {
      // ignore
    }
    btnRef.current?.focus();
  };

  const handleKeyDown: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (disabled) return;
    if (
      (event.key === "Enter" || event.key === " " || event.key === "Spacebar") &&
      !keyActivationGuard.current
    ) {
      event.preventDefault();
      event.stopPropagation();
      keyActivationGuard.current = true;
      void handleClick();
    }
  };

  const handleKeyUp: KeyboardEventHandler<HTMLButtonElement> = (event) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      keyActivationGuard.current = false;
    }
  };

  useEffect(() => {
    if (optimisticPressed && isActive) {
      setOptimisticPressed(false);
    }
  }, [isActive, optimisticPressed]);

  useEffect(() => {
    let raf = 0;
    let mounted = true;

    const loop = () => {
      if (!mounted) return;
      if (engineRef.current && meterRef.current && isActive && !blockedRef.current) {
        const level = engineRef.current.getLevel();
        const clamped = Math.max(0.05, level);
        meterRef.current.style.transform = `scaleY(${clamped})`;
        const clip = level > 0.95;
        if (btnRef.current) {
          btnRef.current.dataset.clip = clip ? "true" : "false";
        }
      } else if (meterRef.current) {
        meterRef.current.style.transform = "scaleY(0.05)";
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
        await engineRef.current.start(deviceId);
        if (blockedProp === undefined) {
          setBlocked(false);
          blockedRef.current = false;
          if (btnRef.current) btnRef.current.dataset.blocked = "false";
        }
      } catch (error) {
        engineRef.current?.stop();
        if (blockedProp === undefined) {
          setBlocked(true);
          blockedRef.current = true;
          if (btnRef.current) btnRef.current.dataset.blocked = "true";
        }
        engineRef.current = null;
      }
    };

    ensureEngine().then(() => {
      if (!mounted) return;
      if (isActive && !blockedRef.current) {
        raf = requestAnimationFrame(loop);
      } else if (meterRef.current) {
        meterRef.current.style.transform = "scaleY(0.05)";
      }
    });

    return () => {
      mounted = false;
      cancelAnimationFrame(raf);
      engineRef.current?.stop();
    };
  }, [engine, isActive, deviceId, blockedProp]);

  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  useEffect(() => {
    if (btnRef.current) {
      btnRef.current.dataset.clip = "false";
    }
  }, [blocked]);

  const pressed = !blocked && (isActive || optimisticPressed);

  return (
    <div className="mic-button-wrapper">
      <button
        ref={btnRef}
        type="button"
        className="mic-button"
        aria-pressed={pressed}
        aria-label={blocked ? BLOCKED_TITLE : title}
        title={blocked ? BLOCKED_TITLE : title}
        data-state={pressed ? "listening" : "idle"}
        data-blocked={blocked ? "true" : "false"}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        disabled={disabled}
      >
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
      <div ref={meterRef} className="mic-button__meter" aria-hidden />
    </div>
  );
}
