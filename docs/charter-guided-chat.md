# Charter Guided Chat

## Overview
The guided chat replaces the visible wizard by default, asking one charter question at a time while keeping the composer and preview in sync. The toggle lives in the shared feature flag object: `CHARTER_GUIDED_CHAT_ENABLED` defaults to `true`, so the flow is active unless the wizard is explicitly re-enabled. When `CHARTER_WIZARD_VISIBLE` remains `false`, `GUIDED_CHAT_WITHOUT_WIZARD` switches the app into the conversational experience and wires up the guided orchestrator. 【F:src/config/flags.ts†L32-L42】【F:src/App.jsx†L536-L538】【F:src/App.jsx†L1360-L1388】

## Document Analysis Integration

When `DOCUMENT_ANALYSIS_ENABLED=true` (default), the guided charter flow integrates with the LLM-based document analysis system:

### Analysis-Driven Start Flow
1. User uploads a document (e.g., project scope, meeting notes)
2. System automatically analyzes the document via `POST /api/documents/analyze`
3. User sees classification with confidence score and field preview
4. User confirms to start charter creation with pre-populated fields
5. Guided chat continues with remaining fields

### Confirmation UI
The analysis result is presented in a confirmation card showing:
- Document classification (e.g., "Project Scope Document")
- Confidence percentage (e.g., "87% match for Project Charter")
- Preview of extractable fields
- Buttons: **Create Charter**, **Edit First**, **Choose Different Type**

### Confidence-Based Behavior
| Confidence | Guided Chat Behavior |
|------------|---------------------|
| High (>80%) | Show quick confirm with field preview |
| Medium (50-80%) | Present options: Charter, DDP, or other targets |
| Low (<50%) | Ask clarifying questions before starting |

### Fallback: Manual Start
Users can still click **Start Charter** to begin the guided flow without document analysis. This bypasses the analysis phase and collects all fields from scratch.

## Feature flags
Four flags determine which experience you see and whether the background extraction service runs alongside the assistant:

| Flag | Default | Purpose |
| --- | --- | --- |
| `VITE_CHARTER_GUIDED_CHAT_ENABLED` | `true` | Enables the guided charter experience without the legacy wizard UI. 【F:src/config/flags.ts†L77-L88】 |
| `VITE_CHARTER_WIZARD_VISIBLE` | `false` | Opts back into the side-panel wizard when you need the sequential form. 【F:src/config/flags.ts†L77-L88】 |
| `VITE_CHARTER_GUIDED_BACKEND` | `off` | Routes charter validation, rendering, and extraction calls through the dedicated charter backend endpoints when available. 【F:src/config/flags.ts†L77-L88】【F:src/App.jsx†L1821-L1943】【F:src/utils/extractAndPopulate.js†L1-L284】 |
| `VITE_AUTO_EXTRACTION_ENABLED` / `VITE_AUTO_EXTRACT` | `false` | Allows background extraction to run; the guided orchestrator disables it while a session is active. 【F:src/config/flags.ts†L77-L88】【F:config/featureFlags.js†L53-L72】【F:src/App.jsx†L1071-L1089】【F:src/features/charter/guidedOrchestrator.ts†L23-L30】【F:src/features/charter/guidedOrchestrator.ts†L470-L475】 |

When the orchestrator reports an active session, the app clears the inputs it passes to `useBackgroundExtraction`, preventing any automatic updates until the user finishes or exits the guided flow. 【F:src/App.jsx†L1071-L1089】【F:src/features/charter/guidedOrchestrator.ts†L470-L475】

## Starting a session
Click **Start Charter** beneath the chat composer to launch a guided session. The button calls `handleStartGuidedCharter`, which delegates to the orchestrator’s `start()` method. The orchestrator sends an introductory message explaining the available commands and immediately prompts the first field. Each prompt now pairs the field label with a schema-authored question so the PM always sees plain-language guidance such as “Project Title (required). What’s the official name of this project?” before the example and help text. 【F:src/App.jsx†L2611-L2643】【F:src/App.jsx†L3009-L3076】【F:src/features/charter/guidedOrchestrator.ts†L220-L259】【F:src/features/charter/schema.ts†L44-L190】

