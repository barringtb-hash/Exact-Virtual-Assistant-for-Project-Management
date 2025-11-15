# Voice charter flow

The assistant processes voice input from both manual recordings and realtime streams through a single transcript handler. Final transcripts update the chat or composer in the same way as typed input and, when charter extraction is available, trigger the charter voice extractor.

## Final transcript handling

- Manual recordings append the recognized text to the composer draft and keep any existing content intact.
- Streaming transcripts append a new user message in the chat history so guided workflows and background extraction observe the same input stream.
- The handler keeps the 20 most recent utterances in the voice transcript store for downstream tools and only triggers charter extraction when the active document session supports it.

## Guided charter sessions

Guided sessions no longer lock the composer. The assistant marks the input as busy only while a guided API request is pending. During that time the send button and mic controls are disabled, but the text area remains editable so the user can continue drafting a response. When the guided backend responds, the busy state is cleared automatically.

Voice-driven field extraction still runs in guided mode, but the app only applies updates to the field that is currently in focus or empty fields. Confirmed answers from earlier steps remain untouched.

## Voice capability fallbacks

Voice input now performs capability checks before starting a recording. If the browser lacks `navigator.mediaDevices`, `MediaRecorder`, WebRTC support, or a secure context, the app displays a warning toast explaining why voice cannot start and suggests using the text composer instead. The mic button immediately returns to the idle state after the failure.
