# Testing Guide — HA Always-On Voice

## Prerequisites

- Home Assistant running with HTTPS (localhost:8123 or with Nabu Casa)
- Whisper STT configured (Home Assistant Cloud or local add-on)
- iPhone (iOS 13+) or modern browser with Microphone API support

## Integration Verification

### 1. Installation & Panel Loading

```bash
# Copy to custom_components
cp -r ha-always-on-voice ~/.homeassistant/custom_components/

# Restart Home Assistant
# Settings → Devices & Services → Create Integration
# Search "HA Always-On Voice" → Install
```

**Expected:**
- Integration appears in sidebar as "Voice Assist"
- Panel URL: `http://ha.local:8123/ha_always_on_voice`
- No errors in HA logs

### 2. Panel (Iframe Mode)

1. Open `http://ha.local:8123/ha_always_on_voice` in browser
2. Observe:
   - Teal/green orb + frequency ring in center
   - State indicator: "Initializing..." → "Listening..."
   - Settings button (⚙️) in lower-right
3. Click settings:
   - Pipeline dropdown populated with available pipelines
   - "Test Microphone" button works
4. Speak clearly: "What's the time?"
   - Orb turns green (VAD_ACTIVE)
   - Your transcript appears below animation
   - Orb turns amber (PROCESSING)
   - Assistant response appears above animation
   - Orb turns purple (SPEAKING), frequency ring reacts to TTS audio
   - Auto-restarts to LISTENING

### 3. Direct App URL (Standalone Mode)

1. Open `http://ha.local:8123/ha_voice_app/index.html`
2. **On first load:**
   - No auth token in localStorage
   - App waits 5 seconds for postMessage from panel
   - Shows "Initializing..." then fails
3. **Expected fail behavior:**
   - Error state displayed
   - Auto-recovery attempted after 3 seconds
   - Settings still accessible

### 4. PWA Installation (iOS)

1. Open Home Assistant in Safari on iPhone
2. Navigate to Voice Assist panel
3. Tap **Share** button (arrow up)
4. Tap **Add to Home Screen**
   - App name: "Voice Assist"
   - Icon: HA logo (default)
5. Tap icon to launch
   - Standalone mode (no Safari chrome)
   - First gesture (tap/speech) requests Microphone permission
   - After approval, orb appears + state "Listening..."

### 5. Microphone Permission (iOS)

**First Launch:**
- Settings → Privacy → Microphone → Home Assistant = ON
- Settings → Safari → Advanced → Local File Access = Allow

**First-Time Gesture Lock:**
- AudioContext doesn't activate until after user gesture (tap)
- Tap the screen → Mic activates
- Subsequent audio operations work immediately

### 6. Full E2E Voice Flow

**Test Case: "Turn on the living room light"**

1. Panel open, state = LISTENING
2. Speak clearly into device
3. **VAD Phase (0.5-3s):**
   - Orb: green, frequency ring active
   - State: "Hearing you..."
4. **STT Complete:**
   - Transcript appears: "Turn on the living room light"
   - HA sends to conversation agent
5. **Intent Processing:**
   - Orb: amber, morphing
   - State: "Processing..."
   - HA evaluates intent + calls service
6. **TTS Generation:**
   - HA generates response (Piper/espeak)
7. **Response Playback:**
   - Orb: purple
   - Frequency ring dances to TTS audio
   - State: "Speaking..."
   - Text: "I've turned on the living room light"
8. **Auto-Resume:**
   - TTS finishes
   - 500ms pause
   - Back to LISTENING (green orb, "Listening...")

### 7. Error Handling

**Test Case: Network Timeout**

1. Turn off WiFi mid-conversation
2. Expected:
   - WebSocket disconnects
   - Error state appears
   - State: "Error: ..."
   - Auto-recovery attempt after 3s
   - Reconnect when WiFi available

**Test Case: Invalid Auth Token**

1. Clear localStorage: `localStorage.clear()`
2. Refresh page
3. Expected:
   - "Auth token not received" error after 5s
   - Settings panel still accessible
   - Can manually test microphone

### 8. Settings Panel

1. Click ⚙️ button
2. Panel slides up from bottom
3. Pipeline dropdown:
   - Lists all available HA pipelines
   - Change selection = switches active pipeline
4. Test Microphone:
   - Click → "Testing..."
   - After 2s: "✓ Microphone OK" or "✗ Mic Error"
5. Close button (✕):
   - Slide panel down

### 9. Service Worker & Offline

1. With app running, open DevTools
2. Application → Service Workers → offline
3. Try to use app:
   - Static assets (JS, CSS) load from cache
   - WebSocket/API calls fail (expected)
   - UI remains usable but no voice processing
4. Go back online:
   - Refresh → resumes normal operation

### 10. State Machine Audit

Use browser DevTools to watch state transitions:

```javascript
// In console:
// Add logging to observe state changes
const originalSetState = window.app._setState.bind(window.app);
window.app._setState = function(newState) {
  console.log(`STATE: ${this.state} → ${newState}`);
  originalSetState(newState);
};
```

Expected sequence for successful voice command:
```
STATE: IDLE → LISTENING
STATE: LISTENING → VAD_ACTIVE
STATE: VAD_ACTIVE → PROCESSING
STATE: PROCESSING → SPEAKING
STATE: SPEAKING → LISTENING
```

### 11. Canvas Visualization

1. Open DevTools → Console
2. Check that frequency data is flowing:
```javascript
// Observe analyser output
setInterval(() => {
  const data = window.app.audio.getFrequencyData();
  console.log("Frequency bins:", data.slice(0, 10), "...");
}, 500);
```

Expected:
- In LISTENING: steady low values (background noise)
- In VAD_ACTIVE: spikes (voice frequencies)
- In SPEAKING: dynamic spikes (TTS output)
- Bars render radially around blob

## Regression Tests

After making changes, verify these still work:

- [ ] Panel loads without errors
- [ ] Auth token flows correctly (panel → iframe)
- [ ] Microphone captures audio
- [ ] WebSocket connects to HA
- [ ] STT transcription works
- [ ] Intent processing works
- [ ] TTS plays and analyser visualizes it
- [ ] Settings dropdown works
- [ ] All state transitions occur correctly
- [ ] Auto-recovery from errors works
- [ ] iOS standalone mode works
- [ ] Service Worker caches shell assets

## Known Limitations

- **iOS background**: App must stay in foreground (screen lock pauses audio)
- **Token expiration**: PWA stores token; if it expires, reinstall app
- **Audio context**: Requires gesture on iOS (first tap activates)
- **HTTPS required**: Microphone API blocked on HTTP (except localhost)
- **No push**: No background listening/wake word (browser limitation)

## Debug Logging

Enable verbose logging in console:

```javascript
// Main
const app = new VoiceAssistApp();
window.app = app;  // Global access
app.init();

// Pipeline events
app.pipeline.onSttStart = () => console.log("[STT] Started");
app.pipeline.onSttEnd = (d) => console.log("[STT] End:", d.transcript);
app.pipeline.onTtsEnd = (d) => console.log("[TTS] End:", d.url);
```

## Performance Profiling

Open DevTools → Performance tab:

1. Record
2. Speak a command
3. Stop recording
4. Analyze:
   - Audio capture callback timing (should be ~100ms chunks)
   - WebSocket send frequency
   - Canvas draw frame rate (should be 60fps)
   - State transitions (instantaneous)

## Cleanup / Reset

```bash
# Clear all cached voice data
localStorage.clear();

# Reset app state
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(r => r.unregister());
});

# Reload
location.reload();
```
