# Charter Guided Chat

## Overview
The guided chat replaces the visible wizard by default, asking one charter question at a time while keeping the composer and preview in sync. The toggle lives in the shared feature flag object: `CHARTER_GUIDED_CHAT_ENABLED` defaults to `true`, so the flow is active unless the wizard is explicitly re-enabled. When `CHARTER_WIZARD_VISIBLE` remains `false`, `GUIDED_CHAT_WITHOUT_WIZARD` switches the app into the conversational experience and wires up the guided orchestrator. 【F:src/config/flags.ts†L32-L42】【F:src/App.jsx†L536-L538】【F:src/App.jsx†L1360-L1388】

## Feature flags
Three flags determine which experience you see and whether the background extraction service runs alongside the assistant:

| Flag | Default | Purpose |
| --- | --- | --- |
| `VITE_CHARTER_GUIDED_CHAT_ENABLED` | `true` | Enables the guided charter experience without the legacy wizard UI. 【F:src/config/flags.ts†L32-L38】 |
| `VITE_CHARTER_WIZARD_VISIBLE` | `false` | Opts back into the side-panel wizard when you need the sequential form. 【F:src/config/flags.ts†L38-L41】 |
| `VITE_AUTO_EXTRACTION_ENABLED` / `VITE_AUTO_EXTRACT` | `false` | Allows background extraction to run; the guided orchestrator disables it while a session is active. 【F:src/config/flags.ts†L38-L42】【F:config/featureFlags.js†L53-L72】【F:src/App.jsx†L1071-L1089】【F:src/features/charter/guidedOrchestrator.ts†L23-L30】【F:src/features/charter/guidedOrchestrator.ts†L470-L475】 |

When the orchestrator reports an active session, the app clears the inputs it passes to `useBackgroundExtraction`, preventing any automatic updates until the user finishes or exits the guided flow. 【F:src/App.jsx†L1071-L1089】【F:src/features/charter/guidedOrchestrator.ts†L470-L475】

## Starting a session
Click **Start Charter** beneath the chat composer to launch a guided session. The button calls `handleStartGuidedCharter`, which delegates to the orchestrator’s `start()` method. The orchestrator sends an introductory message explaining the available commands and immediately prompts the first field. 【F:src/App.jsx†L2611-L2643】【F:src/App.jsx†L3009-L3076】【F:src/features/charter/guidedOrchestrator.ts†L435-L440】

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

## Cypress coverage
`npm run e2e:guided` builds the app with the guided chat flags and executes the Cypress suite against the conversational flow. `npm run e2e:wizard` flips the wizard flags back on for regression coverage. The guided test (`cypress/e2e/charter_guided_chat.cy.ts`) exercises the start flow, validation message, navigation commands, and review summary. 【F:package.json†L7-L23】【F:cypress/e2e/charter_guided_chat.cy.ts†L1-L94】
