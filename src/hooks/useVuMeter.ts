import { MutableRefObject, useEffect } from 'react';

type VuMeterParams = {
  targetRef: MutableRefObject<HTMLElement | null>;
  stream?: MediaStream | null;
  enabled?: boolean;
};

type AudioContextConstructor = {
  new (): AudioContext;
};

const getAudioContextConstructor = (): AudioContextConstructor | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.AudioContext || (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
};

export const useVuMeter = ({ targetRef, stream, enabled }: VuMeterParams): void => {
  useEffect(() => {
    const element = targetRef.current;

    if (!element) {
      return undefined;
    }

    if (!enabled || !stream) {
      element.style.setProperty('--vu', '0');
      return undefined;
    }

    const AudioContextCtor = getAudioContextConstructor();

    if (!AudioContextCtor) {
      element.style.setProperty('--vu', '0');
      return undefined;
    }

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;

    let frameId: number | null = null;

    try {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      const update = () => {
        analyser.getFloatTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i += 1) {
          const value = dataArray[i];
          sum += value * value;
        }

        const rms = Math.sqrt(sum / bufferLength) || 0;
        const level = Number.isFinite(rms) ? Math.min(1, rms) : 0;
        element.style.setProperty('--vu', level.toString());

        frameId = window.requestAnimationFrame(update);
      };

      frameId = window.requestAnimationFrame(update);

      return () => {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
        }

        source.disconnect();
        analyser.disconnect();
        audioContext.close().catch(() => undefined);
        element.style.setProperty('--vu', '0');
      };
    } catch (error) {
      element.style.setProperty('--vu', '0');
      audioContext.close().catch(() => undefined);
      return undefined;
    }
  }, [enabled, stream, targetRef]);
};

export default useVuMeter;
