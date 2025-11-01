let streamRef: MediaStream | null = null;

export const startListening = async (): Promise<MediaStream> => {
  if (streamRef) {
    return streamRef;
  }

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Audio capture is not supported in this environment");
  }

  streamRef = await navigator.mediaDevices.getUserMedia({ audio: true });
  return streamRef;
};

export const stopListening = (): void => {
  if (!streamRef) {
    return;
  }

  streamRef.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch (error) {
      console.error("Error stopping media track", error);
    }
  });

  streamRef = null;
};

export const getStream = (): MediaStream | null => streamRef;
