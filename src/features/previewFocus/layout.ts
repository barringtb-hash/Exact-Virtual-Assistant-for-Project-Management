export interface ChatPanelClassOptions {
  chatIsOverlay: boolean;
  shouldShowPreview: boolean;
}

export interface PreviewPanelClassOptions {
  chatIsOverlay: boolean;
  isPreviewFocus: boolean;
}

export function getChatPanelClass({ chatIsOverlay, shouldShowPreview }: ChatPanelClassOptions): string {
  if (chatIsOverlay) {
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
}: PreviewPanelClassOptions): string {
  if (chatIsOverlay && isPreviewFocus) {
    return "lg:col-span-12";
  }

  return "lg:col-span-4";
}
