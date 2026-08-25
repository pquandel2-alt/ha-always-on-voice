const test = require("node:test");
const assert = require("node:assert/strict");

global.WebSocket = { OPEN: 1 };

const { AudioCapture } = require("../custom_components/ha_always_on_voice/www/app/audio.js");
const { HAVoicePipeline } = require("../custom_components/ha_always_on_voice/www/app/ha-ws.js");

test("converts normalized float audio to signed 16-bit PCM", () => {
  const capture = new AudioCapture();
  assert.deepEqual(
    [...capture._float32ToInt16(Float32Array.of(-2, -1, -0.5, 0, 0.5, 1, 2))],
    [-32768, -32768, -16384, 0, 16383, 32767, 32767]
  );
});

test("waits for and applies Home Assistant's binary handler prefix", async () => {
  const sent = [];
  const pipeline = new HAVoicePipeline("https://ha.example", "token");
  pipeline.connected = true;
  pipeline.ws = {
    readyState: WebSocket.OPEN,
    send: (value) => sent.push(value),
  };

  const started = pipeline.startPipeline(48000);
  const command = JSON.parse(sent.shift());
  assert.equal(command.sample_rate, 48000);

  pipeline._handleMessage({
    id: command.id,
    type: "result",
    success: true,
    result: { stt_binary_handler_id: 7 },
  });
  await started;

  pipeline.sendAudio(Int16Array.of(0x1234, -2));
  assert.deepEqual([...new Uint8Array(sent.shift())], [7, 0x34, 0x12, 0xfe, 0xff]);

  pipeline.endAudio();
  assert.deepEqual([...new Uint8Array(sent.shift())], [7]);
});

test("reports TTS playback completion to the satellite", () => {
  const sent = [];
  const pipeline = new HAVoicePipeline("https://ha.example", "token");
  pipeline.connected = true;
  pipeline.ws = {
    readyState: WebSocket.OPEN,
    send: (value) => sent.push(value),
  };

  pipeline.notifyTtsFinished();
  assert.equal(JSON.parse(sent[0]).type, "ha_always_on_voice/tts_finished");
});
