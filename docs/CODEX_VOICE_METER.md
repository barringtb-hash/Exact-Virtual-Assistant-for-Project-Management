# Voice Meter UI – Codex Implementation Plan

> **Epic**: Voice Meter for User Trust & Conversation Readiness
> **Status**: Scaffolding Complete (Dec 2024)
> **Owner**: [Your Team]

---

## Executive Summary

This document defines the implementation roadmap for the **Voice Meter UI** – a single mic control that doubles as a conversation-readiness indicator. The component consolidates mic state, streaming state, and audio level feedback into one intuitive control with no backend coupling required.

### Goals

1. **Single source of truth**: One button communicates "Is mic armed?", "Are we streaming?", "Am I clipping?"
2. **Trust through transparency**: Visual feedback (ring states, pulse animation, peak indicator) builds user confidence
3. **Zero layout shift**: All state changes use transforms/shadows, not layout-affecting properties
4. **Accessibility-first**: ARIA, keyboard navigation, reduced-motion support

### Components Delivered

- ✅ `MicButton.tsx` – Core UI component with state machine (idle/live/listening/peak)
- ✅ `useMicButton.ts` – React hook integrating `useMicLevel` + `voiceStore`
- ✅ `MicController.tsx` – Reference integration component
- ✅ Tailwind animation config – `voice-pulse` keyframes

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      MicController                          │
│  (Integration layer - wires mic + ASR + UI)                 │
└──────────┬────────────────────────────────┬─────────────────┘
           │                                │
           ▼                                ▼
    ┌─────────────┐                  ┌──────────────┐
    │ MicButton   │◄─────────────────┤ useMicButton │
    │  Component  │                  │     Hook     │
    └─────────────┘                  └──────┬───────┘
           │                                │
           │                                ├─► useMicLevel (audio analysis)
           │                                │
           │                                └─► voiceStore (streaming state)
           ▼
    Visual States:
    • idle      → static button
    • live      → green ring + glow
    • listening → green ring + pulse
    • peak      → red ring (transient)
```

### Data Flow

1. **Audio Input** → `MicLevelEngine` → RMS/dB/peak calculations @ 60 FPS
2. **Level Data** → `useMicLevel` hook → React state updates
3. **Voice Stream** → `voiceStore` → "idle" | "listening" | "transcribing"
4. **Unified State** → `useMicButton` → derives `isMicOn` + `isStreaming`
5. **Visual Output** → `MicButton` → state machine renders UI

---

## Technical Specifications

### State Machine

```typescript
type MicUIState = "idle" | "live" | "listening" | "peak";

Base State Logic:
  - idle:      mic off, no streaming
  - live:      mic on, NOT streaming → green ring + glow
  - listening: mic on, IS streaming  → green ring + pulse
  - peak:      transient state (100-200ms) when level ≥ 0.9 → red ring

Transitions:
  idle → live:      user clicks, mic.start() succeeds
  live → listening: voiceStore.status → "listening"
  * → peak:         level ≥ peakThreshold → show peak → decay to prior state
  listening → live: voiceStore.status → "idle"
  live → idle:      user clicks, mic.stop()
