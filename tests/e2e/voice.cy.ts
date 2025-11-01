/// <reference types="cypress" />

type VoiceMockOptions = {
  muted?: boolean;
};

const applyVoiceMocks = (win: Window, options: VoiceMockOptions = {}) => {
  if (typeof options.muted === "boolean") {
    win.localStorage.setItem("eva.mic.muted", options.muted ? "true" : "false");
  }

  const mediaStream = {
    getTracks: () => [
      {
        stop: () => {
          /* noop */
        },
      },
    ],
  } as unknown as MediaStream;

  if (!win.navigator.mediaDevices) {
    (win.navigator as unknown as { mediaDevices: MediaDevices }).mediaDevices = {
      getUserMedia: async () => mediaStream,
    } as MediaDevices;
  }

  cy.stub(win.navigator.mediaDevices, "getUserMedia")
    .callsFake(async () => mediaStream)
    .as("getUserMedia");

  class MockRecorder {
    public static isTypeSupported() {
      return true;
    }

    public ondataavailable?: (event: { data: Blob }) => void;

    public onstop?: () => void;

    public readonly stream: MediaStream;

    public readonly mimeType: string;

    constructor(stream: MediaStream) {
      this.stream = stream;
      this.mimeType = "audio/webm";
    }

    start() {
      // no-op for test environment
    }

    stop() {
      this.ondataavailable?.(new Blob(["voice"], { type: this.mimeType }));
      this.onstop?.();
    }
  }

  (MockRecorder as unknown as typeof MediaRecorder).isTypeSupported = MockRecorder.isTypeSupported;
  win.MediaRecorder = MockRecorder as unknown as typeof MediaRecorder;

  class MockAnalyser {
    public fftSize = 2048;

    getFloatTimeDomainData(data: Float32Array) {
      data.fill(0);
    }

    connect() {
      // no-op
    }

    disconnect() {
      // no-op
    }
  }

  class MockSource {
    connect() {
      // no-op
    }

    disconnect() {
      // no-op
    }
  }

  class MockAudioContext {
    createAnalyser() {
      return new MockAnalyser();
    }

    createMediaStreamSource() {
      return new MockSource();
    }

    close() {
      return Promise.resolve();
    }
  }

  win.AudioContext = MockAudioContext as unknown as typeof AudioContext;
  (win as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext =
    MockAudioContext as unknown as typeof AudioContext;
};

const readVuValue = ($button: JQuery<HTMLElement>) => {
  const view = $button[0].ownerDocument.defaultView || window;
  return view.getComputedStyle($button[0]).getPropertyValue("--vu").trim();
};

describe("Composer voice mute controls", () => {
  const micButton = "button.icon-btn.mic";
  const muteButton = '[data-test="mute-mic"]';

  beforeEach(() => {
    cy.intercept("POST", "/api/transcribe", { transcript: "" }).as("transcribe");
  });

  it("only reveals the mute toggle while recording or muted", () => {
    cy.on("window:before:load", (win) => applyVoiceMocks(win, { muted: false }));

    cy.visit("/");
    cy.contains("Chat Assistant").should("be.visible");

    cy.get(muteButton).should("not.exist");

    cy.get('button[title="Start voice input"]').click();
    cy.get('button[title="Stop recording"]').should("exist");

    cy.get(muteButton)
      .should("exist")
      .and("have.attr", "data-visible", "true")
      .and("contain", "Mute");

    cy.get('button[title="Stop recording"]').click();
    cy.wait("@transcribe");

    cy.get(muteButton).should("have.attr", "data-visible", "false");
    cy.get(muteButton).should("not.exist");
  });

  it("persists mute selection across reloads and blocks mic activation when muted", () => {
    cy.on("window:before:load", (win) => applyVoiceMocks(win, { muted: false }));

    cy.visit("/");
    cy.contains("Chat Assistant").should("be.visible");

    cy.get('button[title="Start voice input"]').click();
    cy.get('button[title="Stop recording"]').should("exist");
    cy.get(muteButton).should("have.attr", "data-visible", "true");

    cy.get(muteButton).click();
    cy.wait("@transcribe");

    cy.get(muteButton)
      .should("exist")
      .and("contain", "Unmute")
      .and("have.attr", "data-visible", "true")
      .and("have.attr", "aria-pressed", "true");

    cy.window().then((win) => {
      expect(win.localStorage.getItem("eva.mic.muted")).to.equal("true");
    });

    cy.on("window:before:load", (win) => applyVoiceMocks(win));
    cy.reload();

    cy.contains("Chat Assistant").should("be.visible");

    cy.get(muteButton)
      .should("exist")
      .and("contain", "Unmute")
      .and("have.attr", "data-visible", "true")
      .and("have.attr", "aria-pressed", "true");

    cy.get('button[title="Microphone muted"]').as("mutedMic");
    cy.get("@getUserMedia").its("callCount").should("eq", 0);
    cy.get("@mutedMic").click();
    cy.get("@getUserMedia").its("callCount").should("eq", 0);

    cy.get("@mutedMic")
      .should("have.attr", "aria-disabled", "true")
      .and("have.attr", "aria-pressed", "false");
  });

  it("seeds the mic button VU CSS variable to zero", () => {
    cy.on("window:before:load", (win) => applyVoiceMocks(win, { muted: false }));

    cy.visit("/");
    cy.contains("Chat Assistant").should("be.visible");

    cy.get(micButton).then(($button) => {
      expect(readVuValue($button)).to.equal("0");
    });

    cy.get('button[title="Start voice input"]').click();
    cy.get('button[title="Stop recording"]').then(($button) => {
      expect(readVuValue($button)).to.equal("0");
    });

    cy.get('button[title="Stop recording"]').click();
    cy.wait("@transcribe");

    cy.get(micButton).then(($button) => {
      expect(readVuValue($button)).to.equal("0");
    });
  });
});
