# Microphone Audio Level Indicator

Real-time microphone audio-level monitoring using the Web Audio API. This feature provides visual feedback of microphone input levels with support for multiple display variants.

## Overview

The mic level indicator system consists of:

1. **Audio Engine** (`MicLevelEngine`) - Web Audio API-based real-time audio analysis
2. **React Hook** (`useMicLevel`) - State management for permissions, devices, and audio levels
3. **UI Components** - `MicLevelIndicator` and `MicDeviceSelector`
4. **Feature Flag** - `FEATURE_MIC_LEVEL` for safe rollout

## How It Works

### Level Calculation

The system calculates audio levels using the following process:

1. **Capture**: Audio is captured via `getUserMedia()` and processed through an `AnalyserNode`
2. **RMS Calculation**: Root Mean Square (RMS) is computed from time-domain audio samples
3. **dB Conversion**: RMS values are converted to decibels (dBFS):
   ```
   dB = 20 × log₁₀(RMS)
   ```
4. **Normalization**: dB values are mapped to 0..1 range for visual display
5. **Smoothing**: Exponential moving average (EMA) reduces visual jitter
6. **Peak Tracking**: Peak values are tracked with gradual decay for "comet tail" effect

### Performance

- Updates at ~60 FPS using `requestAnimationFrame`
- FFT size: 1024 samples
- Minimal CPU usage (<1% on modern devices)
- No audio data leaves the browser (privacy-safe)

## Browser Support

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome 89+ | ✅ Full | Recommended |
| Edge 89+ | ✅ Full | Chromium-based |
| Firefox 88+ | ✅ Full | Works well |
| Safari 16.4+ | ⚠️ Partial | Requires user gesture; may suspend in background |
| iOS Safari 16.4+ | ⚠️ Partial | User gesture required; background limitations |

### Requirements

- **HTTPS or localhost** - `getUserMedia()` requires secure context
- **User gesture** - Initial mic access must be triggered by user interaction (especially iOS)
- **Permissions** - Microphone permission must be granted

## API Reference

### `useMicLevel()` Hook

React hook for managing microphone level monitoring.

#### Returns

```typescript
{
  isActive: boolean;           // Whether mic is currently active
  hasPermission: boolean | null; // Permission state (null = unknown)
  level: number;              // Current audio level (0..1)
  db: number;                 // Current level in dB (~-100..0)
  peak: number;               // Peak level with decay (0..1)
  error?: string;             // Error message if any
  devices: MediaDeviceInfo[]; // Available audio input devices
  selectedDeviceId?: string;  // Currently selected device ID
  start: (deviceId?: string) => Promise<void>; // Start monitoring
  stop: () => Promise<void>;  // Stop monitoring
  selectDevice: (deviceId?: string) => Promise<void>; // Switch device
}
```

#### Example Usage

```typescript
import { useMicLevel } from '../hooks/useMicLevel';

function MyComponent() {
  const mic = useMicLevel();

  const handleStart = async () => {
    await mic.start(); // Must be called from user gesture
  };

  return (
    <div>
      <button onClick={mic.isActive ? mic.stop : handleStart}>
        {mic.isActive ? 'Stop' : 'Start'} Mic
      </button>
      {mic.error && <div>{mic.error}</div>}
      <div>Level: {(mic.level * 100).toFixed(0)}%</div>
    </div>
  );
}
```

### `<MicLevelIndicator />` Component

Visual indicator for microphone audio levels.

#### Props

```typescript
{
  level: number;              // Current level (0..1) - required
  peak?: number;              // Peak level (0..1)
  db?: number;                // dB value for display
  variant?: "bar" | "ring" | "wave"; // Display style (default: "bar")
  size?: number;              // Size in pixels for ring/wave (default: 28)
  showDb?: boolean;           // Show dB readout (default: false)
  ariaLabel?: string;         // Accessibility label
  className?: string;         // Additional CSS classes
}
```

#### Variants

**Bar (default)**
```tsx
<MicLevelIndicator
  level={mic.level}
  peak={mic.peak}
  variant="bar"
  showDb
/>
```

**Ring**
```tsx
<MicLevelIndicator
  level={mic.level}
  peak={mic.peak}
  variant="ring"
  size={32}
/>
```

### `<MicDeviceSelector />` Component

Dropdown for selecting microphone input device.

#### Props

```typescript
{
  devices: MediaDeviceInfo[];     // Available devices
  selectedDeviceId?: string;      // Currently selected device
  onChange: (deviceId?: string) => void; // Device change callback
  disabled?: boolean;             // Disable selector
  className?: string;             // Additional CSS classes
}
```

#### Example

```tsx
<MicDeviceSelector
  devices={mic.devices}
  selectedDeviceId={mic.selectedDeviceId}
  onChange={mic.selectDevice}
  disabled={mic.isActive}
/>
```

## Integration Guide

### Basic Integration

```tsx
import { useMicLevel } from '../hooks/useMicLevel';
import { MicLevelIndicator } from '../components/MicLevelIndicator';
import { FEATURE_MIC_LEVEL } from '../config/flags';

function VoiceInput() {
  const mic = useMicLevel();

  return (
    <div>
      <button onClick={mic.isActive ? mic.stop : () => mic.start()}>
        {mic.isActive ? 'Stop' : 'Start'}
      </button>

      {FEATURE_MIC_LEVEL && mic.isActive && (
        <MicLevelIndicator
          level={mic.level}
          peak={mic.peak}
          db={mic.db}
          variant="bar"
          showDb
        />
      )}
    </div>
  );
}
```

