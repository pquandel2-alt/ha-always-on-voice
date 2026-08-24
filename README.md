# HA Always-On Voice

Hands-free voice control for Home Assistant — open the app on your iPhone and speak continuously without pressing buttons or wake words.

## Features

- **Always-On Voice**: App opens → immediately listening. No buttons, no wake words.
- **Local Processing**: Uses Home Assistant's Whisper pipeline for speech-to-text (fully private).
- **Audio-Reactive UI**: Organically morphing blob + real-time frequency visualization.
- **PWA Widget**: Install as an icon on your home screen — works like a native app.
- **iOS Optimized**: Full support for iPhone, respects safe areas (notch, home bar).
- **State Machine**: Clean IDLE → LISTENING → VAD_ACTIVE → PROCESSING → SPEAKING → LISTENING lifecycle.

## Requirements

- Home Assistant with Whisper STT configured (Cloud or local add-on)
- HTTPS enabled (required for Microphone API on iOS)
- Modern browser (iOS Safari, Chrome)

## Installation

1. Clone into `custom_components`:
   ```bash
   git clone https://github.com/pquandel2/ha-always-on-voice.git \
     ~/.homeassistant/custom_components/ha_always_on_voice
   ```

2. Restart Home Assistant.

3. Go to **Settings → Devices & Services → Create Integration** and search for "HA Always-On Voice".

4. Open the Voice Assist panel in your sidebar.

## Usage

### Panel (in Home Assistant UI)
- Navigate to the Voice Assist panel
- Speak naturally — transcripts appear in real-time
- After each response, listening resumes automatically

### PWA on iPhone
1. Open Home Assistant in Safari
2. Go to Voice Assist panel
3. Tap **Share** → **Add to Home Screen**
4. App appears as standalone icon
5. Open and start speaking (no browser chrome)

## Architecture

```
iPhone Safari/PWA
  ├─ getUserMedia() → AudioContext 16kHz
  ├─ WebSocket: assist_pipeline/run
  │   ├─ PCM Int16 audio streaming
  │   ├─ STT (Whisper)
  │   ├─ NLU (Conversation Agent)
  │   └─ TTS (Piper/espeak)
  │
  └─ UI State Machine
       IDLE → LISTENING → VAD_ACTIVE → PROCESSING → SPEAKING → LISTENING
```

## Animation System

The central blob reacts to audio in real-time:

- **LISTENING**: Teal pulse, frequency ring active
- **VAD_ACTIVE**: Bright green, intensity burst
- **PROCESSING**: Amber morph, ring blur
- **SPEAKING**: Violet, synchronized to voice output

Powered by Canvas `AnalyserNode` (FFT 128 bins) → 128 radial bars.

## Configuration

No backend config needed. All settings are in the UI:

- **Pipeline Selection**: Choose from available HA pipelines
- **Microphone Test**: Verify audio capture works

## Troubleshooting

### Microphone not working
- Ensure HTTPS is enabled (check browser console)
- Grant microphone permission when prompted
- Test with Settings → Microphone Test button

### No response from Assist
- Verify STT pipeline is configured in Home Assistant
- Check HA logs for pipeline errors
- Ensure default conversation agent is set

### PWA won't install on iPhone
- iOS only supports manual install: Share → Add to Home Screen
- No `beforeinstallprompt` banner (Apple limitation)
- App must be accessed over HTTPS

### Token expiration
- PWA stores token in localStorage
- Log out and reinstall if token becomes invalid

## Development

```bash
# Install dependencies (if any Python)
pip install voluptuous

# Frontend is Vanilla JS (no build step)
# Test changes by modifying files in www/app/

# Restart Home Assistant to reload integration
```

## License

MIT

## Author

pquandel2
