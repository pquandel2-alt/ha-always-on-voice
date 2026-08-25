const test = require("node:test");
const assert = require("node:assert/strict");

global.WebSocket = { OPEN: 1 };
global.window = {
  self: null,
  top: null,
  location: { origin: "https://ha.example" },
  devicePixelRatio: 1,
};
global.requestAnimationFrame = () => 1;
global.cancelAnimationFrame = () => {};

const { AudioCapture } = require("../custom_components/ha_always_on_voice/www/app/audio.js");
const { HAVoicePipeline } = require("../custom_components/ha_always_on_voice/www/app/ha-ws.js");
const { VoiceAssistApp } = require("../custom_components/ha_always_on_voice/www/app/main.js");

function createVoiceApp() {
  const createNode = () => ({
    textContent: "",
    className: "",
    disabled: false,
    addEventListener() {},
    setAttribute() {},
    classList: { add() {}, remove() {} },
  });
  const selectors = [
    "#app", "#stateIndicator", "#stateDetail", "#assistResponse",
    "#userTranscript", "#settingsPanel", "#settingsBtn",
    "#closeSettingsBtn", "#testMicBtn", "#startOverlay", "#startBtn",
  ];
  const nodes = Object.fromEntries(selectors.map((selector) => [selector, createNode()]));
  nodes["#frequencyRing"] = {
    ...createNode(),
    width: 300,
    height: 300,
    getContext: () => ({ clearRect() {} }),
  };
  const root = {
    querySelector: (selector) => nodes[selector],
    addEventListener() {},
  };
  return { app: new VoiceAssistApp({ root }), nodes };
}

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

test("keeps an answer visible until the next request starts", async () => {
  const { app, nodes } = createVoiceApp();
  nodes["#assistResponse"].textContent = "Das Licht ist eingeschaltet.";
  app.audio.isRecording = true;
  app.pipeline = {
    connected: true,
    startPipeline: async () => {},
  };

  await app._startListening();
  assert.equal(nodes["#assistResponse"].textContent, "Das Licht ist eingeschaltet.");

  app._onSttStart();
  assert.equal(nodes["#assistResponse"].textContent, "");
});

test("plays delayed TTS through the already active AudioContext", async () => {
  const { app } = createVoiceApp();
  let notified = 0;
  let sourceStarted = false;
  const source = {
    connect() {},
    start() {
      sourceStarted = true;
      queueMicrotask(() => this.onended());
    },
  };
  app.latestHassUrl = "https://ha.example";
  app.audio.analyser = {};
  app.audio.audioContext = {
    state: "running",
    destination: {},
    decodeAudioData(_data, resolve) {
      const buffer = {};
      resolve(buffer);
      return Promise.resolve(buffer);
    },
    createBufferSource: () => source,
  };
  app.pipeline = { notifyTtsFinished: () => notified++ };
  global.fetch = async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  });

  await app._playTTS("/api/tts_proxy/test.mp3");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sourceStarted, true);
  assert.equal(notified, 1);
  assert.equal(app.ttsEnded, true);
});