## Supported commands
The orchestrator intercepts composer input while the session is active and recognizes four explicit commands:

- `skip` — moves to the next field, marking the current one as skipped.
- `back` — returns to the previous field.
- `edit <fieldId>` — jumps to a specific section by field ID or label.
- `review` — summarizes confirmed, skipped, and pending sections.

These commands can be typed manually or triggered with the quick-action chips that appear once the session starts. Each command routes through `extractCommand()` and its corresponding handler. 【F:src/features/charter/guidedOrchestrator.ts†L32-L377】【F:src/App.jsx†L3009-L3076】【F:cypress/e2e/charter_guided_chat.cy.ts†L20-L94】

Typing `done` after a completion summary hands control back to the base chat loop. Once the orchestrator marks every field as complete it stops intercepting messages, so follow-up inputs such as `done` fall through to the normal conversation pipeline and receive a standard assistant acknowledgement. 【F:src/features/charter/guidedOrchestrator.ts†L218-L339】【F:src/features/charter/guidedOrchestrator.ts†L454-L468】

## Validation behaviour
User responses are validated before confirmation. `handleAnswer()` calls `validateField()` for the active schema entry, surfaces error messages from the validator, and only confirms the field once validation succeeds. Required prompts enforce non-empty answers, date fields check for ISO `YYYY-MM-DD` values, and longer text fields respect their `maxLength`. 【F:src/features/charter/guidedOrchestrator.ts†L380-L423】【F:src/features/charter/validate.ts†L1-L70】

## Voice mode
When the user activates voice input (via the microphone button) while the charter UI is active, a prompt appears asking "Would you like to create your charter using voice?" Confirming switches to voice charter mode, which uses the OpenAI Realtime API for a fully conversational experience.

### Voice charter flow
1. **Activation** – Clicking the mic while charter is active triggers `VoiceCharterPrompt`. Confirming initializes `VoiceCharterService` with the charter schema.
2. **Conversation** – The AI asks for each field via speech. The user responds verbally, and transcripts are processed to capture field values.
3. **Navigation** – Voice commands like "go back", "skip", "review", and "done" control navigation without buttons.
4. **Completion** – After all fields are captured, the AI summarizes and asks for confirmation. Saying "done" finalizes the voice charter session.

### Voice UI components
- `VoiceCharterSession` – Voice-only overlay with pulsing mic indicator, speaker icon when AI speaks, progress bar, and captured values preview.
- `VoiceCharterPrompt` – Modal asking whether to use voice mode for charter creation.

### Voice state management
The `voiceCharter` slice (`src/state/slices/voiceCharter.ts`) tracks:
- `mode` – "inactive", "active", or "completed"
- `aiSpeaking` – Whether the AI is currently speaking
- `capturedValues` – Values captured during the voice session

### Realtime API integration
`VoiceCharterService` (`src/voice/VoiceCharterService.ts`) manages the conversation flow:
- Generates system prompts with field context and examples
- Processes transcripts to extract field values
- Sends Realtime API events via `realtimeEvents.ts` helpers
- Tracks current field index and captured values

## Cypress coverage
`npm run e2e:guided` builds the app with the guided chat flags and executes the Cypress suite against the conversational flow. `npm run e2e:wizard` flips the wizard flags back on for regression coverage. Both scripts enable `VITE_CYPRESS_SAFE_MODE` so local storage persistence is disabled during test runs, keeping Cypress' strict test isolation from leaking data between specs. The guided test (`cypress/e2e/charter_guided_chat.cy.ts`) exercises the start flow, validation message, navigation commands, and review summary. 【F:package.json†L9-L23】【F:cypress.config.ts†L8-L15】【F:src/utils/storage.js†L1-L63】【F:cypress/e2e/charter_guided_chat.cy.ts†L1-L115】