```

### Visual Specs

| State     | Ring                 | Shadow                               | Animation | Meter    |
|-----------|----------------------|--------------------------------------|-----------|----------|
| idle      | none                 | none                                 | none      | hidden   |
| live      | 2px green @ 70% α    | `0 0 20px rgba(16,185,129,0.35)`     | none      | visible  |
| listening | 2px green @ 100% α   | expanding ring (0→12px, 1.3s loop)   | pulse     | visible  |
| peak      | 4px red              | none                                 | none      | visible  |

**Meter**: Vertical bar (3px wide, 8-44px height) inside button, driven by `level` (0..1)

### Performance Budget

- **Frame rate**: 60 FPS level updates (via `requestAnimationFrame`)
- **Re-renders**: Max 1 per frame (batched state updates in `useMicLevel`)
- **FFT size**: 1024 samples (~21ms latency @ 48kHz)
- **Smoothing**: EMA with α=0.25 for dB, visual transition 75ms
- **Peak hold**: 150ms default (configurable via `peakHoldMs` prop)

### Accessibility

- **Role**: `role="switch"` (not `button`) – semantic toggle
- **State**: `aria-pressed={isMicOn}` – screen readers announce "pressed"/"not pressed"
- **Focus**: `focus-visible:ring-2` – 2px white ring on keyboard focus
- **Motion**: `motion-reduce:animate-none` – disables pulse if user prefers reduced motion
- **Contrast**: Green ring ≥ 3:1 on dark bg; red peak ≥ 4.5:1

---

## Implementation Tickets

### ✅ Ticket 1: Scaffolding & Dependency Audit

**Status**: COMPLETE

**Files Created**:
- `src/components/MicButton.tsx`
- `src/hooks/useMicButton.ts`
- `src/components/MicController.tsx`
- `tailwind.config.js` (extended with `voice-pulse` animation)

**Acceptance Criteria**:
- [x] Project builds with new files (`npm run build`)
- [x] No TypeScript errors
- [x] MicButton renders with mocked props in dev mode

---

### Ticket 2: MicButton Component – Visual States

**Owner**: [Frontend Engineer]
**Priority**: P0
**Estimate**: 3 hours

**Tasks**:
1. Implement state machine logic in `MicButton.tsx`
   - Map `isMicOn` + `isStreaming` → base state (idle/live/listening)
   - Peak detection with `peakThreshold` prop (default 0.9)
   - Peak hold timer with cleanup on unmount
2. Render four visual states via Tailwind classes:
   - `data-state="idle"` → neutral-800 bg
   - `data-state="live"` → green ring + shadow
   - `data-state="listening"` → green ring + `animate-voice-pulse`
   - `data-state="peak"` → red ring (4px)
3. Inner vertical meter:
   - Height driven by `level` prop (0..1 → 8-44px)
   - Smooth transition (`transition-[height] duration-75`)
4. Mic glyph (SVG) with white fill + opacity 0.9

**Acceptance Criteria**:
- [ ] Manual testing shows all four states rendering correctly
- [ ] Pulse animation only active in `listening` state
- [ ] Peak state displays for ~150ms then returns to previous state
- [ ] Meter height updates smoothly without stutter
- [ ] Dark mode: colors remain ≥ 3:1 contrast

**Files**:
- `src/components/MicButton.tsx`

---

### Ticket 3: useMicButton Hook – State Integration

**Owner**: [Frontend Engineer]
**Priority**: P0
**Estimate**: 2 hours

**Tasks**:
1. Create `useMicButton.ts` hook:
   - Call `useMicLevel()` for audio state
   - Call `useVoiceStatus()` for streaming state
   - Derive `isStreaming` from `voiceStatus === "listening" || "transcribing"`
2. Implement `toggle()` function:
   - If mic active: stop mic + call `onStreamStop()` callback
   - If mic inactive: start mic + call `onStreamStart(stream)` callback
3. Return unified interface:
   ```typescript
   {
     isMicOn: boolean;
     isStreaming: boolean;
     level: number;
     db: number;
     peak: number;
     error?: string;
     toggle: () => Promise<void>;
   }
   ```

**Acceptance Criteria**:
- [ ] Hook correctly derives `isStreaming` from voice store
- [ ] `toggle()` starts mic and triggers `onStreamStart` callback
- [ ] `toggle()` stops mic and triggers `onStreamStop` callback
- [ ] Error state from `useMicLevel` is surfaced
- [ ] No memory leaks after 10+ toggle cycles

**Files**:
- `src/hooks/useMicButton.ts`

---

### Ticket 4: MicController Integration Component

**Owner**: [Frontend Engineer]
**Priority**: P1
**Estimate**: 2 hours

**Tasks**:
1. Implement `MicController.tsx`:
   - Wire `useMicButton()` with ASR callbacks
   - Render `<MicButton />` with state props
   - Display status text ("Mic off" / "Mic ready" / "Listening…")
   - Show error messages if mic blocked
2. Placeholder ASR callbacks:
   - `handleStreamStart`: log stream, call `voiceActions.startVoiceStream()`
   - `handleStreamStop`: log stop, call `voiceActions.endVoiceStream()`
3. TODO comments for real ASR integration:
   - WebSocket setup
   - Audio encoding (PCM, Opus, etc.)
   - Chunk transmission

**Acceptance Criteria**:
- [ ] Component renders in dev environment
- [ ] Clicking mic button starts mic + calls `handleStreamStart`
- [ ] Voice store updates to "listening" state
- [ ] Button shows pulse animation when streaming
- [ ] Clicking again stops mic + calls `handleStreamStop`
- [ ] Status text updates correctly for all states

**Files**:
- `src/components/MicController.tsx`

---

### Ticket 5: Tailwind Animation Config

**Owner**: [Frontend Engineer]
**Priority**: P0
**Estimate**: 15 minutes

**Tasks**:
1. ✅ Add `voice-pulse` keyframes to `tailwind.config.js`
2. ✅ Add animation utility class
3. Restart dev server to apply changes
4. Verify animation renders in browser

**Acceptance Criteria**:
- [x] `voice-pulse` animation defined in config
- [ ] Pulse renders smoothly at 1.3s interval
- [ ] Animation respects `prefers-reduced-motion`

**Files**:
- ✅ `tailwind.config.js`

---

### Ticket 6: Accessibility Audit

**Owner**: [Accessibility Lead]
**Priority**: P0
**Estimate**: 2 hours

**Tasks**:
1. Run Axe DevTools on `MicController` in all states
2. Test keyboard navigation:
   - Tab to button
   - Enter/Space to toggle
   - Focus ring visible (not relying on outline)
3. Test screen reader (NVDA/VoiceOver):
   - Announces "Microphone, switch, not pressed"
   - Announces "Microphone, switch, pressed" when active
4. Test `prefers-reduced-motion`:
   - Open DevTools → Rendering → Emulate prefers-reduced-motion
   - Verify pulse animation disabled
5. Test dark mode contrast:
   - Measure green ring: should be ≥ 3:1 on `neutral-800`
   - Measure red peak: should be ≥ 4.5:1

**Acceptance Criteria**:
- [ ] Zero Axe violations
- [ ] Keyboard-only operation works
- [ ] Screen reader announces correct state
- [ ] Pulse animation respects motion preference
- [ ] All color contrasts meet WCAG AA

**Files**:
- `src/components/MicButton.tsx`

---

### Ticket 7: Peak Detection Tuning

**Owner**: [Audio Engineer / Frontend Engineer]
**Priority**: P2
**Estimate**: 1 hour

**Tasks**:
1. Test peak detection with various audio sources:
   - Normal speech
   - Loud speech (near clipping)
   - Background noise
   - Music playback (if applicable)
2. Tune `peakThreshold` prop (default 0.9):
   - Too low → false positives
   - Too high → misses actual clipping
3. Tune `peakHoldMs` (default 150ms):
   - Too short → flicker
   - Too long → feels unresponsive
4. Add hysteresis if needed (e.g., require drop below 0.8 before next peak)

**Acceptance Criteria**:
- [ ] Peak indicator triggers reliably when user speaks loudly
- [ ] No false positives during normal conversation
- [ ] Peak hold duration feels natural (not flickering, not sluggish)
- [ ] No thrashing between peak and listening states

**Files**:
- `src/components/MicButton.tsx`

---

### Ticket 8: ASR Integration (Real Pipeline)

**Owner**: [Backend/Full-Stack Engineer]
**Priority**: P0
**Estimate**: 4-8 hours (varies by stack)

**Tasks**:
1. Replace placeholder `handleStreamStart` in `MicController.tsx`:
   - Set up WebSocket connection to ASR backend (or use SDK)
   - Configure audio encoder (PCM16, Opus, etc.)
   - Pipe `MediaStream` to encoder → chunks to backend
   - Update `voiceStore` status to "listening"
2. Replace placeholder `handleStreamStop`:
   - Close WebSocket
   - Stop encoder
   - Update `voiceStore` status to "idle"
3. Wire transcription results:
   - Receive interim/final transcripts from backend
   - Call `voiceActions.appendTranscript(text)`
   - Display in UI (if applicable)
4. Error handling:
   - Network failures → show error message
   - ASR service errors → gracefully degrade
   - Mic permission errors → already handled by `useMicLevel`

**Acceptance Criteria**:
- [ ] Clicking mic starts real ASR stream
- [ ] Transcription results appear in UI
- [ ] Stopping mic cleanly tears down connection
- [ ] Network errors show user-friendly messages
- [ ] No memory leaks after multiple sessions

**Files**:
- `src/components/MicController.tsx` (or new service layer file)
- `src/state/voiceStore.ts` (may need new actions)

---

### Ticket 9: Storybook Stories

**Owner**: [Frontend Engineer]
**Priority**: P1
**Estimate**: 1 hour

**Tasks**:
1. Create `MicButton.stories.tsx`:
   - Story: "Idle" (isMicOn=false, isStreaming=false, level=0)
   - Story: "Live" (isMicOn=true, isStreaming=false, level=0.3)
   - Story: "Listening" (isMicOn=true, isStreaming=true, level=0.5)
   - Story: "Peak" (isMicOn=true, isStreaming=true, level=0.95)
   - Interactive story with level slider (0..1)
2. Create `MicController.stories.tsx`:
   - Story: Full integration with mocked ASR callbacks

**Acceptance Criteria**:
- [ ] All stories render without errors
- [ ] Interactive story allows designers to adjust level in real-time
- [ ] Designers/PM can sign off on visual states

**Files**:
- `src/components/MicButton.stories.tsx`
- `src/components/MicController.stories.tsx`

---

### Ticket 10: Unit Tests

**Owner**: [Frontend Engineer]
**Priority**: P1
**Estimate**: 2 hours

**Tasks**:
1. Test `useMicButton` hook:
   - Mock `useMicLevel` and `useVoiceStatus`
   - Test `toggle()` calls `mic.start()` when inactive
   - Test `toggle()` calls `mic.stop()` when active
   - Test `isStreaming` derived from voice status
2. Test `MicButton` component:
   - Test state machine transitions (idle → live → listening → peak)
   - Test peak hold timer (peak → previous state after 150ms)
   - Test meter height calculation (level=0 → 8px, level=1 → 44px)
3. Test accessibility:
   - `aria-pressed` reflects `isMicOn`
   - `role="switch"` present

**Acceptance Criteria**:
- [ ] All tests pass in CI
- [ ] Coverage ≥ 80% for new components/hooks

**Files**:
- `tests/hooks/useMicButton.test.ts`
- `tests/components/MicButton.test.tsx`

---

### Ticket 11: Telemetry & Analytics

**Owner**: [Product Engineer]
**Priority**: P2
**Estimate**: 1 hour

**Tasks**:
1. Emit events for user actions:
   - `mic_toggled` → { action: "start" | "stop", deviceId?: string }
   - `stream_start` → { streamId: string }
   - `stream_stop` → { streamId: string, duration: number }
   - `peak_detected` → sampled at max 1/10s to avoid spam
2. Add to analytics dashboard:
   - Total mic toggles per session
   - Average session duration
   - Peak detection frequency (indicator of clipping issues)

**Acceptance Criteria**:
- [ ] Events visible in analytics tool (Mixpanel, Amplitude, etc.)
- [ ] Event properties include relevant metadata
- [ ] No PII in event payloads

**Files**:
- `src/hooks/useMicButton.ts`
- `src/components/MicController.tsx`

---

### Ticket 12: Feature Flag Rollout

**Owner**: [Product Manager]
**Priority**: P0
**Estimate**: 30 minutes

**Tasks**:
1. Add new feature flag to `src/config/flags.ts`:
   ```typescript
   export const FEATURE_VOICE_METER_UI = false; // Start disabled
   ```
2. Conditionally render `MicController` vs old mic UI:
   ```tsx
   {FEATURE_VOICE_METER_UI ? <MicController /> : <OldMicUI />}
   ```
3. Rollout plan:
   - Internal team: 100% (1 week)
   - Beta users: 50% (1 week)
   - All users: 100% (if no issues)

**Acceptance Criteria**:
- [ ] Flag off → old UI renders
- [ ] Flag on → new Voice Meter UI renders
- [ ] No console errors when switching flag

**Files**:
- `src/config/flags.ts`
- (Parent component where mic UI is rendered)

---

### Ticket 13: Performance Testing

**Owner**: [Performance Engineer]
**Priority**: P2
**Estimate**: 2 hours

**Tasks**:
1. Profile `useMicLevel` level updates:
   - Open Chrome DevTools → Performance
   - Record 30s of mic activity
   - Verify ≤ 16ms/frame (60 FPS budget)
2. Profile React re-renders:
   - Use React DevTools Profiler
   - Ensure `MicButton` only re-renders when state changes
   - Check for unnecessary parent re-renders
3. Test on low-end devices:
   - Simulate CPU throttling (4x slowdown)
   - Verify animations remain smooth
4. Memory leak check:
   - Toggle mic 20x
   - Take heap snapshot
   - Verify no growing detached DOM nodes

**Acceptance Criteria**:
- [ ] Level updates ≤ 16ms per frame on modern devices
- [ ] No frame drops during pulse animation
- [ ] No memory leaks after 20 toggle cycles
- [ ] Smooth on low-end devices (iPhone SE, budget Android)

**Files**:
- N/A (profiling existing code)

---

### Ticket 14: Documentation

**Owner**: [Technical Writer / Frontend Engineer]
**Priority**: P1
**Estimate**: 2 hours

**Tasks**:
1. Update `docs/audio-mic-level.md`:
   - Add section for Voice Meter UI
   - Document state machine
   - Add usage examples
2. Add JSDoc to new files:
   - `MicButton.tsx` → document props, state machine
   - `useMicButton.ts` → document hook API, callbacks
   - `MicController.tsx` → document integration pattern
3. Create migration guide:
   - How to replace old mic UI with Voice Meter
   - ASR integration checklist

**Acceptance Criteria**:
- [ ] Documentation is clear and accurate
- [ ] Code examples run without modification
- [ ] New engineers can integrate Voice Meter without assistance

**Files**:
- `docs/audio-mic-level.md`
- `docs/voice-meter-migration.md`
- JSDoc in source files

---

### Ticket 15: Smoke Tests (E2E)

**Owner**: [QA Engineer]
**Priority**: P1
**Estimate**: 2 hours

**Tasks**:
1. Create Playwright test for full flow:
   - Navigate to page with `MicController`
   - Click mic button
   - Allow mic permissions (if needed)
   - Verify button shows "live" state (green ring)
   - Simulate streaming start (mock voice store update)
   - Verify button shows "listening" state (pulse)
   - Click button to stop
   - Verify button returns to "idle" state
2. Test error states:
   - Deny mic permissions → verify error message
   - Disconnect audio device mid-session → verify graceful fallback

**Acceptance Criteria**:
- [ ] E2E test passes in CI
- [ ] Test covers all four states (idle/live/listening/peak)
- [ ] Error states handled gracefully

**Files**:
- `tests/e2e/voice-meter.spec.ts`

---

## Success Metrics

### Qualitative

- [ ] Designers sign off on visual states in Storybook
- [ ] PM approves state machine logic
- [ ] Accessibility audit passes (Axe + manual SR testing)
- [ ] Internal team uses Voice Meter for 1 week without issues

### Quantitative

- [ ] Mic toggle success rate ≥ 95% (excluding permission denials)
- [ ] Peak detection false positive rate ≤ 5%
- [ ] Frame rate remains ≥ 55 FPS during streaming on mid-tier devices
- [ ] Zero console errors in production for 1 week post-rollout

---

## Dependencies

### Internal

- `useMicLevel` (existing) – audio level monitoring
- `MicLevelEngine` (existing) – Web Audio API wrapper
- `voiceStore` (existing) – streaming state management
- Tailwind CSS (existing) – styling framework

### External

- Web Audio API – browser support ≥ 97% (caniuse.com)
- `MediaDevices.getUserMedia()` – requires HTTPS (except localhost)
- `requestAnimationFrame` – for 60 FPS updates

### Optional

- ASR backend (WebSocket/REST) – required for real transcription
- Analytics SDK (Mixpanel, Amplitude) – for telemetry

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Safari iOS mic permission quirks | High | Ensure `start()` called on user gesture; test extensively |
| Peak detection false positives | Medium | Tune threshold + add hysteresis; make configurable |
| Animation performance on low-end devices | Medium | Use `prefers-reduced-motion`; profile on budget hardware |
| ASR backend latency affects UX | High | Decouple UI state from backend state; show "listening" immediately |
| Mic device switching mid-session | Low | Already handled by `useMicLevel`; add E2E test |

---

## Rollout Plan

### Phase 1: Internal Testing (Week 1)
- Deploy behind `FEATURE_VOICE_METER_UI` flag (default `true` for team)
- Gather feedback on Slack #voice-ui channel
- Fix critical bugs

### Phase 2: Beta Users (Week 2)
- Enable for 50% of beta users (random split)
- Monitor telemetry for errors, peak detection stats
- A/B test: old mic UI vs Voice Meter (measure engagement)

### Phase 3: General Availability (Week 3)
- Roll out to 100% if no blocking issues
- Remove old mic UI code
- Remove feature flag

---

## Future Enhancements

### Post-V1 (Backlog)

1. **Auto-gain hint**
   - If peak detected >5x/min, show tooltip: "Your mic is too loud. Lower input volume?"
   - Add browser AGC constraint option: `{ audio: { autoGainControl: true } }`

2. **Waveform variant**
   - Replace vertical meter with live waveform (similar to `MicLevelIndicator` wave variant)
   - Requires higher update rate (120 FPS)

3. **Voice activity detection (VAD)**
   - Detect when user starts/stops speaking
   - Auto-trim silence from transcripts
   - Visual feedback when voice detected (e.g., brighter meter)

4. **Multi-language support**
   - `ariaLabel` prop should accept i18n keys
   - Status text in `MicController` should be translatable

5. **Haptic feedback (mobile)**
   - Vibrate on peak detection (if supported)
   - Vibrate on mic toggle

---

## Appendix

### File Manifest

```
src/
├── components/
│   ├── MicButton.tsx            ← Core component (state machine)
│   ├── MicController.tsx        ← Integration component
│   ├── MicLevelIndicator.tsx    ← Existing (bar/ring variants)
│   ├── VoiceCapture.tsx         ← Existing (legacy demo)
│   └── mic-meter.css            ← Existing (bar/ring styles)
├── hooks/
│   ├── useMicButton.ts          ← New hook (mic + voice state)
│   └── useMicLevel.ts           ← Existing (audio analysis)
├── audio/
│   ├── micLevelEngine.ts        ← Existing (Web Audio API)
│   ├── audioMath.ts             ← Existing (RMS/dB utilities)
│   └── audioConstraints.ts      ← Existing (getUserMedia config)
├── state/
│   └── voiceStore.ts            ← Existing (voice status/transcripts)
├── config/
│   └── flags.ts                 ← Feature flags
└── lib/
    └── tinyStore.ts             ← Existing (lightweight Zustand-like store)

