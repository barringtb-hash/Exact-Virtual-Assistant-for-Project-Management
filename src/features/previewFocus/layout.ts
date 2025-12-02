export interface ChatPanelClassOptions {
  chatIsOverlay: boolean;
  shouldShowPreview: boolean;
  isVoiceCharterActive?: boolean;
}

export interface PreviewPanelClassOptions {
  chatIsOverlay: boolean;
  isPreviewFocus: boolean;
  isVoiceCharterActive?: boolean;
}

export function getChatPanelClass({ chatIsOverlay, shouldShowPreview, isVoiceCharterActive }: ChatPanelClassOptions): string {
  if (chatIsOverlay) {
    // Voice charter mode: position bottom-left for easier access while focusing on charter fields
    if (isVoiceCharterActive) {
      return "bottom-sheet floating-card voice-charter-overlay";
    }
    return "bottom-sheet floating-card";
  }

  if (shouldShowPreview) {
    return "lg:col-span-8";
  }

  return "lg:col-span-12";
}

export function getPreviewPanelClass({
  chatIsOverlay,
  isPreviewFocus,
  isVoiceCharterActive,
}: PreviewPanelClassOptions): string {
  // Voice charter mode: preview takes full width as main focus
  if (isVoiceCharterActive) {
    return "lg:col-span-12";
  }

  if (chatIsOverlay && isPreviewFocus) {
    return "lg:col-span-12";
  }

  return "lg:col-span-4";
}
