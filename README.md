# HA Voice Control

Hands-free voice control for Home Assistant. Open the HA Voice Control panel,
activate the microphone once, and speak without pressing a button for every
command or using a wake word.

## Features

- Automatic microphone start and continuous listening while the panel stays
  open and in the foreground
- Local Home Assistant Assist pipeline, including Whisper, conversation agent,
  and TTS
- Assist Satellite device with pipeline, VAD, TTS playback, and animation configuration
- Audio-reactive interface designed for the Home Assistant iOS app
- Persistent response text that remains visible until the next spoken request
- Automatic iPhone system-voice fallback if Home Assistant TTS fails
- Direct in-panel controls for pipeline, VAD, animation, and voice output
- Configurable browser voice, volume, and speech rate
- One-tap microphone pause, background power saving, and haptic feedback
- System diagnostics and STT, response, and TTS latency measurements
- Official Home Assistant iPhone widget guidance for one-tap access
- Native back navigation
- Bundled HA Voice Control integration icon on Home Assistant 2026.3 and newer
- Automatic recovery after WebSocket interruptions, with a ping/pong keepalive
  that stops router NAT timeouts from silently killing the connection
- Automatic switch from an insecure internal URL to Home Assistant's configured
  HTTPS URL, performed before the app boots and repeated whenever the panel is
  reopened on the insecure origin
- Faster action start through smaller audio chunks and local end-of-speech
  detection matched to the selected VAD sensitivity
- No frontend build step

## Requirements

- Home Assistant 2024.10 or newer
- A configured Assist pipeline with STT and, optionally, TTS
- A current Home Assistant Companion App or modern browser
- **HTTPS for the Home Assistant URL used by the device**

The official Assist dialog may use native microphone support inside the
Companion App. This custom web panel uses the browser media API, which Apple
only exposes to secure web contexts. An internal `http://` Home Assistant URL
therefore cannot capture audio even if the native Assist dialog can.

If no HTTPS URL is reachable, the integration raises a persistent warning
under **Settings -> Repairs** ("HA Voice Control needs an HTTPS address")
instead of only failing silently once the panel is opened. It clears itself
automatically once an HTTPS URL is configured.

## Installation

1. Install the repository through HACS as a custom integration, or copy
   `custom_components/ha_always_on_voice` into the Home Assistant config
   directory.
2. Restart Home Assistant.
3. Open **Settings → Devices & services → Add integration** and select
   **HA Voice Control**.
4. Open **HA Voice Control** from the sidebar.
5. The panel starts the microphone automatically. If iOS requires a user
   gesture, tap **Microphone starten** once.

## Home Assistant app setup

Configure at least one valid Home Assistant URL beginning with `https://`.
This can be the external Nabu Casa URL, a correctly configured reverse proxy,
or a secure internal endpoint. If the Companion App opens the panel through an
internal `http://` URL on home Wi-Fi, HA Voice Control automatically reopens the
same panel through Home Assistant's configured HTTPS URL.

Microphone permission must also be enabled for Home Assistant under iOS
**Settings → Privacy & Security → Microphone**.

## Configuration

Pipeline, finished-speaking sensitivity, browser TTS playback, and animation
style can be configured directly in the panel or on the generated device:

**Settings → Voice assistants → Devices → HA Voice Control**

The TTS provider itself is part of the selected Assist pipeline. The device
page shows the currently selected provider as a diagnostic sensor. Change the
provider under **Settings → Voice assistants → Assistants**, or mute/unmute its
playback with the device's **TTS playback** selector.

The **Voice output** selector offers three modes:

- **From Assist pipeline** uses the configured Home Assistant TTS provider and
  automatically falls back to the iPhone voice if the server returns no audio.
- **iPhone / browser voice** always uses the device's system speech synthesis.
- **Muted** disables spoken responses.

Eight animation styles are available: **Fluid orb**, **Liquid equalizer**,
**Audio spectrum**, **Aurora flow**, **Pulse rings**, **Constellation**, and
**Minimal**, plus the **Particle avatar** shared with the DashVoice tablet app.
The Liquid equalizer uses live microphone frequencies to deform
the fluid surface, changes from turquoise to blue while the user speaks, and
turns violet with a speech-like pulse during voice output. Changes to the
animation selector are pushed to an open HA Voice Control panel immediately.

