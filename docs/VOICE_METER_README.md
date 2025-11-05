# Voice Meter UI – Quick Reference

> **One mic button. Three questions answered.**
> Is the mic armed? Are we streaming? Am I clipping?

---

## What You Get

### 🎯 Components

1. **`<MicButton />`** – Core UI component with state machine
   - States: `idle` | `live` | `listening` | `peak`
   - Tailwind-styled, dark mode ready, accessible

2. **`useMicButton()`** – React hook
   - Combines `useMicLevel` (audio) + `voiceStore` (streaming state)
   - Returns unified interface: `{ isMicOn, isStreaming, level, toggle }`

3. **`<MicController />`** – Reference integration
   - Shows how to wire mic + ASR + UI
   - Use as template for your implementation

---

## Quick Start

```tsx
import { MicController } from "./components/MicController";

export function MyApp() {
  return <MicController />;
}
```

**That's it!** You now have a mic button with:
- ✅ Green ring when mic is ready
- ✅ Gentle pulse when streaming
- ✅ Red flash when audio clips
- ✅ Vertical meter showing live audio level

---

## Visual States

| State | Trigger | Visual |
|-------|---------|--------|
| **idle** | Mic off | Gray button |
| **live** | Mic on, not streaming | Green ring + glow |
| **listening** | Streaming to ASR | Green ring + pulse (1.3s) |
| **peak** | Level ≥ 90% | Red ring (150ms flash) |

---

## Architecture

```
MicController
    ├─ useMicButton()
    │    ├─ useMicLevel() ───► Audio analysis (RMS, dB, peak)
    │    └─ voiceStore ───────► Streaming state ("listening")
    └─ MicButton ────────────► Visual states + animations
```

---

## Files

### Implementation
- `src/components/MicButton.tsx` – Core component
- `src/hooks/useMicButton.ts` – State management hook
- `src/components/MicController.tsx` – Reference wiring

### Config
- `tailwind.config.js` – Added `voice-pulse` animation

### Documentation
- `docs/VOICE_METER_IMPLEMENTATION.md` – **Start here** for integration
- `docs/CODEX_VOICE_METER.md` – Detailed project plan & tickets

---

## Integration Checklist

- [ ] Import `MicController` or `MicButton` + `useMicButton`
- [ ] Wire `onStreamStart` callback to your ASR client
- [ ] Wire `onStreamStop` callback to tear down ASR
- [ ] Update `voiceStore` when streaming starts (`voiceActions.startVoiceStream()`)
- [ ] Test all states: idle → live → listening → peak
- [ ] Verify accessibility (screen reader, keyboard, reduced motion)
- [ ] Profile performance (≥ 55 FPS on target devices)

---

## Common Patterns

### Pattern 1: Simple Mic (No Streaming)

```tsx
import { useMicLevel } from "./hooks/useMicLevel";
import { MicButton } from "./components/MicButton";

const mic = useMicLevel();
<MicButton isMicOn={mic.isActive} isStreaming={false} level={mic.level} onToggle={mic.toggle} />
```

### Pattern 2: With Voice Store (ASR)

```tsx
import { useMicButton } from "./hooks/useMicButton";
import { MicButton } from "./components/MicButton";

const { isMicOn, isStreaming, level, toggle } = useMicButton(
  (stream) => { /* start ASR */ },
  () => { /* stop ASR */ }
);
<MicButton isMicOn={isMicOn} isStreaming={isStreaming} level={level} onToggle={toggle} />
```

---

## Props Reference

### `<MicButton />`

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `isMicOn` | `boolean` | ✅ | - | Is microphone active? |
| `isStreaming` | `boolean` | ✅ | - | Is voice stream active? |
| `level` | `number` | ✅ | - | Audio level (0..1) |
| `onToggle` | `() => void` | ✅ | - | Click handler |
| `className` | `string` | ❌ | `""` | Additional CSS classes |
| `peakThreshold` | `number` | ❌ | `0.9` | Peak trigger level (0..1) |
| `peakHoldMs` | `number` | ❌ | `150` | Peak display duration (ms) |
| `ariaLabel` | `string` | ❌ | `"Microphone"` | Screen reader label |

---

## Accessibility

- ✅ **Role**: `role="switch"` (semantic toggle)
- ✅ **State**: `aria-pressed={isMicOn}`
- ✅ **Focus**: Visible 2px ring on keyboard focus
- ✅ **Motion**: Pulse disabled when `prefers-reduced-motion`
- ✅ **Contrast**: Green ≥ 3:1, Red ≥ 4.5:1 on dark backgrounds

---

## Performance

- **Frame rate**: 60 FPS audio level updates (via `requestAnimationFrame`)
- **FFT size**: 1024 samples (~21ms latency @ 48kHz)
- **Smoothing**: EMA with α=0.25 for dB stability
- **Re-renders**: Batched, max 1 per frame

---

## Browser Support

| Browser | Minimum Version | Features |
|---------|----------------|----------|
| Chrome | 53+ (2016) | ✅ Full support |
| Firefox | 36+ (2015) | ✅ Full support |
| Safari | 11+ (2017) | ✅ Full support (requires user gesture on iOS) |
| Edge | 79+ (2020) | ✅ Full support |

---

## Next Steps

1. **Read the implementation guide**: `docs/VOICE_METER_IMPLEMENTATION.md`
2. **Try the demo**: Import `<MicController />` in your app
3. **Customize**: Adjust `peakThreshold`, colors, or add custom logic
4. **Integrate ASR**: Replace placeholder callbacks with your streaming pipeline
5. **Test**: Verify all states, accessibility, and performance

---

## Questions?

- 📖 **Detailed plan**: See `docs/CODEX_VOICE_METER.md`
- 📖 **Audio infrastructure**: See `docs/audio-mic-level.md`
- 💬 **Slack**: `#voice-ui` channel
- 🐛 **Issues**: Tag `@voice-team`

---

**Built on**: Existing `useMicLevel` + `MicLevelEngine` + `voiceStore`
**Zero external dependencies**: Uses Web Audio API + Tailwind CSS
**Fully accessible**: WCAG AA compliant, keyboard navigable, motion-safe
