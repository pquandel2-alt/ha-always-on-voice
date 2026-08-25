# Testing Guide

## Automated checks

From the repository root:

```bash
node --test tests/frontend.test.js
```

The tests cover PCM conversion, Home Assistant binary-handler framing, stream
termination, VAD-based response persistence, TTS playback completion, and
device-supplied UI configuration. It also verifies automatic microphone startup
and the iPhone-voice fallback for a Home Assistant TTS HTTP 500 response.

Before committing, also validate syntax and whitespace:

```bash
for file in custom_components/ha_always_on_voice/www/app/*.js \
  custom_components/ha_always_on_voice/www/ha-voice-panel.js tests/*.js; do
  node --check "$file"
done
git diff --check
```

## iPhone / Companion App regression test

Prerequisites:

- The URL currently used by the Companion App starts with `https://`.
- Microphone access is enabled for the Home Assistant app in iOS settings.
- A working Assist pipeline is selected on the Voice Assist device.

### First launch

1. Open **Voice Assist** from the sidebar.
2. Confirm that the new interface fills the panel and immediately attempts to
   activate the microphone.
3. Approve the iOS microphone prompt if shown. Only tap **Mikrofon starten** if
   iOS explicitly blocks activation without a gesture.
4. Confirm the status changes to **Ich höre zu**.

There must be no `navigator.mediaDevices` error. The UI is rendered directly in
the panel's top-level document instead of an iframe.

### Full voice flow

1. Say “Wie spät ist es?”.
2. Confirm the state sequence:
   `LISTENING → HEARING → PROCESSING → SPEAKING → LISTENING`.
3. Confirm that the transcript and response appear.
4. Confirm TTS finishes before listening resumes. The microphone must not
   transcribe the assistant's own response.
5. Leave the panel listening. The last response must remain visible until you
   actually begin speaking again.
6. Repeat with an entity command such as “Schalte das Licht im Wohnzimmer ein”.
7. Temporarily select **iPhone-/Browser-Stimme** on the device and confirm the
   response uses the iPhone system voice.

### Network recovery

1. Disable Wi-Fi while the panel is listening.
2. Confirm a single reconnect countdown is shown.
3. Re-enable networking.
4. Confirm the panel reconnects once and returns to **Ich höre zu** without
   multiplying WebSocket connections.

### Background and foreground

1. Put the Companion App in the background and return.
2. If iOS suspended the audio context, reopen the panel and tap the microphone
   button again.
3. Locking the screen is expected to suspend browser audio; background listening
   is not supported by iOS web content.

### Settings sheet

1. Open the settings button in the lower-right corner.
2. Run **Mikrofon testen**.
3. Verify the selected TTS source and iPhone quick-access instructions appear.
4. Change the device animation selector between Orb, Spectrum, and Minimal,
   begin a new run, and confirm the selected design is rendered.
5. Close the sheet with the × button and verify the main UI remains correctly
   sized in portrait and landscape orientation.

## Home Assistant log checks

During a successful command there should be no messages resembling:

- `Received binary message for non-existing handler`
- `satellite_not_ready`
- repeated WebSocket authentication failures

If audio reaches the pipeline but STT fails, export the Assist pipeline debug
trace and check the selected pipeline, STT provider, sample rate, and VAD events.

## Upgrade regression

After installing a new release:

1. Restart Home Assistant for Python/backend changes.
2. Fully close and reopen the Companion App once.
3. Confirm the new frontend is displayed. Version 0.5 and newer use a
   network-first service-worker cache to avoid pinning stale JavaScript.
