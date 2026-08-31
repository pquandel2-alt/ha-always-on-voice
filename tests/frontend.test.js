const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.WebSocket = { OPEN: 1 };
global.window = {
  self: null,
  top: null,
  isSecureContext: true,
  location: {
    origin: "https://ha.example",
    pathname: "/ha_always_on_voice",
    search: "?external_auth=1",
    hash: "",
    replace() {},
  },
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
    value: "",
    disabled: false,
    dataset: {},
    attributes: {},
    children: [],
    addEventListener() {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    classList: { add() {}, remove() {}, toggle() {} },
  });
  const selectors = [
    "#app", "#stateIndicator", "#stateDetail", "#assistResponse",
    "#userTranscript", "#settingsPanel", "#settingsBtn", "#backBtn",
    "#closeSettingsBtn", "#micToggleBtn", "#runDiagnosticsBtn",
    "#pipelineSetting", "#vadSetting", "#animationSetting", "#ttsSetting",
    "#browserVoiceSetting", "#volumeSetting", "#volumeValue",
    "#speechRateSetting", "#speechRateValue", "#startOverlay", "#startBtn",
    "#ttsSourceLabel", "#diagMic", "#diagConnection", "#diagPipeline",
    "#diagStt", "#diagTts", "#diagAudio", "#latencyStt",
    "#latencyIntent", "#latencyTts",
    ".voice-core-svg", "#equalizerMainPath", "#equalizerClipPath",
    "#equalizerAuraPath",
    "#equalizerLightField", "#equalizerDarkField", "#equalizerSpecular",
    "#equalizerWaveOne", "#equalizerWaveTwo",
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
    createElement: () => createNode(),
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
  assert.match(markup, /clipPath id="equalizerClip"/);
  assert.match(markup, /id="equalizerMainPath"/);
  assert.doesNotMatch(markup, /equalizerShadowRim/);
  assert.doesNotMatch(markup, /equalizerRimPath/);
  assert.match(styles, /animation-liquid_equalizer/);
  assert.match(styles, /state-speaking \.equalizer-color-three/);
  assert.match(markup, /animate attributeName="d"/);
  assert.match(markup, /repeatCount="indefinite"/);
  assert.match(markup, /class="svg-specular"/);
  assert.match(markup, /class="svg-caustic svg-caustic-one"/);
  assert.match(markup, /stroke="url\(#rimLight\)"/);
  assert.match(markup, /id="micToggleBtn"/);
  assert.match(markup, /id="runDiagnosticsBtn"/);
  assert.match(markup, /id="pipelineSetting"/);
  assert.match(markup, /offizielle Home-Assistant-Widget/);
  assert.doesNotMatch(markup, /Kurzbefehl erstellen/);
  assert.doesNotMatch(markup, /direkt öffnen/);
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

test("uses low-latency audio chunks compatible with iOS WebViews", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../custom_components/ha_always_on_voice/www/app/audio.js"),
    "utf8"
  );
  assert.match(source, /createScriptProcessor\(2048, 1, 1\)/);
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
  pipeline._handleMessage({
    id: command.id,
    type: "result",
    success: true,
    result: { secure_url: "https://remote.example" },
  });
  assert.deepEqual(await subscribed, { secure_url: "https://remote.example" });
  pipeline._handleMessage({
    id: command.id,
    type: "event",
    event: { animation_style: "aurora", tts_playback: "browser" },
  });

  assert.equal(received.animation_style, "aurora");
  assert.equal(received.tts_playback, "browser");
});

