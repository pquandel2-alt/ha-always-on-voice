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
- iPhone widget/deep-link guidance for one-tap access
- Native back navigation and an in-panel iOS Shortcut creator
- Bundled HA Voice Control integration icon on Home Assistant 2026.3 and newer
- Automatic recovery after WebSocket interruptions
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

Make sure the URL currently used by the Companion App begins with `https://`.
This includes the internal URL when the phone is connected to the home Wi-Fi.
Nabu Casa, a correctly configured reverse proxy, or another trusted HTTPS
endpoint can provide the secure origin.

Microphone permission must also be enabled for Home Assistant under iOS
**Settings → Privacy & Security → Microphone**.

## Configuration

Pipeline, finished-speaking sensitivity, browser TTS playback, and animation
style are configured on the generated device:

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

Six animation styles are available: **Fluid orb**, **Audio spectrum**,
**Aurora flow**, **Pulse rings**, **Constellation**, and **Minimal**. Changes to
the animation selector are pushed to an open HA Voice Control panel immediately.

Home Assistant 2026.3 and newer loads the bundled integration symbol directly
from `custom_components/ha_always_on_voice/brand/`. On older versions, Home
Assistant may continue to show its generic missing-logo placeholder even though
the integration itself remains functional.

## iPhone widget and shortcuts

The panel settings include **Create Shortcut**, which opens Apple's new-shortcut
editor. On iOS 18 or newer, add the action **Home Assistant → Open Page**, select
**HA Voice Control**, then use the shortcut details to choose **Add to Home Screen**.

The official Home Assistant iOS app also supplies an **Open Page** widget. Add
that widget on the Home Screen or Lock Screen and select **HA Voice Control** as its
page. The panel includes this direct app link as a fallback:

`homeassistant://navigate/ha_always_on_voice?server=default`

The same link can be placed in an iOS Shortcut or on the Home Screen. A custom
integration cannot install its own native iOS widget; the official Companion
App widget is therefore the supported route.

iOS suspends web content and microphone capture when the app is closed or in
the background. HA Voice Control can listen continuously while its panel is open
in the foreground, but cannot provide a system-wide, always-listening wake word
on a locked iPhone.

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

The URL used by the app is insecure. Change both the relevant internal/external
Companion App URL and the browser URL to HTTPS.

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

Version 0.9.3 uses network-first service-worker caching. Reload Home Assistant or
fully close and reopen the Companion App once after upgrading from an older
version.

## Development and tests

The frontend is vanilla JavaScript and CSS. Run the protocol/unit checks with:

```bash
node --test tests/frontend.test.js
```

Restart Home Assistant after backend changes. Frontend asset versions are set in
`custom_components/ha_always_on_voice/__init__.py` and
`www/ha-voice-panel.js`.

## License

MIT