### Integration with Existing Voice UI

The mic level indicator is already integrated into the `Composer` component. When `FEATURE_MIC_LEVEL` is enabled, the indicator appears automatically when the microphone is active.

## Troubleshooting

### No Audio Devices Found

**Symptoms**: Empty device list or "No devices" message

**Solutions**:
- Ensure microphone is physically connected
- Check system permissions for browser to access microphone
- Device labels only appear after permission is granted
- Try refreshing the page after granting permission

### Permission Denied

**Symptoms**: Error message about microphone permission

**Solutions**:
- Click the microphone icon in browser address bar to manage permissions
- Clear site permissions and retry
- On iOS, check Settings → Safari → Microphone
- Ensure HTTPS or localhost (HTTP won't work)

### No Movement in Indicator

**Symptoms**: Indicator appears but doesn't move

**Solutions**:
1. Check system microphone isn't muted
2. Test microphone in system settings
3. Try selecting a different device
4. AGC (Automatic Gain Control) may stabilize audio - this is normal
5. Speak louder or adjust microphone input level

### Indicator Freezes/Stutters

**Symptoms**: Choppy or frozen animation

**Solutions**:
- Check browser tab isn't throttled (background tabs may be throttled)
- Close other high-CPU applications
- Try disabling browser extensions
- Update graphics drivers
- Use Chrome/Edge for best performance

### iOS Safari Issues

**Symptoms**: Works on desktop but not iOS

**Solutions**:
- Ensure mic start is triggered by user tap (not programmatic)
- App may suspend when backgrounded - this is expected
- Reload page if returning from background
- Test on iOS 16.4+ (earlier versions unsupported)

### AudioContext Suspended

**Symptoms**: "AudioContext suspended" error

**Solutions**:
- This is expected on iOS - `AudioContext` must be resumed via user gesture
- The `MicLevelEngine` automatically resumes when `start()` is called
- Ensure `start()` is called from a click/tap handler

## Performance Considerations

### Memory

- Each active `MicLevelEngine` uses ~2-4 MB
- `AudioContext` is reused across sessions (suspended when inactive)
- Tracks are properly stopped to free resources

### CPU

- ~0.5-1% CPU usage on modern devices
- Uses `requestAnimationFrame` for efficient rendering
- No heavy array allocations in render loop

### Battery (Mobile)

- Minimal impact when in foreground
- iOS may suspend when app is backgrounded
- Stop mic when not in use to conserve battery

## Security & Privacy

### Privacy-Safe Design

- **No audio upload**: All processing happens locally in browser
- **No recording**: Only real-time analysis, no audio storage
- **User control**: Clear start/stop controls
- **Visual feedback**: Always visible when mic is active

### Best Practices

1. Always show clear visual indicator when mic is active
2. Provide easy stop/mute controls
3. Explain why mic access is needed
4. Handle permission denial gracefully
5. Test on all target browsers/devices

## Feature Flag

The mic level indicator is controlled by the `FEATURE_MIC_LEVEL` flag in `src/config/flags.ts`:

```typescript
export const FEATURE_MIC_LEVEL = true;
```

Set to `false` to disable the feature entirely (components won't render).

## Testing

### Unit Tests

Run unit tests for audio math utilities:

```bash
npm run test:unit
```

Tests cover:
- RMS to dB conversion
- dB to unit normalization
- Clamp function
- Round-trip conversions

### E2E Tests

Run Cypress E2E tests:

```bash
npm run e2e:ci
```

Tests cover:
- Mic start with synthetic audio
- Level indicator rendering
- Peak indicator decay
- Permission denial handling
- Device selection

### Manual Testing Checklist

- [ ] Mic level shows within 150ms of starting
- [ ] Silent room: bar near 0, dB ≤ -80
- [ ] Clap/speak loudly: bar near 1, dB > -10
- [ ] Works on Chrome, Firefox, Safari (desktop)
- [ ] Works on iOS Safari 16.4+
- [ ] Permission denial shows error, no crash
- [ ] Stopping mic clears tracks (no memory leak)
- [ ] Tab switching doesn't break indicator
- [ ] Device switching works without restart

## Changelog

### v1.0.0 - Initial Release

- ✅ Web Audio API engine with RMS → dB → normalized level
- ✅ React hook with device management
- ✅ Bar and ring indicator variants
- ✅ Peak tracking with decay
- ✅ Device selector component
- ✅ Integration with Composer
- ✅ Unit and E2E tests
- ✅ Feature flag for rollout
- ✅ Comprehensive documentation

## Future Enhancements

Potential improvements for future versions:

- [ ] Wave visualization variant
- [ ] Frequency spectrum display
- [ ] Noise gate threshold control
- [ ] Configurable smoothing/sensitivity
- [ ] Recording level calibration UI
- [ ] Visual clipping indicator
- [ ] VU meter style variant
- [ ] Accessibility: screen reader announcements for level changes

## Support

For issues or questions:
- File a bug report in the project issue tracker
- Check existing documentation in `/docs`
- Review test cases for usage examples

## References

- [MDN: Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MDN: MediaDevices.getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [MDN: AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode)
- [W3C: Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)