test("updates Home Assistant select entities through the standard service call", async () => {
  const sent = [];
  const pipeline = new HAVoicePipeline("https://ha.example", "token");
  pipeline.connected = true;
  pipeline.ws = {
    readyState: WebSocket.OPEN,
    send: (value) => sent.push(value),
  };

  const selecting = pipeline.selectOption("select.ha_voice_animation", "aurora");
  const command = JSON.parse(sent.shift());
  assert.equal(command.type, "call_service");
  assert.equal(command.domain, "select");
  assert.equal(command.service, "select_option");
  assert.deepEqual(command.service_data, {
    entity_id: "select.ha_voice_animation",
    option: "aurora",
  });
  pipeline._handleMessage({ id: command.id, type: "result", success: true, result: {} });
  await selecting;
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

test("keeps the current panel route when switching an insecure session to HTTPS", () => {
  const { app } = createVoiceApp();
  const originalLocation = window.location;
  window.location = {
    origin: "http://192.168.1.10:8123",
    pathname: "/ha_always_on_voice",
    search: "?external_auth=1",
    hash: "#voice",
  };
  app.secureUrl = "https://home.example/";

  try {
    assert.equal(
      app._securePanelUrl(),
      "https://home.example/ha_always_on_voice?external_auth=1#voice"
    );
    let redirectedTo = null;
    app.navigate = (url) => { redirectedTo = url; };
    assert.equal(app._redirectToSecureUrl(), true);
    assert.equal(redirectedTo, "https://home.example/ha_always_on_voice?external_auth=1#voice");
  } finally {
    window.location = originalLocation;
  }
});

test("ends microphone upload promptly after a speech pause", () => {
  const { app, nodes } = createVoiceApp();
  let ended = 0;
  app.pipeline = { endAudio: () => ended++ };
  app.state = "HEARING";
  app.vadSensitivity = "default";
  app.localVadStartedAt = 1000;
  app.localLastVoiceAt = 1000;
  app._now = () => 1750;

  app._trackLocalEndOfSpeech(new Int16Array(2048));
  app._trackLocalEndOfSpeech(new Int16Array(2048));

  assert.equal(ended, 1);
  assert.equal(app.state, "PROCESSING");
  assert.match(nodes["#stateDetail"].textContent, /Satzende erkannt/);
});

test("does not end audio while speech energy is present", () => {
  const { app } = createVoiceApp();
  let ended = 0;
  app.pipeline = { endAudio: () => ended++ };
  app.state = "HEARING";
  app.localVadStartedAt = 1000;
  app.localLastVoiceAt = 1000;
  app._now = () => 2000;

  app._trackLocalEndOfSpeech(new Int16Array(2048).fill(4000));

  assert.equal(ended, 0);
  assert.equal(app.localLastVoiceAt, 2000);
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
    assert.equal(app.ttsPlayer.volume, app.voiceVolume);
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

test("applies the selected browser voice, rate and volume", () => {
  const { app } = createVoiceApp();
  let utterance = null;
  class TestUtterance {
    constructor(text) { this.text = text; }
  }
  global.SpeechSynthesisUtterance = TestUtterance;
  global.speechSynthesis = {
    getVoices: () => [{ voiceURI: "de-premium", name: "Deutsch", lang: "de-DE" }],
    cancel() {},
    speak(value) { utterance = value; },
  };
  app.browserVoiceURI = "de-premium";
  app.speechRate = 1.2;
  app.voiceVolume = 0.65;

  try {
    assert.equal(app._speakWithBrowserVoice("Guten Morgen", () => {}), true);
    assert.equal(utterance.rate, 1.2);
    assert.equal(utterance.volume, 0.65);
    assert.equal(utterance.voice.voiceURI, "de-premium");
  } finally {
    delete global.SpeechSynthesisUtterance;
    delete global.speechSynthesis;
  }
});

test("removes the voiceschanged listener on destroy instead of leaking it", () => {
  // speechSynthesis is a page-lifetime singleton, but ha-voice-panel.js
  // constructs a new VoiceAssistApp on every re-attach. Without cleanup,
  // every panel visit adds one more listener pointing at a destroyed app.
  const listeners = new Map();
  global.speechSynthesis = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type, handler) => {
      if (listeners.get(type) === handler) listeners.delete(type);
    },
    getVoices: () => [],
    cancel() {},
  };

  try {
    const { app } = createVoiceApp();
    assert.equal(listeners.has("voiceschanged"), true, "listener was never registered");

    app.destroy();

    assert.equal(
      listeners.has("voiceschanged"),
      false,
      "destroy() left the voiceschanged listener registered on the shared synth"
    );
  } finally {
    delete global.speechSynthesis;
  }
});

test("ignores a stray voiceschanged event after destroy", () => {
  const { app, nodes } = createVoiceApp();
  nodes["#browserVoiceSetting"].replaceChildren = () => {
    throw new Error("must not touch the DOM once destroyed");
  };
  app.destroyed = true;

  assert.doesNotThrow(() => app._populateBrowserVoices());
});

test("pauses and resumes the microphone from the visible status control", async () => {
  const { app } = createVoiceApp();
  let stopped = false;
  app.audio.isRecording = true;
  app.audio.stop = () => {
    stopped = true;
    app.audio.isRecording = false;
  };
  app.pipeline = { endAudio() {} };

  await app._toggleMicrophone();
  assert.equal(stopped, true);
  assert.equal(app.pausedByUser, true);
  assert.equal(app.state, "PAUSED");

  let activated = false;
  app.activate = async () => { activated = true; };
  await app._toggleMicrophone();
  assert.equal(activated, true);
  assert.equal(app.pausedByUser, false);
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

  for (const style of [
    "orb", "liquid_equalizer", "spectrum", "aurora", "pulse", "constellation", "minimal", "avatar",
  ]) {
    app._applyRunConfiguration({ animation_style: style });
    assert.equal(app.animationStyle, style);
    assert.match(nodes["#app"].className, new RegExp(`animation-${style}`));
  }
});

test("deforms the liquid equalizer from live speech frequencies", () => {
  const { app, nodes } = createVoiceApp();
  app.animationStyle = "liquid_equalizer";
  app.state = "HEARING";
  app._now = () => 1000;
  const loudSpeech = new Uint8Array(128).fill(170);

  app._drawFrequencyRing(loudSpeech);
  const firstPath = nodes["#equalizerMainPath"].attributes.d;
  assert.match(firstPath, /^M /);
  assert.match(firstPath, / Q /);

  app._now = () => 1480;
  app._drawFrequencyRing(new Uint8Array(128).fill(35));
  const secondPath = nodes["#equalizerMainPath"].attributes.d;
  assert.notEqual(secondPath, firstPath);
  assert.equal(nodes["#equalizerClipPath"].attributes.d, secondPath);
});

test("renders live Home Assistant configuration as direct settings", () => {
  const { app, nodes } = createVoiceApp();
  app._applyRunConfiguration({
    animation_style: "aurora",
    tts_playback: "browser",
    selects: {
      pipeline: {
        entity_id: "select.ha_voice_pipeline",
        value: "preferred",
        options: ["preferred", "default"],
      },
      animation_style: {
        entity_id: "select.ha_voice_animation",
        value: "aurora",
        options: ["orb", "aurora"],
      },
    },
  });

  assert.equal(nodes["#pipelineSetting"].value, "preferred");
  assert.equal(nodes["#pipelineSetting"].children.length, 2);
  assert.equal(nodes["#animationSetting"].value, "aurora");
  assert.equal(nodes["#diagPipeline"].dataset.status, "ok");
});

function withSessionStorage(run) {
  const original = global.sessionStorage;
  const store = new Map();
  global.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  try {
    return run();
  } finally {
    if (original === undefined) delete global.sessionStorage;
    else global.sessionStorage = original;
  }
}

test("suppresses an immediate second HTTPS hop but not a later one", () => {
  const { app } = createVoiceApp();
  const originalLocation = window.location;
  const originalNow = Date.now;
  window.location = {
    origin: "http://192.168.1.10:8123",
    pathname: "/ha_always_on_voice",
    search: "",
    hash: "",
  };
  app.secureUrl = "https://home.example/";

  try {
    withSessionStorage(() => {
      const targets = [];
      app.navigate = (url) => targets.push(url);

      let now = 1_000_000;
      Date.now = () => now;

      assert.equal(app._redirectToSecureUrl(), true);
      // An origin bounce re-enters immediately and must be stopped.
      assert.equal(app._redirectToSecureUrl(), false);
      assert.equal(targets.length, 1);

      // Reopening the panel later must hop again. The permanent flag shipped
      // in 1.2.1 stranded the user on the insecure origin for the whole
      // session, showing "Mikrofonzugriff benötigt HTTPS" instead.
      now += 60_000;
      assert.equal(app._redirectToSecureUrl(), true);
      assert.equal(targets.length, 2);
    });
  } finally {
    Date.now = originalNow;
    window.location = originalLocation;
  }
});

test("treats a pre-1.2.2 redirect flag as stale instead of a permanent block", () => {
  const { app } = createVoiceApp();
  const originalLocation = window.location;
  window.location = {
    origin: "http://192.168.1.10:8123",
    pathname: "/ha_always_on_voice",
    search: "",
    hash: "",
  };
  app.secureUrl = "https://home.example/";

  try {
    withSessionStorage(() => {
      // 1.2.1 wrote the literal string "1", which is not a usable timestamp.
      // Upgrading users must not stay locked out by their own stale flag.
      global.sessionStorage.setItem("haVoiceSecureRedirect", "1");
      const targets = [];
      app.navigate = (url) => targets.push(url);

      assert.equal(app._redirectToSecureUrl(), true);
      assert.equal(targets.length, 1);
    });
  } finally {
    window.location = originalLocation;
  }
});

test("names the HTTPS address instead of failing vaguely on an insecure origin", () => {
  const { app } = createVoiceApp();
  const originalSecure = window.isSecureContext;
  window.isSecureContext = false;
  app.secureUrl = "https://home.example/";

  try {
    const described = app._describeInsecureContext(new Error("original"));
    assert.match(described.message, /https:\/\/home\.example/);
  } finally {
    window.isSecureContext = originalSecure;
  }
});

test("backs off exponentially instead of retrying every three seconds", () => {
  const { app } = createVoiceApp();
  const delays = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (_fn, ms) => {
    delays.push(ms);
    return 1;
  };

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      app.reconnectTimer = null;
      app._scheduleReconnect();
    }
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  assert.equal(delays.length, 5);
  // Jitter is +/-25%, so compare against the guaranteed bounds rather than
  // exact values.
  assert.ok(delays[0] <= 2000 * 1.25, `first delay too long: ${delays[0]}`);
  assert.ok(delays[4] > delays[0], "delay did not grow across attempts");
  assert.ok(delays[4] <= 30000 * 1.25, `delay exceeded the cap: ${delays[4]}`);
});

test("resets the backoff once a reconnect succeeds", async () => {
  const { app } = createVoiceApp();
  app.reconnectAttempts = 4;
  app._connectPipeline = async () => {};

  await app._reconnect();

  // Otherwise a later, unrelated dropout would start at the 30s cap.
  assert.equal(app.reconnectAttempts, 0);
});

test("merges concurrent connect attempts into a single in-flight socket", async () => {
  // activate() (guarded by this.starting) and _reconnect() (guarded by
  // this.reconnecting) can call _connectPipeline() at the same moment. Two
  // real connects would each overwrite this.pipeline, leaving the loser's
  // handlers wired to a socket nothing else references.
  const { app } = createVoiceApp();
  let calls = 0;
  let resolveConnect;
  app._doConnectPipeline = () => {
    calls++;
    return new Promise((resolve) => {
      resolveConnect = resolve;
    });
  };

  const first = app._connectPipeline();
  const second = app._connectPipeline();
  assert.equal(calls, 1, "a second caller must reuse the in-flight connect");

  resolveConnect();
  await Promise.all([first, second]);

  let laterCalls = 0;
  app._doConnectPipeline = async () => {
    laterCalls++;
  };
  await app._connectPipeline();
  assert.equal(laterCalls, 1, "a later reconnect must open a fresh socket, not a stale promise");
});

test("keeps the socket alive with ping and clears the timeout on pong", () => {
  const sent = [];
  let closed = false;
  const pipeline = new HAVoicePipeline("https://ha.example", "token");
  pipeline.connected = true;
  pipeline.ws = {
    readyState: WebSocket.OPEN,
    send: (value) => sent.push(value),
    close: () => { closed = true; },
  };

  pipeline._sendPing();
  const ping = JSON.parse(sent.shift());
  assert.equal(ping.type, "ping");
  assert.equal(pipeline.pendingPingId, ping.id);

  pipeline._handleMessage({ id: ping.id, type: "pong" });
  assert.equal(pipeline.pendingPingId, null);
  assert.equal(closed, false);
  pipeline._stopHeartbeat();
});

test("closes a socket that never answers the ping", () => {
  const sent = [];
  let closed = false;
  let pongTimeoutFn = null;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    pongTimeoutFn = fn;
    return 1;
  };

  const pipeline = new HAVoicePipeline("https://ha.example", "token");
  pipeline.connected = true;
  pipeline.ws = {
    readyState: WebSocket.OPEN,
    send: (value) => sent.push(value),
    close: () => { closed = true; },
  };

  try {
    pipeline._sendPing();
    assert.ok(pongTimeoutFn, "no pong timeout was armed");
    pongTimeoutFn();
  } finally {
    global.setTimeout = originalSetTimeout;
  }

  // A half-open socket must be torn down so the normal reconnect path runs.
  assert.equal(closed, true);
  assert.equal(pipeline.pendingPingId, null);
});

