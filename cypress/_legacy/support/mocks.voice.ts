interface SpeechChunk {
  transcript: string;
  isFinal?: boolean;
  delayMs?: number;
}

declare global {
  interface Window {
    __mockSpeechRecognition__?: {
      emit(transcript: string, options?: { isFinal?: boolean }): void;
      emitSequence(chunks: SpeechChunk[]): void;
      reset(): void;
    };
  }
}

const truthy = (value: unknown) => {
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  }

  return Boolean(value);
};

const voiceMocksEnabled = (win: Window) => {
  const envValue = Cypress.env("VOICE_E2E");
  if (envValue != null) {
    return truthy(envValue);
  }

  const searchParams = new URLSearchParams(win.location.search);
  return searchParams.get("e2e") === "1";
};

const ensureMediaDevices = (win: Window) => {
  const navigatorWithDevices = win.navigator as Navigator & {
    mediaDevices?: MediaDevices & Record<string, unknown>;
  };

  if (!navigatorWithDevices.mediaDevices) {
    navigatorWithDevices.mediaDevices = {} as MediaDevices & Record<string, unknown>;
  }

  const mediaDevices = navigatorWithDevices.mediaDevices as MediaDevices &
    Record<string, unknown> & {
      addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
      removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
    };

  if (typeof mediaDevices.addEventListener !== "function") {
    mediaDevices.addEventListener = () => undefined;
  }

  if (typeof mediaDevices.removeEventListener !== "function") {
    mediaDevices.removeEventListener = () => undefined;
  }

  if (typeof mediaDevices.enumerateDevices !== "function") {
    mediaDevices.enumerateDevices = async () => [];
  }

  return mediaDevices;
};

const createMockStream = (win: Window): MediaStream => {
  if (typeof win.MediaStream === "function") {
    const stream = new win.MediaStream();
    if (typeof stream.getTracks !== "function") {
      (stream as MediaStream & { getTracks(): MediaStreamTrack[] }).getTracks = () => [];
    }
    return stream;
  }

  return {
    getTracks: () => [],
  } as unknown as MediaStream;
};

const stubUserMedia = (win: Window) => {
  const mediaDevices = ensureMediaDevices(win);
  const existing = mediaDevices.getUserMedia as {
    restore?: () => void;
  } | null;

  if (existing?.restore) {
    existing.restore();
  }

  const stream = createMockStream(win);

  Cypress.sinon
    .stub(mediaDevices, "getUserMedia")
    .callsFake(async () => stream);
};

const createSpeechEvent = (transcript: string, isFinal: boolean) => {
  const alternative = { transcript, confidence: 0.95 };
  const result = Object.assign([alternative], {
    isFinal,
    length: 1,
    item: (index: number) => (index === 0 ? alternative : undefined),
  });
  const results = Object.assign([result], {
    length: 1,
    item: (index: number) => (index === 0 ? result : undefined),
  });

  return {
    type: "result",
    resultIndex: 0,
    results,
  } as const;
};

const invokeListener = (
  listener: EventListenerOrEventListenerObject,
  payload: unknown
) => {
  if (typeof listener === "function") {
    listener(payload as Event);
    return;
  }

  if (listener && typeof listener === "object" && "handleEvent" in listener) {
    (listener as EventListenerObject).handleEvent?.(payload as Event);
  }
};

const installSpeechRecognitionMock = (win: Window) => {
  const activeRecognizers = new Set<MockSpeechRecognition>();

  class MockSpeechRecognition {
    public grammars: unknown = null;
    public lang = "en-US";
    public continuous = true;
    public interimResults = true;
    public maxAlternatives = 1;
    public serviceURI = "";
    public onaudioend?: () => void;
    public onaudiostart?: () => void;
    public onend?: () => void;
    public onerror?: (event: unknown) => void;
    public onnomatch?: (event: unknown) => void;
    public onresult?: (event: unknown) => void;
    public onsoundend?: () => void;
    public onsoundstart?: () => void;
    public onspeechend?: () => void;
    public onspeechstart?: () => void;
    public onstart?: () => void;

    private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
    private active = false;

    start() {
      if (this.active) return;
      this.active = true;
      activeRecognizers.add(this);
      this.onstart?.();
      this.dispatch("start", new win.Event("start"));
    }

    stop() {
      if (!this.active) return;
      this.active = false;
      activeRecognizers.delete(this);
      this.dispatch("end", new win.Event("end"));
      this.onend?.();
    }

    abort() {
      if (!this.active) return;
      this.active = false;
      activeRecognizers.delete(this);
      this.onerror?.({ error: "aborted" });
      this.dispatch("error", { type: "error", error: "aborted" });
      this.onend?.();
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, new Set());
      }
      this.listeners.get(type)!.add(listener);
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      this.listeners.get(type)?.delete(listener);
    }

    dispatchEvent(event: Event) {
      this.dispatch(event.type, event);
      return true;
    }

    emit(transcript: string, isFinal: boolean) {
      if (!this.active) {
        return;
      }
      const event = createSpeechEvent(transcript, isFinal);
      this.onresult?.(event);
      this.dispatch("result", event);
      if (isFinal) {
        this.stop();
      }
    }

    private dispatch(type: string, payload?: unknown) {
      this.listeners.get(type)?.forEach((listener) => {
        try {
          invokeListener(listener, payload);
        } catch (error) {
          console.error("MockSpeechRecognition listener error", error);
        }
      });
    }
  }

  const controller = {
    emit(transcript: string, options?: { isFinal?: boolean }) {
      const isFinal = options?.isFinal ?? false;
      activeRecognizers.forEach((recognizer) => recognizer.emit(transcript, isFinal));
    },
    emitSequence(chunks: SpeechChunk[]) {
      let cumulative = 0;
      chunks.forEach((chunk) => {
        const delay = typeof chunk.delayMs === "number" ? Math.max(chunk.delayMs, 0) : 0;
        cumulative += delay;
        win.setTimeout(() => {
          controller.emit(chunk.transcript, { isFinal: chunk.isFinal ?? false });
        }, cumulative);
      });
    },
    reset() {
      activeRecognizers.clear();
    },
  } satisfies NonNullable<Window["__mockSpeechRecognition__"]>;

  Object.defineProperty(win, "SpeechRecognition", {
    value: MockSpeechRecognition,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(win, "webkitSpeechRecognition", {
    value: MockSpeechRecognition,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(win, "__mockSpeechRecognition__", {
    value: controller,
    configurable: true,
    writable: true,
  });
};

Cypress.on("window:before:load", (win) => {
  if (!voiceMocksEnabled(win)) {
    return;
  }

  stubUserMedia(win);

  const shouldMockSpeech = truthy(Cypress.env("VOICE_USE_MOCK_STT")) || voiceMocksEnabled(win);
  if (shouldMockSpeech) {
    installSpeechRecognitionMock(win);
  }
});

export {};
