import { useCallback } from "react";

import { asrService } from "../voice/ASRService.ts";
import { useVoiceStatus } from "../state/voiceStore.ts";

type MicButtonProps = {
  className?: string;
  disabled?: boolean;
  startLabel?: string;
  stopLabel?: string;
};

function isMicActive(status: ReturnType<typeof useVoiceStatus>) {
  return status === "listening" || status === "transcribing";
}

export function MicButton({
  className,
  disabled = false,
  startLabel = "Start mic",
  stopLabel = "Stop mic",
}: MicButtonProps) {
  const status = useVoiceStatus();
  const active = isMicActive(status);

  const handleClick = useCallback(() => {
    if (disabled) {
      return;
    }
    if (active) {
      asrService.stop();
    } else {
      asrService.start();
    }
  }, [active, disabled]);

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={active}
      data-testid="mic-button"
    >
      {active ? stopLabel : startLabel}
    </button>
  );
}

export default MicButton;
