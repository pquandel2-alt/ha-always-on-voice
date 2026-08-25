const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
    dataset: {},
    addEventListener() {},
    setAttribute() {},
    classList: { add() {}, remove() {} },
  });
  const selectors = [
    "#app", "#stateIndicator", "#stateDetail", "#assistResponse",
    "#userTranscript", "#settingsPanel", "#settingsBtn", "#backBtn",
    "#closeSettingsBtn", "#testMicBtn", "#startOverlay", "#startBtn",
    "#ttsSourceLabel",
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

test("renders vector animation cores without CSS border clipping", () => {
  const appDir = path.join(
    __dirname,
    "../custom_components/ha_always_on_voice/www/app"
  );
  const markup = fs.readFileSync(path.join(appDir, "ui.js"), "utf8");
  const styles = fs.readFileSync(path.join(appDir, "style.css"), "utf8");
  const orbRule = styles.match(/\.orb \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(markup, /class="voice-core-svg"/);
  assert.match(markup, /clipPath id="sphereClip"/);
  assert.match(markup, /clipPath id="auroraClip"/);
  assert.match(markup, /animate attributeName="d"/);
  assert.match(markup, /repeatCount="indefinite"/);
  assert.doesNotMatch(orbRule, /overflow:\s*hidden/);
  assert.doesNotMatch(orbRule, /border-radius/);
});

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

test("subscribes to live device configuration updates", async () => {
  const sent = [];
  const pipeline = new HAVoicePipeline("https://ha.example", "token");
  pipeline.connected = true;
  pipeline.ws = {
    readyState: WebSocket.OPEN,
    send: (value) => sent.push(value),
  };
  let received = null;
  pipeline.onConfiguration = (config) => {
    received = config;
  };

  const subscribed = pipeline.subscribeConfiguration();
  const command = JSON.parse(sent.shift());
  assert.equal(command.type, "ha_always_on_voice/subscribe_config");
  pipeline._handleMessage({ id: command.id, type: "result", success: true });
  await subscribed;
  pipeline._handleMessage({
    id: command.id,
    type: "event",
    event: { animation_style: "aurora", tts_playback: "browser" },
  });

  assert.equal(received.animation_style, "aurora");
  assert.equal(received.tts_playback, "browser");
});

test("forwards the real VAD start event separately from STT startup", () => {
  const pipeline = new HAVoicePipeline("https://ha.example", "token");
  let sttStarts = 0;
  let vadStarts = 0;
  let ttsText = null;
  pipeline.onSttStart = () => sttStarts++;
  pipeline.onVadStart = () => vadStarts++;
  pipeline.onTtsStart = (data) => {
    ttsText = data.text;
  };

  pipeline._handleMessage({ type: "event", event: { type: "stt-start" } });
  assert.equal(sttStarts, 1);
  assert.equal(vadStarts, 0);

  pipeline._handleMessage({ type: "event", event: { type: "stt-vad-start" } });
  assert.equal(vadStarts, 1);

  pipeline._handleMessage({
    type: "event",
    event: { type: "tts-start", data: { tts_input: "Hallo vom Assistenten" } },
  });
  assert.equal(ttsText, "Hallo vom Assistenten");
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

  app._onVadStart();
  assert.equal(nodes["#assistResponse"].textContent, "");
  clearTimeout(app.pipelineRefreshTimer);
});

test("uses browser history for the panel back button", () => {
  const { app } = createVoiceApp();
  let wentBack = false;
  const originalHistory = window.history;
  window.history = {
    length: 2,
    back() {
      wentBack = true;
    },
  };

  try {
    app._goBack();
    assert.equal(wentBack, true);
  } finally {
    window.history = originalHistory;
  }
});

test("tries to start the microphone automatically when the panel opens", async () => {
  const { app } = createVoiceApp();
  const originalSupportCheck = AudioCapture.getSupportError;
  AudioCapture.getSupportError = () => null;
  app._connectPipeline = async () => {
    app.pipeline = {
      connected: true,
      startPipeline: async () => ({}),
    };
  };
  app.audio.start = async () => {
    app.audio.isRecording = true;
  };

  try {
    await app.init();
    assert.equal(app.audio.isRecording, true);
    assert.equal(app.state, "LISTENING");
  } finally {
    AudioCapture.getSupportError = originalSupportCheck;
    clearTimeout(app.pipelineRefreshTimer);
  }
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

test("reuses a user-activated media element for delayed iOS TTS", async () => {
  const { app } = createVoiceApp();
  let playedUrl = null;
  let notified = 0;
  let fetchCount = 0;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  app.latestHassUrl = "https://ha.example";
  app.pipeline = { notifyTtsFinished: () => notified++ };
  app.ttsPlayer = {
    volume: 0,
    set src(value) {
      playedUrl = value;
    },
    async play() {},
  };
  global.fetch = async () => {
    fetchCount++;
    return {
      ok: true,
      headers: { get: () => "audio/mpeg" },
      arrayBuffer: async () => new ArrayBuffer(8),
    };
  };
  URL.createObjectURL = () => "blob:tts-audio";
  URL.revokeObjectURL = () => {};

  try {
    await app._playTTS("/api/tts_proxy/test.mp3");
    assert.equal(playedUrl, "blob:tts-audio");
    assert.equal(fetchCount, 1);
    assert.equal(app.ttsEnded, false);

    app.ttsPlayer.onended();
    assert.equal(notified, 1);
    assert.equal(app.ttsEnded, true);
  } finally {
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
  }
});

test("falls back to the iPhone voice when Home Assistant TTS returns 500", async () => {
  const { app, nodes } = createVoiceApp();
  let spokenText = null;
  let notified = 0;
  const originalConsoleError = console.error;
  class TestUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  global.SpeechSynthesisUtterance = TestUtterance;
  global.speechSynthesis = {
    cancel() {},
    speak(utterance) {
      spokenText = utterance.text;
      queueMicrotask(() => utterance.onend());
    },
  };
  nodes["#assistResponse"].textContent = "Das Licht ist eingeschaltet.";
  app.pipeline = { notifyTtsFinished: () => notified++ };
  global.fetch = async () => ({ ok: false, status: 500 });
  console.error = () => {};

  try {
    await app._playTTS("/api/tts_proxy/broken.mp3");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(spokenText, "Das Licht ist eingeschaltet.");
    assert.equal(notified, 1);
    assert.equal(app.ttsEnded, true);
  } finally {
    delete global.SpeechSynthesisUtterance;
    delete global.speechSynthesis;
    console.error = originalConsoleError;
  }
});

test("applies animation and TTS settings supplied by the device", () => {
  const { app, nodes } = createVoiceApp();
  app._applyRunConfiguration({
    animation_style: "minimal",
    tts_playback: "pipeline",
    tts_engine: "tts.piper",
  });

  assert.equal(app.animationStyle, "minimal");
  assert.match(nodes["#app"].className, /animation-minimal/);
  assert.equal(nodes["#ttsSourceLabel"].textContent, "tts.piper");

  app._applyRunConfiguration({ tts_playback: "browser" });
  assert.equal(app.ttsPlayback, "browser");
  assert.equal(nodes["#ttsSourceLabel"].textContent, "iPhone-/Browser-Stimme");

  for (const style of ["orb", "spectrum", "aurora", "pulse", "constellation", "minimal"]) {
    app._applyRunConfiguration({ animation_style: style });
    assert.equal(app.animationStyle, style);
    assert.match(nodes["#app"].className, new RegExp(`animation-${style}`));
  }
});