test("lets the panel start again after Home Assistant re-attaches it", () => {
  const originalCustomElements = global.customElements;
  const originalHTMLElement = global.HTMLElement;
  let PanelClass = null;
  global.HTMLElement = class {};
  global.customElements = {
    get: () => undefined,
    define: (_name, cls) => { PanelClass = cls; },
  };

  try {
    delete require.cache[
      require.resolve("../custom_components/ha_always_on_voice/www/ha-voice-panel.js")
    ];
    require("../custom_components/ha_always_on_voice/www/ha-voice-panel.js");
    assert.ok(PanelClass, "panel element was never defined");

    let destroyed = false;
    const panel = Object.create(PanelClass.prototype);
    panel._app = { destroy: () => { destroyed = true; } };
    panel._started = true;

    panel.disconnectedCallback();

    assert.equal(destroyed, true);
    // Without this reset _maybeStart() returns early forever and the panel
    // comes back showing "Verbindung unterbrochen".
    assert.equal(panel._started, false);
    assert.equal(panel._app, null);
  } finally {
    global.customElements = originalCustomElements;
    global.HTMLElement = originalHTMLElement;
  }
});

test("keeps all four version strings in lockstep", () => {
  // The version is cache-busting metadata in four hand-maintained places, and
  // two of them bust different asset sets: __init__.py appends ?v= to the panel
  // module, ha-voice-panel.js appends its own APP_VERSION to ui/audio/ha-ws/main.
  // Bump the manifest but forget APP_VERSION and every user downloads a new
  // loader that then re-requests the *old cached* main.js — they receive the
  // update and the bug at once, and nobody can reproduce it.
  const integration = path.join(__dirname, "../custom_components/ha_always_on_voice");
  const read = (relative) => fs.readFileSync(path.join(integration, relative), "utf8");
  const capture = (relative, pattern) => {
    const match = read(relative).match(pattern);
    assert.ok(match, `version not found in ${relative}`);
    return match[1];
  };

  const version = JSON.parse(read("manifest.json")).version;
  assert.match(version, /^\d+\.\d+\.\d+$/);

  assert.equal(capture("__init__.py", /_FRONTEND_VERSION = "([^"]+)"/), version);
  assert.equal(capture("www/ha-voice-panel.js", /APP_VERSION = "([^"]+)"/), version);
  assert.equal(
    capture("www/app/sw.js", /CACHE_NAME = "([^"]+)"/),
    `ha-voice-v${version.replace(/\./g, "")}`
  );
});

test("strings.json and translations/en.json stay in sync", () => {
  // strings.json is the hassfest-validated source; translations/en.json is
  // the file Home Assistant actually loads for custom integrations at
  // runtime. Both must ship and both must agree, or the source-of-record
  // text silently diverges from what English-speaking users ever see.
  const integration = path.join(__dirname, "../custom_components/ha_always_on_voice");
  const strings = JSON.parse(fs.readFileSync(path.join(integration, "strings.json"), "utf8"));
  const en = JSON.parse(
    fs.readFileSync(path.join(integration, "translations/en.json"), "utf8")
  );
  assert.deepEqual(en, strings);
});
