/**
 * Voice UI state machine and lifecycle management.
 */

class VoiceAssistApp {
  constructor({ root = document, authProvider = null } = {}) {
    this.root = root;
    this.authProvider = authProvider;
    this.state = "IDLE";
    this.audio = new globalThis.AudioCapture();
    this.pipeline = null;
    this.latestToken = null;
    this.latestHassUrl = null;
    this.userActivated = false;
    this.initialized = false;
    this.destroyed = false;
    this.starting = false;
    this.reconnecting = false;
    this.reconnectTimer = null;
    this.restartTimer = null;
    this.pipelineRefreshTimer = null;
    this.animationId = null;
    this.currentTtsSource = null;
    this.currentTtsPlaybackId = null;
    this.ttsEnded = true;
    this.ttsWasRequested = false;
    this.runEnded = false;
    this.runFailed = false;
    this.animationStyle = "orb";
    this.ttsPlayback = "pipeline";
    this.ttsEngine = null;
    this.persistentNotice = null;
    this.smoothedLevels = new Float32Array(72);

    this.container = root.querySelector("#app");
    this.stateIndicator = root.querySelector("#stateIndicator");
    this.stateDetail = root.querySelector("#stateDetail");
    this.assistResponse = root.querySelector("#assistResponse");
    this.userTranscript = root.querySelector("#userTranscript");
    this.settingsPanel = root.querySelector("#settingsPanel");
    this.settingsBtn = root.querySelector("#settingsBtn");
    this.closeSettingsBtn = root.querySelector("#closeSettingsBtn");
    this.testMicBtn = root.querySelector("#testMicBtn");
    this.startOverlay = root.querySelector("#startOverlay");
    this.startBtn = root.querySelector("#startBtn");
    this.ttsPlayer = root.querySelector("#ttsPlayer");
    this.ttsSourceLabel = root.querySelector("#ttsSourceLabel");
    this.frequencyCanvas = root.querySelector("#frequencyRing");
    this.canvasCtx = this.frequencyCanvas.getContext("2d");

    if (!this.container) throw new Error("Voice Assist UI wurde nicht gefunden.");
    this._setupEventListeners();
    this._setupLegacyAuthListener();
  }

  _setupEventListeners() {
    this.audio.onAudioData = (data) => this._onAudioData(data);
    this.startBtn.addEventListener("click", () => this.activate());
    this.settingsBtn.addEventListener("click", () => {
      this.settingsPanel.classList.add("open");
      this.settingsPanel.setAttribute("aria-hidden", "false");
    });
    this.closeSettingsBtn.addEventListener("click", () => this._closeSettings());
    this.testMicBtn.addEventListener("click", () => this._testMicrophone());
    this.root.addEventListener?.("keydown", (event) => {
      if (event.key === "Escape") this._closeSettings();
    });
  }