The end-of-speech setting also controls the local handoff speed. **Aggressive**
uses a 450 ms pause, **Standard** 700 ms, and **Relaxed** 1,000 ms. Smaller PCM
chunks are streamed every 2,048 samples so the Assist pipeline can begin work
sooner. Latency after the intent starts still depends on the configured STT,
conversation agent, Home Assistant host, and target device.

The panel also lets each phone choose its browser voice, output volume, and
speech rate. These three settings are stored locally on that device. The system
check reports microphone permission, WebSocket connection, pipeline, STT, TTS,
audio readiness, and the most recent processing times.

Home Assistant 2026.3 and newer loads the bundled integration symbol directly
from `custom_components/ha_always_on_voice/brand/`. On older versions, Home
Assistant may continue to show its generic missing-logo placeholder even though
the integration itself remains functional.

## iPhone widget

Use the official Home Assistant **Open Page** widget on the Home Screen or Lock
Screen and select **HA Voice Control** as its page. This is the direct supported
route and does not require an additional shortcut or a duplicate open button in
the panel. A custom integration cannot install its own native iOS widget.

iOS suspends web content and microphone capture when the app is closed or in
the background. HA Voice Control pauses its microphone and animation when the
panel moves to the background and resumes on return. It can listen continuously
while its panel is open in the foreground, but cannot provide a system-wide,
always-listening wake word on a locked iPhone.

## Architecture

The custom panel renders directly in a Shadow DOM inside the Home Assistant
frontend. It intentionally does not use an iframe, because iOS WebViews can
restrict media capture in subframes.

Audio is captured with Web Audio, converted to signed 16-bit mono PCM, and sent
through the custom `ha_always_on_voice/run` WebSocket command. Every binary
message is prefixed with the handler ID allocated by Home Assistant. The backend
routes the stream through the Assist Satellite entity so the device's pipeline
and VAD settings are respected.

## Troubleshooting

### “Mikrofonzugriff benötigt HTTPS”

The URL used by the app is insecure. The app switches to the configured HTTPS
Home Assistant URL before the interface boots. A second switch within 15 seconds
is suppressed, because that only happens when the HTTPS origin bounces straight
back; reopening the panel later always switches again. If the message remains,
Home Assistant has no HTTPS URL to switch to — configure a valid external or
internal HTTPS URL (Nabu Casa, a tunnel, or your own certificate) and set it in
the Companion App. Browsers only grant microphone access on HTTPS or localhost,
so an `http://192.168.x.x:8123` address can never record, regardless of app
settings.

The most reliable fix is to avoid the switch entirely: set the Companion App's
internal URL to the same HTTPS URL it uses externally, or clear the internal URL
so the external one is always used.

### Microphone permission was denied

Enable Home Assistant microphone access in iOS settings, close the panel, open
it again, and tap **Mikrofon starten**.

### No transcript or response

- Confirm that the HA Voice Control device has a valid pipeline selected.
- Verify Whisper/STT using Home Assistant's built-in Assist dialog.
- Check the Home Assistant log for `ha_always_on_voice` or pipeline errors.

### Text appears but there is no speech

- Confirm that the selected Assist pipeline has a TTS provider configured.
- Check the device's **TTS playback** selector is set to **Use pipeline**.
- Open the panel settings: it displays the resolved TTS provider or an exact
  playback error.
- The panel attempts to start the microphone immediately. If iOS blocks this
  until a user gesture, tap **Microphone starten** once.
- A server response such as `TTS 500` now falls back to the iPhone system voice.
  Home Assistant's log should still be checked to repair the selected provider.

### Old frontend remains visible

Version 1.2.0 uses network-first service-worker caching. Reload Home Assistant or
fully close and reopen the Companion App once after upgrading from an older
version.

## Development and tests

The frontend is vanilla JavaScript and CSS. Run the protocol/unit checks with:

```bash
node --test tests/frontend.test.js
```

The backend config flow and websocket API have a small pytest suite:

```bash
pip install -r requirements_test.txt
pytest tests/
```

Restart Home Assistant after backend changes. Frontend asset versions are set in
`custom_components/ha_always_on_voice/__init__.py` and
`www/ha-voice-panel.js`. See `TESTING.md` for the full manual regression
checklist and details on both suites.

## License

MIT