tailwind.config.js               ← Extended with voice-pulse animation
docs/
├── audio-mic-level.md           ← Existing (to be updated)
├── CODEX_VOICE_METER.md         ← This document
└── voice-meter-migration.md     ← To be created
```

### Key Constants

```typescript
// Default values (can be overridden via props)
const PEAK_THRESHOLD = 0.9;      // 0..1 RMS level
const PEAK_HOLD_MS = 150;        // milliseconds
const METER_HEIGHT_MIN = 8;      // pixels
const METER_HEIGHT_MAX = 44;     // pixels
const PULSE_DURATION_MS = 1300;  // milliseconds (1.3s)
```

### Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Web Audio API | ✅ 34+ | ✅ 25+ | ✅ 14.1+ | ✅ 79+ |
| getUserMedia | ✅ 53+ | ✅ 36+ | ✅ 11+ | ✅ 79+ |
| requestAnimationFrame | ✅ 24+ | ✅ 23+ | ✅ 6.1+ | ✅ 12+ |
| CSS animations | ✅ 43+ | ✅ 16+ | ✅ 9+ | ✅ 79+ |
| prefers-reduced-motion | ✅ 74+ | ✅ 63+ | ✅ 10.1+ | ✅ 79+ |

**Minimum supported**: Chrome 53, Firefox 36, Safari 11, Edge 79 (all ~2017+)

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2024-12-05 | 0.1.0 | Initial scaffolding complete |

---

## Contact

**Questions?** Reach out in `#voice-ui` or tag `@voice-team`
