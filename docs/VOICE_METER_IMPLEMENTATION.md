# Voice Meter UI – Implementation Guide

> **Quick-start guide** for integrating the Voice Meter UI into your application.
> **See also**: `CODEX_VOICE_METER.md` for detailed project plan.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Component API Reference](#component-api-reference)
4. [Integration Patterns](#integration-patterns)
5. [Styling & Theming](#styling--theming)
6. [Accessibility](#accessibility)
7. [Performance Tips](#performance-tips)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The **Voice Meter UI** provides a single button control that communicates three critical pieces of information:

1. **Is the mic armed?** (idle vs live)
2. **Are we streaming?** (live vs listening)
3. **Am I clipping?** (peak indicator)

### Visual States

| State | What it means | Visual |
|-------|---------------|--------|
| **idle** | Mic is off | Gray button, no ring |
| **live** | Mic is on, ready to stream | Green ring + glow, no pulse |
| **listening** | Actively streaming to ASR/LLM | Green ring + gentle pulse |
| **peak** | Audio level clipping (transient) | Red ring (100-200ms flash) |

---

## Quick Start

### 1. Verify Dependencies

You already have these (from existing audio infrastructure):

- ✅ `useMicLevel` hook → `src/hooks/useMicLevel.ts`
- ✅ `MicLevelEngine` → `src/audio/micLevelEngine.ts`
- ✅ `voiceStore` → `src/state/voiceStore.ts`
- ✅ Tailwind CSS configured

**New dependencies added**:

- ✅ `MicButton` component → `src/components/MicButton.tsx`
- ✅ `useMicButton` hook → `src/hooks/useMicButton.ts`
- ✅ `MicController` reference component → `src/components/MicController.tsx`
- ✅ `voice-pulse` animation → `tailwind.config.js`

### 2. Restart Dev Server

The Tailwind config was updated to add the `voice-pulse` animation:

```bash
npm run dev
```

### 3. Add to Your UI

**Option A: Use the reference controller** (simplest):

```tsx
import { MicController } from "./components/MicController";

export function MyVoiceUI() {
  return (
    <div className="p-4">
      <MicController />
    </div>
  );
}
```

**Option B: Custom integration** (if you already have ASR wiring):

```tsx
import { MicButton } from "./components/MicButton";
import { useMicButton } from "./hooks/useMicButton";
import { voiceActions } from "./state/voiceStore";

export function MyVoiceUI() {
  const handleStreamStart = async (stream: MediaStream) => {
    // Your ASR setup here
    voiceActions.startVoiceStream(crypto.randomUUID());
  };

  const handleStreamStop = async () => {
    // Your ASR teardown here
    voiceActions.endVoiceStream();
  };

  const { isMicOn, isStreaming, level, toggle } = useMicButton(
    handleStreamStart,
    handleStreamStop
  );

  return <MicButton isMicOn={isMicOn} isStreaming={isStreaming} level={level} onToggle={toggle} />;
}
```

---

## Component API Reference

### `<MicButton />`

The core UI component. Renders a single button with state-based styling.

#### Props

```typescript
interface MicButtonProps {
  isMicOn: boolean;          // Is microphone active?
  isStreaming: boolean;      // Is voice stream active?
  level: number;             // Audio level (0..1) from useMicLevel
  onToggle: () => void;      // Callback when button clicked
  className?: string;        // Additional Tailwind classes
  peakThreshold?: number;    // Level at which to show peak state (default: 0.9)
  peakHoldMs?: number;       // How long to show peak state (default: 150)
  ariaLabel?: string;        // Accessible label (default: "Microphone")
}
```

#### Example

```tsx
<MicButton
  isMicOn={true}
  isStreaming={false}
  level={0.45}
  onToggle={() => console.log("Toggled!")}
  peakThreshold={0.85}       // Show peak at 85% instead of 90%
  peakHoldMs={200}           // Hold peak for 200ms
  ariaLabel="Voice input"
/>
```

---

### `useMicButton()`

React hook that combines `useMicLevel` (audio analysis) with `voiceStore` (streaming state).

#### Signature

```typescript
function useMicButton(
  onStreamStart?: (stream: MediaStream) => void | Promise<void>,
  onStreamStop?: () => void | Promise<void>
): UseMicButtonReturn;

interface UseMicButtonReturn {
  isMicOn: boolean;        // Microphone is active
  isStreaming: boolean;    // Voice stream is active (derived from voiceStore)
  level: number;           // Audio level (0..1)
  db: number;              // dB level (-100..0)
  peak: number;            // Peak level (0..1)
  error?: string;          // Error message if mic start failed
  toggle: () => Promise<void>;  // Start/stop mic
}
```

#### Example

```tsx
import { useMicButton } from "./hooks/useMicButton";

const { isMicOn, isStreaming, level, toggle } = useMicButton(
  async (stream) => {
    // Called when mic starts
    console.log("Stream started:", stream);
  },
  async () => {
    // Called when mic stops
    console.log("Stream stopped");
  }
);
```

---

### `<MicController />`

Reference implementation that shows how to wire everything together. **Use this as a template** for your own integration.

#### Features

- ✅ Wires `useMicButton` with `voiceActions`
- ✅ Displays status text ("Mic off" / "Mic ready" / "Listening…")
- ✅ Shows error messages
- ✅ TODO comments for ASR integration

#### Usage

```tsx
import { MicController } from "./components/MicController";

<MicController />
```

---

## Integration Patterns

### Pattern 1: Simple Toggle (No ASR)

Just show mic state and level, no streaming.

```tsx
import { useMicLevel } from "./hooks/useMicLevel";
import { MicButton } from "./components/MicButton";

export function SimpleMic() {
  const mic = useMicLevel();

  return (
    <MicButton
      isMicOn={mic.isActive}
      isStreaming={false}
      level={mic.level}
      onToggle={mic.isActive ? mic.stop : () => mic.start()}
    />
  );
}
```

### Pattern 2: With Voice Store (ASR Integration)

Use `useMicButton` to automatically sync with `voiceStore`.

```tsx
import { useMicButton } from "./hooks/useMicButton";
import { MicButton } from "./components/MicButton";
import { voiceActions } from "./state/voiceStore";

export function VoiceMic() {
  const { isMicOn, isStreaming, level, toggle } = useMicButton(
    async (stream) => {
      // Start your ASR client here
      voiceActions.startVoiceStream(crypto.randomUUID());
    },
    async () => {
      // Stop your ASR client here
      voiceActions.endVoiceStream();
    }
  );

  return <MicButton isMicOn={isMicOn} isStreaming={isStreaming} level={level} onToggle={toggle} />;
}
```

### Pattern 3: Custom State (External Store)

If you're not using `voiceStore`, derive `isStreaming` yourself.

```tsx
import { useMicLevel } from "./hooks/useMicLevel";
import { MicButton } from "./components/MicButton";
import { useMyASRStore } from "./stores/asr";

export function CustomMic() {
  const mic = useMicLevel();
  const asr = useMyASRStore();

  const handleToggle = async () => {
    if (mic.isActive) {
      await asr.stopStreaming();
      await mic.stop();
    } else {
      await mic.start();
      await asr.startStreaming();
    }
  };

  return (
    <MicButton
      isMicOn={mic.isActive}
      isStreaming={asr.isStreaming}  // Your custom state
      level={mic.level}
      onToggle={handleToggle}
    />
  );
}
```

---

## Styling & Theming

### Default Colors

The component uses Tailwind's default color palette:

- **Idle**: `bg-neutral-800` (dark gray)
- **Live ring**: `ring-green-400/70` (green with 70% opacity)
- **Listening ring**: `ring-green-400` (full opacity green)
- **Peak ring**: `ring-red-400` (red)
- **Meter**: `bg-white/90` (white with 90% opacity)

### Dark Mode

Dark mode is automatically supported via Tailwind's `dark:` prefix:

```tsx
// Automatically switches when <html class="dark"> is present
<MicButton ... />
```

Colors remain accessible (≥ 3:1 contrast) in both light and dark modes.

### Custom Colors

Override via `className` prop:

```tsx
<MicButton
  {...props}
  className="
    data-[state=live]:ring-blue-400
    data-[state=listening]:ring-blue-500
    data-[state=peak]:ring-orange-400
  "
/>
```

### Custom Size

The button is fixed at 56px (`h-14 w-14`). To resize:

```tsx
<MicButton
  {...props}
  className="!h-16 !w-16"  // Increase to 64px
/>
```

### Disable Pulse Animation

If you want to keep animations but disable the pulse:

```tsx
<MicButton
  {...props}
  className="!animate-none"
/>
```

---

## Accessibility

### Screen Readers

The component uses semantic HTML:

- `role="switch"` (not `button`) – indicates toggle behavior
- `aria-pressed={isMicOn}` – announces "pressed" / "not pressed"
- `aria-label={ariaLabel}` – customizable label (default: "Microphone")

**Announcement example** (VoiceOver):

```
"Microphone, switch, not pressed"
[user clicks]
"Microphone, switch, pressed"
```

### Keyboard Navigation

- **Tab**: Focus the button
- **Enter** or **Space**: Toggle mic
- **Focus ring**: Visible 2px white ring (not relying on browser default outline)

### Reduced Motion

Users who prefer reduced motion (via OS settings) will not see the pulse animation:

```css
/* Automatically applied via motion-reduce: */
@media (prefers-reduced-motion: reduce) {
  .animate-voice-pulse {
    animation: none !important;
  }
}
```

The button still shows the green ring in "listening" state, just without the pulse.

### Color Contrast

All colors meet WCAG AA standards:

- Green ring on dark bg: ≥ 3:1 contrast
- Red peak ring: ≥ 4.5:1 contrast
- White meter on dark bg: ≥ 7:1 contrast

---

## Performance Tips

### 1. Minimize Re-renders

The `useMicLevel` hook updates at ~60 FPS. To avoid unnecessary parent re-renders:

```tsx
// ✅ Good: Only subscribe to level
const { level } = useMicButton(...);

// ❌ Bad: Destructure all fields (re-renders on every property change)
const allFields = useMicButton(...);
```

### 2. Use `React.memo` for Static Wrappers

If you have a container component that doesn't depend on mic state:

```tsx
const MicWrapper = React.memo(({ children }) => (
  <div className="mic-container">{children}</div>
));
```

### 3. Debounce Peak Detection (if needed)

If you see excessive peak flashing, increase `peakHoldMs`:

```tsx
<MicButton peakHoldMs={300} ... />  // Hold peak for 300ms instead of 150ms
```

### 4. Profile on Low-End Devices

Test on:

- iPhone SE (2020) – weakest modern iOS device
- Budget Android (e.g., Samsung A-series) – common hardware

Ensure animations remain ≥ 55 FPS (some drops are acceptable).

---

## Troubleshooting

### Issue: Button shows "idle" but mic is on

**Cause**: `isMicOn` prop not correctly wired to `useMicLevel().isActive`

**Fix**:

```tsx
const mic = useMicLevel();
<MicButton isMicOn={mic.isActive} ... />
```

---

### Issue: Pulse animation not working

**Possible causes**:

1. Tailwind config not updated
2. Dev server not restarted after config change
3. `isStreaming` prop is `false`

**Fix**:

1. Verify `tailwind.config.js` has `voice-pulse` keyframes
2. Restart dev server: `npm run dev`
3. Check `isStreaming` prop:

```tsx
const voiceStatus = useVoiceStatus();
console.log("Voice status:", voiceStatus); // Should be "listening" or "transcribing"
```

---

### Issue: Peak detection too sensitive / not sensitive enough

**Tune the threshold**:

```tsx
// More sensitive (shows peak at 85% level)
<MicButton peakThreshold={0.85} ... />

// Less sensitive (shows peak at 95% level)
<MicButton peakThreshold={0.95} ... />
```

**Add hysteresis** (in `MicButton.tsx`):

```typescript
// Only trigger peak if level exceeds threshold AND previous was below 0.8
if (ui !== "peak" && level >= peakThreshold && prevLevel < 0.8) {
  setUI("peak");
}
```

---

### Issue: Mic permission denied on iOS

**Cause**: iOS requires `getUserMedia()` to be called in response to a user gesture.

**Fix**: Ensure `mic.start()` is called from an `onClick` handler (not `useEffect`):

```tsx
// ✅ Good: User gesture
<button onClick={() => mic.start()}>Start</button>

// ❌ Bad: Called outside user gesture
useEffect(() => { mic.start(); }, []);
```

---

### Issue: No audio level updates

**Possible causes**:

1. `level` prop is hardcoded to `0`
2. `useMicLevel` not running (mic not started)
3. Browser doesn't support Web Audio API

**Fix**:

1. Check prop wiring:

```tsx
const { level } = useMicButton(...);
console.log("Level:", level); // Should change when you speak
```

2. Verify mic is active:

```tsx
const { isMicOn } = useMicButton(...);
console.log("Mic on:", isMicOn); // Should be true
```

3. Check browser compatibility:
   - Chrome ≥ 53
   - Firefox ≥ 36
   - Safari ≥ 11
   - Edge ≥ 79

---

### Issue: Dark mode colors not working

**Cause**: No `dark` class on root element.

**Fix**: Ensure Tailwind dark mode is enabled:

```tsx
// In your App.tsx or theme provider
<html className={isDarkMode ? "dark" : ""}>
```

---

### Issue: Button not responding to clicks

**Possible causes**:

1. `onToggle` prop not provided
2. Button is disabled (check for `disabled` attribute)
3. Z-index issue (button is behind another element)

**Fix**:

```tsx
// Verify onToggle is wired
<MicButton onToggle={() => console.log("Clicked!")} ... />

// Check for overlapping elements
<MicButton className="relative z-50" ... />
```

---

## Advanced Usage

### Custom Peak Hold Logic

If you want peak to decay gradually instead of a fixed hold:

```tsx
// In your own wrapper component
const [customPeak, setCustomPeak] = useState(0);

useEffect(() => {
  if (level > customPeak) {
    setCustomPeak(level);
  } else {
    // Decay by 0.01 per frame (~60 FPS)
    setCustomPeak(p => Math.max(0, p - 0.01));
  }
}, [level]);

<MicButton level={level} peak={customPeak} ... />
```

### Multiple Mics (Device Switching)

Use `MicDeviceSelector` (existing component) to let users choose input:

```tsx
import { MicDeviceSelector } from "./components/MicDeviceSelector";

const mic = useMicLevel();

<div>
  <MicButton ... />
  <MicDeviceSelector
    devices={mic.devices}
    selectedDeviceId={mic.selectedDeviceId}
    onChange={mic.selectDevice}
    disabled={mic.isActive}
  />
</div>
```

### Testing in Storybook

Create stories for each state:

```tsx
// MicButton.stories.tsx
import { MicButton } from "./MicButton";

export default { title: "Voice/MicButton", component: MicButton };

export const Idle = () => (
  <MicButton isMicOn={false} isStreaming={false} level={0} onToggle={() => {}} />
);

export const Live = () => (
  <MicButton isMicOn={true} isStreaming={false} level={0.3} onToggle={() => {}} />
);

export const Listening = () => (
  <MicButton isMicOn={true} isStreaming={true} level={0.5} onToggle={() => {}} />
);

export const Peak = () => (
  <MicButton isMicOn={true} isStreaming={true} level={0.95} onToggle={() => {}} />
);
```

---

## Migration from Old Mic UI

If you're replacing an existing mic button:

### Before

```tsx
<button onClick={toggleMic}>
  {isMicOn ? "Stop" : "Start"} Mic
</button>
```

### After

```tsx
import { useMicButton } from "./hooks/useMicButton";
import { MicButton } from "./components/MicButton";

const { isMicOn, isStreaming, level, toggle } = useMicButton();
<MicButton isMicOn={isMicOn} isStreaming={isStreaming} level={level} onToggle={toggle} />
```

### Checklist

- [ ] Import `MicButton` and `useMicButton`
- [ ] Replace old button with `<MicButton />`
- [ ] Wire `onToggle` to your existing toggle logic (or use `useMicButton().toggle`)
- [ ] Pass `level` from `useMicLevel()`
- [ ] Derive `isStreaming` from `voiceStore` (or your own state)
- [ ] Remove old button styles (Voice Meter is self-styled)
- [ ] Test all states: idle, live, listening, peak
- [ ] Verify accessibility (screen reader, keyboard)

---

## Examples

### Minimal Example (No ASR)

```tsx
import { useMicLevel } from "./hooks/useMicLevel";
import { MicButton } from "./components/MicButton";

export function MinimalVoiceMeter() {
  const mic = useMicLevel();

  return (
    <MicButton
      isMicOn={mic.isActive}
      isStreaming={false}
      level={mic.level}
      onToggle={mic.isActive ? mic.stop : () => mic.start()}
    />
  );
}
```

### Full Example (With ASR)

```tsx
import { useMicButton } from "./hooks/useMicButton";
import { MicButton } from "./components/MicButton";
import { voiceActions } from "./state/voiceStore";

export function FullVoiceMeter() {
  const { isMicOn, isStreaming, level, error, toggle } = useMicButton(
    async (stream) => {
      // Your ASR setup
      voiceActions.startVoiceStream(crypto.randomUUID());
    },
    async () => {
      // Your ASR teardown
      voiceActions.endVoiceStream();
    }
  );

  return (
    <div>
      <MicButton isMicOn={isMicOn} isStreaming={isStreaming} level={level} onToggle={toggle} />
      {error && <p className="text-red-500">{error}</p>}
    </div>
  );
}
```

---

## Next Steps

1. **Try the reference component**:
   ```tsx
   import { MicController } from "./components/MicController";
   <MicController />
   ```

2. **Test all states**:
   - Click to start mic → see "live" state
   - Simulate streaming (update `voiceStore`) → see "listening" state with pulse
   - Speak loudly → see brief "peak" flash

3. **Integrate with your ASR**:
   - Replace `handleStreamStart` placeholder in `MicController.tsx`
   - Wire to your WebSocket / streaming API
   - Test end-to-end: mic → ASR → transcript

4. **Accessibility audit**:
   - Test with screen reader (NVDA, VoiceOver)
   - Test keyboard navigation (Tab, Enter, Space)
   - Verify reduced-motion support

5. **Performance profiling**:
   - Open Chrome DevTools → Performance
   - Record 30s of mic activity
   - Verify ≤ 16ms per frame

---

## Support

**Questions?** Check these resources:

- **Detailed project plan**: `docs/CODEX_VOICE_METER.md`
- **Existing audio docs**: `docs/audio-mic-level.md`
- **Code examples**: `src/components/MicController.tsx`
- **Slack**: `#voice-ui` channel

**Found a bug?** Open an issue or reach out to `@voice-team`
