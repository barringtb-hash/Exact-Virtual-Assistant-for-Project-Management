/**
 * Audio constraints and device utilities
 */

export function getSupportedConstraints() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return {};
  return navigator.mediaDevices.getSupportedConstraints?.() ?? {};
}

export function buildAudioConstraints(deviceId?: string): MediaStreamConstraints {
  const supported = getSupportedConstraints();
  // Prefer echo cancellation & noise suppression; disable AGC for more stable meter
  const audio: MediaTrackConstraints = {
    echoCancellation: supported.echoCancellation ? true : undefined,
    noiseSuppression: supported.noiseSuppression ? true : undefined,
    autoGainControl: supported.autoGainControl ? false : undefined,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {})
  };
  return { audio, video: false };
}