  _setupLegacyAuthListener() {
    if (window.self === window.top) return;
    window.addEventListener("message", (event) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== window.parent ||
        event.data?.type !== "HA_AUTH_TOKEN"
      ) return;
      this.updateAuth(event.data.token, event.data.hassUrl);
    });
  }

  updateAuth(token, hassUrl) {
    if (!token) return;
    this.latestToken = token;
    this.latestHassUrl = hassUrl || window.location.origin;
    if (this.pipeline) this.pipeline.accessToken = token;
  }

  async init() {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;
    this._setState("CONNECTING");
    this._updateStateUI("Verbinden", "Home Assistant wird vorbereitet …");

    try {
      await this._connectPipeline();
      const supportError = globalThis.AudioCapture.getSupportError();
      if (supportError) {
        this._handleError(supportError, { recoverable: false });
        return;
      }
      this._setState("READY");
      this._updateStateUI("Bereit", "Einmal tippen, um das Mikrofon zu aktivieren");
      this._showStartButton("Mikrofon starten");
    } catch (error) {
      this.initialized = false;
      this._handleError(error, { recoverable: true });
    }
  }

  async activate() {
    if (this.starting || this.destroyed) return;
    this.starting = true;
    // Prime one persistent media element synchronously inside the tap event.
    // iOS then permits this same element to play a TTS response several
    // seconds later, after the Assist pipeline has finished.
    this._primeTtsPlayer();
    this.startBtn.disabled = true;
    this.startBtn.textContent = "Wird aktiviert …";

    try {
      if (!this.pipeline?.connected) await this._connectPipeline();
      if (!this.audio.isRecording) await this.audio.start();
      this.userActivated = true;
      this.startOverlay.classList.remove("visible");
      await this._startListening();
    } catch (error) {
      this._handleError(error, { recoverable: false });
      this._showStartButton("Erneut versuchen");
    } finally {
      this.starting = false;
      this.startBtn.disabled = false;
    }
  }

  async _connectPipeline() {
    const { token, hassUrl } = await this._getAuth();
    this.pipeline?.disconnect();
    this.pipeline = new globalThis.HAVoicePipeline(hassUrl, token);
    this.pipeline.onSttStart = () => this._onSttStart();
    this.pipeline.onVadStart = () => this._onVadStart();
    this.pipeline.onSttEnd = (data) => this._onSttEnd(data);
    this.pipeline.onIntentStart = () => this._onIntentStart();
    this.pipeline.onIntentEnd = (data) => this._onIntentEnd(data);
    this.pipeline.onTtsStart = () => this._onTtsStart();
    this.pipeline.onTtsEnd = (data) => this._onTtsEnd(data);
    this.pipeline.onRunEnd = (data) => this._onRunEnd(data);
    this.pipeline.onError = (error) => this._handleError(error, { recoverable: true });
    await this.pipeline.connect();
  }

  async _getAuth() {
    if (this.authProvider) {
      const auth = await this.authProvider();
      if (auth?.token) {
        this.updateAuth(auth.token, auth.hassUrl);
        return { token: auth.token, hassUrl: auth.hassUrl || window.location.origin };
      }
    }
    if (this.latestToken) {
      return {
        token: this.latestToken,
        hassUrl: this.latestHassUrl || window.location.origin,
      };
    }

    if (document.documentElement.dataset.voiceStandalone === "true") {
      window.location.replace("/ha_always_on_voice");
      return new Promise(() => {});
    }
    throw new Error("Keine Home-Assistant-Anmeldung verfügbar. Öffne Voice Assist über die Seitenleiste.");
  }

  async _startListening() {
    if (!this.pipeline?.connected || !this.audio.isRecording || this.destroyed) return;
    clearTimeout(this.restartTimer);
    this.currentTtsSource = null;
    this.currentTtsPlaybackId = null;
    this.ttsEnded = true;
    this.ttsWasRequested = false;
    this.runEnded = false;
    this.runFailed = false;
    this._setState("STARTING");
    this._updateStateUI("Einen Moment", "Spracherkennung wird gestartet …");
    const runConfig = await this.pipeline.startPipeline(this.audio.sampleRate);
    this._applyRunConfiguration(runConfig);
    this._setState("LISTENING");
    this._updateStateUI("Ich höre zu", this.persistentNotice || "Sprich einfach los");
    this._startVisualization();
    clearTimeout(this.pipelineRefreshTimer);
    this.pipelineRefreshTimer = setTimeout(() => {
      if (this.state === "LISTENING") {
        this._startListening().catch((error) => {
          this._handleError(error, { recoverable: true });
        });
      }
    }, 240000);
  }

  _onAudioData(data) {
    if (this.state === "LISTENING" || this.state === "HEARING") {
      this.pipeline?.sendAudio(data);
    }
  }

  _onSttStart() {
    this._setState("LISTENING");
    this._updateStateUI("Ich höre zu", this.persistentNotice || "Sprich einfach los");
  }

  _onVadStart() {
    // Keep the previous answer visible while idle. Only replace it when the
    // user actually starts a new request.
    this.assistResponse.textContent = "";
    this.userTranscript.textContent = "";
    this._setState("HEARING");
    this._updateStateUI("Ich höre dich", "Sprich deinen Satz zu Ende");
  }

  _onSttEnd(data) {
    const transcript = data.transcript?.trim() || "";
    this.userTranscript.textContent = transcript ? `„${transcript}“` : "";
    this.pipeline?.endAudio();
  }

  _onIntentStart() {
    this._setState("PROCESSING");
    this._updateStateUI("Wird verarbeitet", "Home Assistant denkt nach …");
  }

  _onIntentEnd(data) {
    this.assistResponse.textContent = data.responseText || "";
  }

  _onTtsStart() {
    this.ttsWasRequested = true;
    this._setState("SPEAKING");
    this._updateStateUI("Antwort", "Home Assistant spricht");
  }

  _onTtsEnd(data) {
    if (this.ttsPlayback === "muted") {
      this.ttsEnded = true;
      this.pipeline?.notifyTtsFinished();
      this._updateStateUI("Antwort", "Sprachausgabe ist in den Geräte-Einstellungen stummgeschaltet");
      return;
    }
    if (data.url) {
      this._playTTS(data.url);
    } else {
      this.persistentNotice = "TTS-Fehler: Die Pipeline hat keine Audiodatei geliefert";
      this._updateStateUI("Antwort", this.persistentNotice);
    }
  }

  _onRunEnd(data) {
    this.runEnded = true;
    if (this.runFailed) return;
    if (!data.success) {
      this._handleError(new Error("Die Sprachverarbeitung wurde abgebrochen."), { recoverable: true });
      return;
    }
    if (!this.ttsWasRequested && this.assistResponse.textContent) {
      this._updateStateUI("Antwort", "Sprachausgabe ist in dieser Pipeline nicht verfügbar");
    }
    if (this.ttsEnded) this._scheduleNextListening();
  }

  async _playTTS(ttsUrl) {
    this.ttsEnded = false;
    const playbackId = Symbol("tts-playback");
    this.currentTtsPlaybackId = playbackId;
    let finished = false;

    const finish = () => {
      if (finished || this.currentTtsPlaybackId !== playbackId) return;
      finished = true;
      this.currentTtsSource = null;
      this.currentTtsPlaybackId = null;
      this.ttsEnded = true;
      this.pipeline?.notifyTtsFinished();
      if (this.runEnded) this._scheduleNextListening();
    };

    const url = new URL(ttsUrl, this.latestHassUrl || window.location.origin);
    let fallbackPromise = null;
    const playFallback = () => {
      fallbackPromise ||= this._playTtsWithAudioContext(url, playbackId, finish);
      return fallbackPromise;
    };
    if (this.ttsPlayer) {
      try {
        this.ttsPlayer.onended = finish;
        this.ttsPlayer.onerror = () => {
          if (this.currentTtsPlaybackId === playbackId) {
            playFallback().catch((error) => {
              this._reportTtsFailure(error, finish);
            });
          }
        };
        this.ttsPlayer.volume = 1;
        this.ttsPlayer.src = url.toString();
        await this.ttsPlayer.play();
        this.persistentNotice = null;
        this._updateStateUI("Antwort", "Home Assistant spricht");
        return;
      } catch (error) {
        console.warn("HTML audio playback failed, trying Web Audio", error);
      }
    }

    try {
      await playFallback();
      this.persistentNotice = null;
      this._updateStateUI("Antwort", "Home Assistant spricht");
    } catch (error) {
      this._reportTtsFailure(error, finish);
    }
  }

  async _playTtsWithAudioContext(url, playbackId, finish) {
    const context = this.audio.audioContext;
    if (!context || context.state === "closed") {
      throw new Error("AudioContext ist nicht aktiv");
    }
    if (context.state === "suspended") await context.resume();

    const headers = {};
    if (this.latestToken && url.origin === window.location.origin) {
      headers.Authorization = `Bearer ${this.latestToken}`;
    }
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      headers,
    });
    if (!response.ok) {
      throw new Error(`TTS-Audio konnte nicht geladen werden (${response.status})`);
    }

    const audioBuffer = await this._decodeAudioData(context, await response.arrayBuffer());
    if (this.currentTtsPlaybackId !== playbackId) return;

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audio.analyser);
    source.connect(context.destination);
    source.onended = finish;
    this.currentTtsSource = source;
    source.start(0);
  }

  _reportTtsFailure(error, finish) {
    console.error("TTS playback failed", error);
    this.persistentNotice = `TTS-Fehler: ${error.message || "unbekannter Fehler"}`;
    this._updateStateUI("Antwort", this.persistentNotice);
    finish();
  }

  _decodeAudioData(context, arrayBuffer) {
    return new Promise((resolve, reject) => {
      const result = context.decodeAudioData(arrayBuffer, resolve, reject);
      if (result?.then) result.then(resolve, reject);
    });
  }

  _primeTtsPlayer() {
    if (!this.ttsPlayer || this.ttsPlayer.dataset.primed === "true") return;
    const wav = new ArrayBuffer(46);
    const view = new DataView(wav);
    const text = (offset, value) => {
      for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };
    text(0, "RIFF");
    view.setUint32(4, 38, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, 2, true);
    view.setInt16(44, 0, true);
    const objectUrl = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
    this.ttsPlayer.volume = 0;
    this.ttsPlayer.src = objectUrl;
    this.ttsPlayer.play().then(() => {
      this.ttsPlayer.pause();
      this.ttsPlayer.dataset.primed = "true";
      this.ttsPlayer.volume = 1;
      URL.revokeObjectURL(objectUrl);
    }).catch((error) => {
      console.debug("TTS player priming was not accepted", error);
      URL.revokeObjectURL(objectUrl);
    });
  }

  _applyRunConfiguration(config = {}) {
    const allowedStyles = new Set(["orb", "spectrum", "minimal"]);
    this.animationStyle = allowedStyles.has(config.animation_style)
      ? config.animation_style
      : "orb";
    this.ttsPlayback = config.tts_playback === "muted" ? "muted" : "pipeline";
    this.ttsEngine = config.tts_engine || null;
    if (!this.persistentNotice?.startsWith("TTS-Fehler:")) {
      this.persistentNotice = null;
    }
    if (!this.ttsEngine && this.ttsPlayback !== "muted") {
      this.persistentNotice = "Keine TTS-Quelle in der gewählten Assist-Pipeline";
    }
    if (this.ttsSourceLabel) {
      this.ttsSourceLabel.textContent = this.ttsPlayback === "muted"
        ? "Stummgeschaltet"
        : (this.ttsEngine || "Nicht konfiguriert");
    }
    this._setState(this.state);
  }

  _scheduleNextListening() {
    if (this.restartTimer || this.destroyed) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this._startListening().catch((error) => {
        this._handleError(error, { recoverable: true });
      });
    }, 400);
  }

  _handleError(error, { recoverable = false } = {}) {
    if (this.destroyed) return;
    const normalized = error instanceof Error ? error : new Error("Unbekannter Fehler.");
    console.error("Voice Assist error", normalized);
    this.runFailed = true;
    clearTimeout(this.restartTimer);
    clearTimeout(this.pipelineRefreshTimer);
    this.restartTimer = null;
    if (this.currentTtsSource) {
      try {
        this.currentTtsSource.stop();
      } catch (_error) {
        // Already stopped.
      }
    }
    this.ttsPlayer?.pause();
    this.currentTtsSource = null;
    this.currentTtsPlaybackId = null;
    this.ttsEnded = true;
    this._setState("ERROR");
    this._updateStateUI("Verbindung unterbrochen", normalized.message);
    this._stopVisualization();
    this.pipeline?.endAudio();

    if (/token|password|auth|anmeldung/i.test(normalized.message)) {
      this.latestToken = null;
    }
    if (recoverable) this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.reconnectTimer || this.reconnecting || this.destroyed) return;
    this._updateStateUI("Verbindung unterbrochen", "Neuer Versuch in 3 Sekunden …");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._reconnect();
    }, 3000);
  }

  async _reconnect() {
    if (this.reconnecting || this.destroyed) return;
    this.reconnecting = true;
    let retryError = null;
    this._setState("CONNECTING");
    this._updateStateUI("Neu verbinden", "Home Assistant wird kontaktiert …");
    try {
      await this._connectPipeline();
      if (this.userActivated && this.audio.isRecording) {
        await this._startListening();
      } else {
        this._setState("READY");
        this._updateStateUI("Bereit", "Einmal tippen, um das Mikrofon zu aktivieren");
        this._showStartButton("Mikrofon starten");
      }
    } catch (error) {
      retryError = error;
    } finally {
      this.reconnecting = false;
    }
    if (retryError) this._handleError(retryError, { recoverable: true });
  }

  _startVisualization() {
    if (this.animationId) return;
    const draw = () => {
      this._drawFrequencyRing(this.audio.getFrequencyData());
      this.animationId = requestAnimationFrame(draw);
    };
    this.animationId = requestAnimationFrame(draw);
  }

  _stopVisualization() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;
    const canvas = this.frequencyCanvas;
    this.canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }

  _drawFrequencyRing(frequencyData) {
    const canvas = this.frequencyCanvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = this.canvasCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!frequencyData.length) return;

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const radius = Math.min(rect.width, rect.height) * 0.285;
    const colors = {
      LISTENING: ["#70f5d0", "#38bdf8"],
      HEARING: ["#a7f3d0", "#22d3ee"],
      PROCESSING: ["#fcd34d", "#fb7185"],
      SPEAKING: ["#c4b5fd", "#60a5fa"],
      ERROR: ["#fda4af", "#fb7185"],
    };
    const [startColor, endColor] = colors[this.state] || colors.LISTENING;
    const gradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    gradient.addColorStop(0, startColor);
    gradient.addColorStop(1, endColor);
    ctx.strokeStyle = gradient;
    ctx.lineCap = "round";

    for (let i = 0; i < this.smoothedLevels.length; i++) {
      const bin = Math.floor((i / this.smoothedLevels.length) * Math.min(frequencyData.length, 120));
      const target = frequencyData[bin] / 255;
      this.smoothedLevels[i] += (target - this.smoothedLevels[i]) * 0.22;
      const level = this.smoothedLevels[i];
      const angle = (i / this.smoothedLevels.length) * Math.PI * 2 - Math.PI / 2;
      const inner = radius + 5;
      const outer = inner + 3 + level * 34;
      ctx.globalAlpha = 0.16 + level * 0.72;
      ctx.lineWidth = 1.5 + level * 2.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  async _testMicrophone() {
    this.testMicBtn.disabled = true;
    const original = this.testMicBtn.textContent;
    try {
      if (this.audio.isRecording) {
        this.testMicBtn.textContent = "Mikrofon ist aktiv ✓";
      } else {
        const supportError = globalThis.AudioCapture.getSupportError();
        if (supportError) throw supportError;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        this.testMicBtn.textContent = "Mikrofon funktioniert ✓";
      }
    } catch (error) {
      this.testMicBtn.textContent = error.message || "Mikrofontest fehlgeschlagen";
    } finally {
      setTimeout(() => {
        this.testMicBtn.textContent = original;
        this.testMicBtn.disabled = false;
      }, 2400);
    }
  }

  _showStartButton(label) {
    this.startBtn.textContent = label;
    this.startOverlay.classList.add("visible");
  }

  _closeSettings() {
    this.settingsPanel.classList.remove("open");
    this.settingsPanel.setAttribute("aria-hidden", "true");
  }

  _setState(state) {
    this.state = state;
    this.container.className = `state-${state.toLowerCase()} animation-${this.animationStyle}`;
  }

  _updateStateUI(title, detail = "") {
    this.stateIndicator.textContent = title;
    this.stateDetail.textContent = detail;
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.restartTimer);
    clearTimeout(this.pipelineRefreshTimer);
    this._stopVisualization();
    if (this.currentTtsSource) {
      try {
        this.currentTtsSource.stop();
      } catch (_error) {
        // Already stopped.
      }
    }
    this.ttsPlayer?.pause();
    this.audio.stop();
    this.pipeline?.disconnect();
  }
}

globalThis.VoiceAssistApp = VoiceAssistApp;

function startStandaloneApp() {
  if (!document.querySelector("#app") || window.__haVoiceApp) return;
  const app = new VoiceAssistApp();
  window.__haVoiceApp = app;
  window.app = app;
  app.init();
  window.addEventListener("beforeunload", () => app.destroy(), { once: true });
}

if (typeof document !== "undefined" && document.documentElement.dataset.voiceStandalone === "true") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startStandaloneApp, { once: true });
  } else {
    startStandaloneApp();
  }
}

if (typeof module !== "undefined") module.exports = { VoiceAssistApp };
