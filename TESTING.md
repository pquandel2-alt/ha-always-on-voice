# Testing Guide

## Automated checks

From the repository root:

```bash
node --test tests/frontend.test.js
```

The tests cover PCM conversion, Home Assistant binary-handler framing, stream
termination, VAD-based response persistence, TTS playback completion, and
device-supplied UI configuration. It also verifies automatic microphone startup
and the iPhone-voice fallback for a Home Assistant TTS HTTP 500 response, plus
panel back navigation.

Regression coverage for the 1.2.1 connection fixes: reconnects back off
exponentially and reset after a success, the WebSocket keepalive closes a socket
that stops answering pings, and the panel can start again after Home Assistant
re-attaches it.

Regression coverage for the 1.2.2 redirect fix: an immediate second HTTPS switch
is suppressed, a later one is not, and a stale 1.2.1 flag does not block the
switch after upgrading. The 1.2.1 guard was permanent for the whole browsing
session, which left the panel stuck on the insecure origin showing
"Mikrofonzugriff benötigt HTTPS" every time it was reopened.

Regression coverage for the 1.3.0 fixes: the `voiceschanged` listener registered
against the page-lifetime `speechSynthesis` singleton is removed in `destroy()`
instead of leaking one listener per panel re-attach, and a stray event after
destroy is a no-op. Concurrent calls into the pipeline connect path (from
`activate()` and `_reconnect()` racing each other) are merged into a single
in-flight socket instead of each overwriting `this.pipeline`. `strings.json`
and `translations/en.json` are asserted to stay byte-identical, since HA loads
the latter at runtime but hassfest only validates the former.

Before committing, also validate syntax and whitespace:

```bash
for file in custom_components/ha_always_on_voice/www/app/*.js \
  custom_components/ha_always_on_voice/www/ha-voice-panel.js tests/*.js; do
  node --check "$file"
done
git diff --check
```

Backend checks, from the repository root:

```bash
pip install -r requirements_test.txt
pytest tests/
```

`test_config_flow.py` covers the single-instance config flow, and
`test_websocket_api.py` covers the `sample_rate` bound that keeps
`audioop.ratecv` from turning a 4 KB browser chunk into a ~65 MB upsample.

## HTTPS Repairs issue (1.3.0)

The panel cannot capture a microphone over plain `http://` no matter how it is
configured, since browsers only expose `navigator.mediaDevices` on secure
origins. Since 1.3.0 this is surfaced persistently under **Settings ->
Repairs** instead of only failing silently the moment the panel is opened.

1. Under **Settings -> System -> Network**, set `Internal URL` to an
   `http://` address and clear `External URL`, then restart Home Assistant.
2. Confirm a warning titled "HA Voice Control needs an HTTPS address" appears
   under **Settings -> Repairs**.
3. Set an HTTPS `External URL` (or restore Nabu Casa remote access) without
   restarting.
4. Confirm the Repairs entry disappears immediately -- it listens for network
   config changes rather than only re-evaluating on the next restart.

This is a read-only configuration change; no production trigger or sensor is
touched.

## iPhone / Companion App regression test

Prerequisites:

- The URL currently used by the Companion App starts with `https://`.
- Microphone access is enabled for the Home Assistant app in iOS settings.
- A working Assist pipeline is selected on the HA Voice Control device.

### First launch

1. Open **HA Voice Control** from the sidebar.
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
   multiplying WebSocket connections. This also exercises the 1.3.0 fix for a
   race between a manual retry and the automatic reconnect: exactly one
   "Neu verbinden" state should ever be visible at a time, never two competing
   sockets that leave the panel looking connected but unresponsive.

### Background and foreground

1. Put the Companion App in the background and return.
2. Confirm the microphone and animation pause in the background and listening
   resumes automatically after returning.
3. Locking the screen is expected to suspend browser audio; background listening
   is not supported by iOS web content.

### Settings sheet

1. Open the settings button in the upper-right corner.
2. Run **Systemcheck starten** and verify microphone, connection, pipeline,
   STT, TTS, and audio results appear.
3. Change pipeline, VAD, animation, and voice output directly in the sheet and
   verify the device selectors update.
4. Select **Liquid Equalizer** and confirm it is turquoise while idle, deforms
   in blue from live speech, and pulses violet during voice output.
5. Change the browser voice, volume, and speech rate and confirm the next spoken
   response uses those settings.
6. Verify the iPhone quick-access note recommends the official Home Assistant
   **Open Page** widget and no duplicate shortcut button is shown.
7. Close the sheet with the × button and verify the main UI remains correctly
   sized in portrait and landscape orientation.
8. Tap the upper-left back button and confirm the previous Home Assistant page
   opens.

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
3. Confirm the new frontend is displayed. Version 0.7 and newer use a
   network-first service-worker cache to avoid pinning stale JavaScript.
