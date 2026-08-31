/**
 * Voice UI state machine and lifecycle management.
 */

const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
// Guards the hop to an HTTPS origin so a misconfigured secure URL cannot bounce
// the user between two origins forever. Stores the timestamp of the last hop.
const SECURE_REDIRECT_FLAG = "haVoiceSecureRedirect";
// A genuine origin bounce re-enters within a page load or two. Anything slower
// is a user reopening the panel, who must be allowed to hop again — a permanent
// flag would strand them on the insecure origin for the rest of the session.
const SECURE_REDIRECT_COOLDOWN_MS = 15000;
// Remembering the HTTPS origin lets the next start redirect immediately
// instead of booting the whole app first.
const SECURE_URL_CACHE_KEY = "haVoiceSecureUrl";
// Captured synchronously while this classic script is the one executing, so the
// avatar assets can be lazy-loaded from the same directory regardless of whether
// this app runs as the embedded HA panel (/ha_voice_app/main.js) or the
// standalone PWA (relative ./main.js from index.html) — both resolve here.
const MAIN_SCRIPT_SRC = globalThis.document?.currentScript?.src || "";

function loadAvatarScript(src) {
  return new Promise((resolve, reject) => {
    const existing = globalThis.document?.querySelector(`script[data-ha-voice-script="${src}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = globalThis.document.createElement("script");
    script.src = src;
    script.dataset.haVoiceScript = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Avatar-Asset fehlgeschlagen: ${src}`));
    globalThis.document.head.appendChild(script);
  });
}

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
    this._connectPipelinePromise = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.restartTimer = null;
    this.pipelineRefreshTimer = null;
    this.animationId = null;
    this.currentTtsSource = null;
    this.currentTtsPlaybackId = null;
    this.currentTtsObjectUrl = null;
    this.currentSpeechUtterance = null;
    this.ttsEnded = true;
    this.ttsWasRequested = false;
    this.runEnded = false;
    this.runFailed = false;
    this.animationStyle = "orb";
    this.avatarScene = null;
    this.avatarScenePromise = null;
    this.avatarAssemblyDone = false;
    this.avatarPendingState = null;
    this.ttsPlayback = "pipeline";
    this.ttsEngine = null;
    this.ttsText = "";
    this.persistentNotice = null;
    this.smoothedLevels = new Float32Array(72);
    this.pausedByUser = false;
    this.pausedForBackground = false;
    this.resumeAfterVisibility = false;
    this.deviceSelects = {};
    this.voiceVolume = 1;
    this.speechRate = 1;
    this.browserVoiceURI = "";
    this.secureUrl = null;
    this.vadSensitivity = "default";
    this.localVadStartedAt = null;
    this.localLastVoiceAt = null;
    this.localEndSent = false;
    this.navigate = (url) => window.location.replace(url);
    this.metrics = {
      vadStart: null,
      sttEnd: null,
      intentStart: null,
      ttsStart: null,
    };

    this.container = root.querySelector("#app");
    this.stateIndicator = root.querySelector("#stateIndicator");
    this.stateDetail = root.querySelector("#stateDetail");
    this.assistResponse = root.querySelector("#assistResponse");
    this.userTranscript = root.querySelector("#userTranscript");
    this.settingsPanel = root.querySelector("#settingsPanel");
    this.backBtn = root.querySelector("#backBtn");
    this.settingsBtn = root.querySelector("#settingsBtn");
    this.closeSettingsBtn = root.querySelector("#closeSettingsBtn");
    this.micToggleBtn = root.querySelector("#micToggleBtn");
    this.runDiagnosticsBtn = root.querySelector("#runDiagnosticsBtn");
    this.pipelineSetting = root.querySelector("#pipelineSetting");
    this.vadSetting = root.querySelector("#vadSetting");
    this.animationSetting = root.querySelector("#animationSetting");
    this.ttsSetting = root.querySelector("#ttsSetting");
    this.browserVoiceSetting = root.querySelector("#browserVoiceSetting");
    this.volumeSetting = root.querySelector("#volumeSetting");
    this.volumeValue = root.querySelector("#volumeValue");
    this.speechRateSetting = root.querySelector("#speechRateSetting");
    this.speechRateValue = root.querySelector("#speechRateValue");
    this.startOverlay = root.querySelector("#startOverlay");
    this.startBtn = root.querySelector("#startBtn");
    this.ttsPlayer = root.querySelector("#ttsPlayer");
    this.ttsSourceLabel = root.querySelector("#ttsSourceLabel");
    this.frequencyCanvas = root.querySelector("#frequencyRing");
    this.avatarCanvas = root.querySelector("#avatarCanvas");
    this.voiceCore = root.querySelector(".voice-core-svg");
    this.equalizerPaths = {
      main: root.querySelector("#equalizerMainPath"),
      clip: root.querySelector("#equalizerClipPath"),
      aura: root.querySelector("#equalizerAuraPath"),
      light: root.querySelector("#equalizerLightField"),
      dark: root.querySelector("#equalizerDarkField"),
      specular: root.querySelector("#equalizerSpecular"),
      waveOne: root.querySelector("#equalizerWaveOne"),
      waveTwo: root.querySelector("#equalizerWaveTwo"),
    };
    this.equalizerBands = new Float32Array(12);
    this.equalizerEnergy = 0.08;
    this.canvasCtx = this.frequencyCanvas.getContext("2d");

    if (!this.container) throw new Error("HA Voice Control UI wurde nicht gefunden.");
    this._loadLocalSettings();
    this._populateBrowserVoices();
    this._setupEventListeners();
    this._setupLegacyAuthListener();
  }

  _setupEventListeners() {
    this.audio.onAudioData = (data) => this._onAudioData(data);
    this.backBtn.addEventListener("click", () => this._goBack());
    this.startBtn.addEventListener("click", () => this.activate());
    this.settingsBtn.addEventListener("click", () => {
      this.settingsPanel.classList.add("open");
      this.settingsPanel.setAttribute("aria-hidden", "false");
    });
    this.closeSettingsBtn.addEventListener("click", () => this._closeSettings());
    this.micToggleBtn?.addEventListener("click", () => this._toggleMicrophone());
    this.runDiagnosticsBtn?.addEventListener("click", () => this._runDiagnostics());
    const settingMap = [
      [this.pipelineSetting, "pipeline"],
      [this.vadSetting, "vad_sensitivity"],
      [this.animationSetting, "animation_style"],
      [this.ttsSetting, "tts_playback"],
    ];
    for (const [element, key] of settingMap) {
      element?.addEventListener("change", () => this._updateDeviceSelect(key, element));
    }
    this.browserVoiceSetting?.addEventListener("change", () => {
      this.browserVoiceURI = this.browserVoiceSetting.value;
      this._saveLocalSettings();
    });
    this.volumeSetting?.addEventListener("input", () => {
      this.voiceVolume = Number(this.volumeSetting.value) / 100;
      this.volumeValue.textContent = `${Math.round(this.voiceVolume * 100)} %`;
      if (this.ttsPlayer) this.ttsPlayer.volume = this.voiceVolume;
      this._saveLocalSettings();
    });
    this.speechRateSetting?.addEventListener("input", () => {
      this.speechRate = Number(this.speechRateSetting.value);
      this.speechRateValue.textContent = `${this.speechRate.toFixed(1).replace(".", ",")}×`;
      this._saveLocalSettings();
    });
    this.visibilityHandler = () => this._handleVisibilityChange();
    globalThis.document?.addEventListener?.("visibilitychange", this.visibilityHandler);
    this.speechSynth = globalThis.speechSynthesis || globalThis.window?.speechSynthesis;
    this.voicesChangedHandler = () => this._populateBrowserVoices();
    this.speechSynth?.addEventListener?.("voiceschanged", this.voicesChangedHandler);
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

  _loadLocalSettings() {
    try {
      const storage = globalThis.localStorage;
      this.voiceVolume = Math.min(1, Math.max(0, Number(storage?.getItem("ha_voice_control_volume") ?? 1)));
      this.speechRate = Math.min(1.3, Math.max(0.7, Number(storage?.getItem("ha_voice_control_rate") ?? 1)));
      this.browserVoiceURI = storage?.getItem("ha_voice_control_voice") || "";
    } catch (_error) {
      // Private browsing or an embedded webview may reject local storage.
    }
    if (this.volumeSetting) this.volumeSetting.value = String(Math.round(this.voiceVolume * 100));
    if (this.volumeValue) this.volumeValue.textContent = `${Math.round(this.voiceVolume * 100)} %`;
    if (this.speechRateSetting) this.speechRateSetting.value = String(this.speechRate);
    if (this.speechRateValue) {
      this.speechRateValue.textContent = `${this.speechRate.toFixed(1).replace(".", ",")}×`;
    }
  }

  _saveLocalSettings() {
    try {
      globalThis.localStorage?.setItem("ha_voice_control_volume", String(this.voiceVolume));
      globalThis.localStorage?.setItem("ha_voice_control_rate", String(this.speechRate));
      globalThis.localStorage?.setItem("ha_voice_control_voice", this.browserVoiceURI);
    } catch (_error) {
      // Settings remain active for the current session.
    }
  }

  _populateBrowserVoices() {
    if (this.destroyed || !this.browserVoiceSetting) return;
    const synth = globalThis.speechSynthesis || globalThis.window?.speechSynthesis;
    const voices = synth?.getVoices?.() || [];
    const selected = this.browserVoiceURI;
    this.browserVoiceSetting.replaceChildren?.();
    const defaultOption = this.root.createElement?.("option") || globalThis.document?.createElement?.("option");
    if (defaultOption) {
      defaultOption.value = "";
      defaultOption.textContent = "Systemstandard";
      this.browserVoiceSetting.appendChild(defaultOption);
    }
    for (const voice of [...voices].sort((a, b) => a.name.localeCompare(b.name))) {
      const option = this.root.createElement?.("option") || globalThis.document?.createElement?.("option");
      if (!option) continue;
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})`;
      this.browserVoiceSetting.appendChild(option);
    }
    this.browserVoiceSetting.value = voices.some((voice) => voice.voiceURI === selected)
      ? selected
      : "";
  }

  async _updateDeviceSelect(key, element) {
    const config = this.deviceSelects[key];
    if (!config?.entity_id || !element?.value) return;
    element.disabled = true;
    try {
      await this.pipeline?.selectOption(config.entity_id, element.value);
      this._haptic("selection");
    } catch (error) {
      element.value = config.value || "";
      this._updateStateUI("Einstellung fehlgeschlagen", error.message || "Auswahl konnte nicht gespeichert werden");
    } finally {
      element.disabled = false;
    }
  }

  _renderDeviceSettings(selects = {}) {
    this.deviceSelects = selects;
    const controls = {
      pipeline: this.pipelineSetting,
      vad_sensitivity: this.vadSetting,
      animation_style: this.animationSetting,
      tts_playback: this.ttsSetting,
    };
    const labels = {
      preferred: "Bevorzugt",
      default: "Standard",
      aggressive: "Aggressiv",
      relaxed: "Entspannt",
      orb: "Realistische Liquid-Kugel",
      liquid_equalizer: "Liquid Equalizer",
      spectrum: "Audio-Spektrum",
      aurora: "Aurora-Fluss",
      pulse: "Puls-Ringe",
      constellation: "Sternbild",
      minimal: "Minimalistisch",
      avatar: "Partikel-Avatar",
      pipeline: "Aus Assist-Pipeline",
      browser: "iPhone-/Browser-Stimme",
      muted: "Stumm",
    };
    for (const [key, element] of Object.entries(controls)) {
      if (!element) continue;
      const config = selects[key] || {};
      element.replaceChildren?.();
      for (const value of config.options || []) {
        const option = this.root.createElement?.("option") || globalThis.document?.createElement?.("option");
        if (!option) continue;
        option.value = value;
        option.textContent = labels[value] || value;
        element.appendChild(option);
      }
      element.value = config.value || "";
      element.disabled = !config.entity_id || !(config.options || []).length;
    }
  }

  _haptic(type = "light") {
    try {
      const event = new CustomEvent("haptic", {
        detail: type,
        bubbles: true,
        composed: true,
      });
      this.container.dispatchEvent?.(event);
    } catch (_error) {
      // CustomEvent is unavailable in a few test and legacy environments.
    }
    globalThis.navigator?.vibrate?.(type === "success" ? [12, 35, 18] : 12);
  }

  _setDiagnostic(id, text, status = "neutral") {
    const element = this.root.querySelector?.(`#${id}`);
    if (!element) return;
    element.textContent = text;
    element.dataset.status = status;
  }

  _setLatency(id, startedAt, endedAt = this._now()) {
    const element = this.root.querySelector?.(`#${id}`);
    if (!element || !startedAt) return;
    element.textContent = `${Math.max(0, Math.round(endedAt - startedAt))} ms`;
  }

  _now() {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  _syncMicToggle() {
    if (!this.micToggleBtn) return;
    const paused = !this.audio.isRecording;
    this.micToggleBtn.classList.toggle?.("paused", paused);
    this.micToggleBtn.setAttribute(
      "aria-label",
      paused ? "Mikrofon fortsetzen" : "Mikrofon pausieren"
    );
    this.micToggleBtn.setAttribute(
      "title",
      paused ? "Mikrofon fortsetzen" : "Mikrofon pausieren"
    );
  }

  async _toggleMicrophone() {
    if (this.starting) return;
    if (this.audio.isRecording) {
      this._pauseListening();
      return;
    }
    this.pausedByUser = false;
    this.pausedForBackground = false;
    this.resumeAfterVisibility = false;
    this._haptic("light");
    await this.activate();
  }

  _pauseListening({ background = false } = {}) {
    clearTimeout(this.restartTimer);
    clearTimeout(this.pipelineRefreshTimer);
    this.restartTimer = null;
    this.pipeline?.endAudio();
    this.audio.stop();
    this._stopVisualization();
    this.voiceCore?.pauseAnimations?.();
    if (background) {
      this.pausedForBackground = true;
      this.resumeAfterVisibility = this.userActivated && !this.pausedByUser;
      this._updateStateUI("Im Hintergrund pausiert", "Mikrofon und Animation sind angehalten");
    } else {
      this.pausedByUser = true;
      this.userActivated = false;
      this.resumeAfterVisibility = false;
      this._updateStateUI("Mikrofon pausiert", "Tippe auf das Mikrofon, um fortzufahren");
      this._haptic("selection");
    }
    this._setState("PAUSED");
    this._setDiagnostic("diagMic", background ? "Hintergrundpause" : "Pausiert", "warn");
    this._syncMicToggle();
  }

  _handleVisibilityChange() {
    const hidden = globalThis.document?.visibilityState === "hidden";
    if (hidden) {
      this.avatarScene?.pause?.();
    } else {
      this.avatarScene?.resume?.();
    }
    if (hidden && this.audio.isRecording) {
      this._pauseListening({ background: true });
      return;
    }
    if (!hidden && this.resumeAfterVisibility && !this.pausedByUser) {
      this.resumeAfterVisibility = false;
      this.pausedForBackground = false;
      this.activate({ automatic: true });
    }
  }

  async _runDiagnostics() {
    if (!this.runDiagnosticsBtn) return;
    const original = this.runDiagnosticsBtn.textContent;
    this.runDiagnosticsBtn.disabled = true;
    this.runDiagnosticsBtn.textContent = "System wird geprüft …";
    this._setDiagnostic(
      "diagConnection",
      this.pipeline?.connected ? "Verbunden" : "Nicht verbunden",
      this.pipeline?.connected ? "ok" : "error"
    );

    try {
      const supportError = globalThis.AudioCapture.getSupportError();
      if (supportError) throw supportError;
      if (this.audio.isRecording) {
        this._setDiagnostic("diagMic", "Aktiv", "ok");
      } else {
        const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        this._setDiagnostic("diagMic", "Berechtigung erteilt", "ok");
      }
    } catch (error) {
      this._setDiagnostic("diagMic", error.message || "Nicht verfügbar", "error");
    }

    const pipelineConfig = this.deviceSelects.pipeline;
    this._setDiagnostic(
      "diagPipeline",
      pipelineConfig?.value || "Nicht ausgewählt",
      pipelineConfig?.value ? "ok" : "error"
    );
    this._setDiagnostic(
      "diagStt",
      this.metrics.sttEnd ? "Letzter Lauf erfolgreich" : "Bereit – noch nicht verwendet",
      this.metrics.sttEnd ? "ok" : "neutral"
    );
    const ttsDescription = this.ttsPlayback === "muted"
      ? "Stummgeschaltet"
      : (this.ttsPlayback === "browser" ? "iPhone-/Browser-Stimme" : this.ttsEngine);
    this._setDiagnostic(
      "diagTts",
      ttsDescription || "Nicht konfiguriert",
      ttsDescription ? (this.ttsPlayback === "muted" ? "warn" : "ok") : "error"
    );
    const audioReady = Boolean(
      this.audio.audioContext && this.audio.audioContext.state !== "closed"
    ) || this.ttsPlayer?.dataset?.primed === "true";
    this._setDiagnostic(
      "diagAudio",
      audioReady ? "Wiedergabe bereit" : "Wird beim ersten Start aktiviert",
      audioReady ? "ok" : "neutral"
    );
    this.runDiagnosticsBtn.textContent = "Systemcheck abgeschlossen ✓";
    this._haptic("success");
    setTimeout(() => {
      this.runDiagnosticsBtn.textContent = original;
      this.runDiagnosticsBtn.disabled = false;
    }, 2200);
  }

  async init() {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;
    this._setState("CONNECTING");
    this._updateStateUI("Verbinden", "Home Assistant wird vorbereitet …");

    // Hop to HTTPS before building the UI or opening a socket. Doing it after
    // the pipeline connected made the user watch the app boot once and then
    // reload — the "loads twice" symptom on the local network.
    if (!window.isSecureContext) {
      this.secureUrl = this.secureUrl || this._cachedSecureUrl();
      if (this._redirectToSecureUrl()) return;
    }

    try {
      await this._connectPipeline();
      const supportError = globalThis.AudioCapture.getSupportError();
      if (supportError) {
        // The config we just received may reveal a secure URL we did not know
        // about on the very first run.
        if (!window.isSecureContext && this._redirectToSecureUrl()) return;
        this._handleError(this._describeInsecureContext(supportError), {
          recoverable: false,
        });
        return;
      }
      this._setState("READY");
      this._updateStateUI("Mikrofon starten", "Automatische Aktivierung wird versucht …");
      this._showStartButton("Mikrofon starten");
      await this.activate({ automatic: true });
    } catch (error) {
      this.initialized = false;
      this._handleError(error, { recoverable: true });
    }
  }

  async activate({ automatic = false } = {}) {
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
      this.pausedByUser = false;
      this.pausedForBackground = false;
      this.voiceCore?.unpauseAnimations?.();
      this.startOverlay.classList.remove("visible");
      this._syncMicToggle();
      this._setDiagnostic("diagMic", "Aktiv", "ok");
      await this._startListening();
    } catch (error) {
      if (automatic && !this.audio.isRecording) {
        console.info("Automatic microphone activation was blocked", error);
        this.userActivated = false;
        this._setState("READY");
        this._updateStateUI(
          "Bereit",
          "Falls iOS den Autostart blockiert: einmal auf Mikrofon starten tippen"
        );
        this._showStartButton("Mikrofon starten");
      } else {
        this._handleError(error, { recoverable: false });
        this._showStartButton("Erneut versuchen");
      }
    } finally {
      this.starting = false;
      this.startBtn.disabled = false;
    }
  }

  // activate() and _reconnect() are guarded by separate flags (this.starting,
  // this.reconnecting) and can race each other into this method. Both callers
  // want the same live pipeline, so fold concurrent calls into one in-flight
  // promise instead of letting two connect attempts stomp on this.pipeline.
  _connectPipeline() {
    if (!this._connectPipelinePromise) {
      this._connectPipelinePromise = this._doConnectPipeline().finally(() => {
        this._connectPipelinePromise = null;
      });
    }
    return this._connectPipelinePromise;
  }

  async _doConnectPipeline() {
    const { token, hassUrl } = await this._getAuth();
    this.pipeline?.disconnect();
    this.pipeline = new globalThis.HAVoicePipeline(hassUrl, token);
    this.pipeline.onSttStart = () => this._onSttStart();
    this.pipeline.onVadStart = () => this._onVadStart();
    this.pipeline.onSttEnd = (data) => this._onSttEnd(data);
    this.pipeline.onIntentStart = () => this._onIntentStart();
    this.pipeline.onIntentEnd = (data) => this._onIntentEnd(data);
    this.pipeline.onTtsStart = (data) => this._onTtsStart(data);
    this.pipeline.onTtsEnd = (data) => this._onTtsEnd(data);
    this.pipeline.onRunEnd = (data) => this._onRunEnd(data);
    this.pipeline.onConfiguration = (config) => this._applyRunConfiguration(config);
    this.pipeline.onError = (error) => this._handleError(error, { recoverable: true });
    await this.pipeline.connect();
    const configuration = await this.pipeline.subscribeConfiguration();
    this._applyRunConfiguration(configuration || {});
    this._setDiagnostic("diagConnection", "Verbunden", "ok");
  }

  _securePanelUrl() {
    if (!this.secureUrl) return null;
    try {
      const target = new URL(this.secureUrl);
      if (target.protocol !== "https:" || target.origin === window.location.origin) return null;
      target.pathname = window.location.pathname;
      target.search = window.location.search;
      target.hash = window.location.hash;
      return target.href;
    } catch (_error) {
      return null;
    }
  }

  _redirectToSecureUrl() {
    const target = this._securePanelUrl();
    if (!target) return false;
    // Suppress only an immediate second hop. If the HTTPS origin bounces us
    // straight back, one retry is enough to prove it is broken; a user who
    // reopens the panel later still gets carried across.
    if (this._secureRedirectAttempted()) return false;
    this._markSecureRedirectAttempted();
    this._setState("CONNECTING");
    this._updateStateUI("Sichere Verbindung", "Wechsel zur HTTPS-Adresse …");
    this.navigate(target);
    return true;
  }

  _describeInsecureContext(error) {
    if (window.isSecureContext) return error;
    const target = this.secureUrl || this._cachedSecureUrl();
    if (target) {
      return new Error(
        `Mikrofonzugriff benötigt HTTPS. Öffne Home Assistant unter ${target} statt über die lokale http-Adresse.`
      );
    }
    return new Error(
      "Mikrofonzugriff benötigt HTTPS. Diese Home-Assistant-Instanz hat keine HTTPS-Adresse — richte Nabu Casa oder ein SSL-Zertifikat ein."
    );
  }

  _secureRedirectAttempted() {
    try {
      const raw = globalThis.sessionStorage?.getItem(SECURE_REDIRECT_FLAG);
      if (!raw) return false;
      const last = Number(raw);
      // A pre-1.2.2 flag stored the string "1"; treat anything unparsable as
      // stale rather than as a permanent block.
      if (!Number.isFinite(last)) return false;
      return Date.now() - last < SECURE_REDIRECT_COOLDOWN_MS;
    } catch (_error) {
      return false;
    }
  }

  _markSecureRedirectAttempted() {
    try {
      globalThis.sessionStorage?.setItem(SECURE_REDIRECT_FLAG, String(Date.now()));
    } catch (_error) {
      // Private mode without storage — the protocol check still prevents loops.
    }
  }

  _cachedSecureUrl() {
    try {
      return globalThis.localStorage?.getItem(SECURE_URL_CACHE_KEY) || null;
    } catch (_error) {
      return null;
    }
  }

  _cacheSecureUrl(url) {
    if (!url) return;
    try {
      globalThis.localStorage?.setItem(SECURE_URL_CACHE_KEY, url);
    } catch (_error) {
      // Caching is an optimisation; a missing cache only costs one extra hop.
    }
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
    throw new Error("Keine Home-Assistant-Anmeldung verfügbar. Öffne HA Voice Control über die Seitenleiste.");
  }

  async _startListening() {
    if (!this.pipeline?.connected || !this.audio.isRecording || this.destroyed) return;
    clearTimeout(this.restartTimer);
    this.currentTtsSource = null;
    this.currentTtsPlaybackId = null;
    this.ttsEnded = true;
    this.ttsWasRequested = false;
    this.ttsText = "";
    this.runEnded = false;
    this.runFailed = false;
    this.localVadStartedAt = null;
    this.localLastVoiceAt = null;
    this.localEndSent = false;
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
      if (this.state === "HEARING") this._trackLocalEndOfSpeech(data);
    }
  }

  _trackLocalEndOfSpeech(data) {
    if (this.localEndSent || !this.localVadStartedAt || !data?.length) return;
    const now = this._now();
    let energy = 0;
    let samples = 0;
    for (let index = 0; index < data.length; index += 8) {
      const sample = data[index] / 32768;
      energy += sample * sample;
      samples++;
    }
    const rms = Math.sqrt(energy / Math.max(1, samples));
    if (rms >= 0.012) this.localLastVoiceAt = now;

    const silenceTimeout = {
      aggressive: 450,
      default: 700,
      relaxed: 1000,
    }[this.vadSensitivity] || 700;
    const lastVoice = this.localLastVoiceAt || this.localVadStartedAt;
    if (now - this.localVadStartedAt < 350 || now - lastVoice < silenceTimeout) return;

    this.localEndSent = true;
    this.pipeline?.endAudio();
    this._setState("PROCESSING");
    this._updateStateUI("Wird verarbeitet", "Satzende erkannt – Aktion wird vorbereitet …");
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
    this.metrics.vadStart = this._now();
    this.metrics.sttEnd = null;
    this.metrics.intentStart = null;
    this.metrics.ttsStart = null;
    this.localVadStartedAt = this._now();
    this.localLastVoiceAt = this.localVadStartedAt;
    this.localEndSent = false;
    this._setState("HEARING");
    this._updateStateUI("Ich höre dich", "Sprich deinen Satz zu Ende");
    this._setDiagnostic("diagStt", "Sprache erkannt", "ok");
    this._haptic("light");
  }

  _onSttEnd(data) {
    const transcript = data.transcript?.trim() || "";
    this.metrics.sttEnd = this._now();
    this._setLatency("latencyStt", this.metrics.vadStart, this.metrics.sttEnd);
    this._setDiagnostic("diagStt", transcript ? "Erfolgreich" : "Ohne Text", transcript ? "ok" : "warn");
    this.userTranscript.textContent = transcript ? `„${transcript}“` : "";
    this.pipeline?.endAudio();
  }

  _onIntentStart() {
    this.metrics.intentStart = this._now();
    this._setState("PROCESSING");
    this._updateStateUI("Wird verarbeitet", "Home Assistant denkt nach …");
  }

  _onIntentEnd(data) {
    this.assistResponse.textContent = data.responseText || "";
    this._setLatency("latencyIntent", this.metrics.intentStart);
  }

  _onTtsStart(data = {}) {
    this.ttsWasRequested = true;
    this.metrics.ttsStart = this._now();
    this.ttsText = data.text?.trim() || this.assistResponse.textContent;
    this._setState("SPEAKING");
    this._updateStateUI("Antwort", "Home Assistant spricht");
  }

  _onTtsEnd(data) {
    this._setLatency("latencyTts", this.metrics.ttsStart);
    this._setDiagnostic("diagAudio", "Wiedergabe gestartet", "ok");
    if (this.ttsPlayback === "muted") {
      this.ttsEnded = true;
      this.pipeline?.notifyTtsFinished();
      this._updateStateUI("Antwort", "Sprachausgabe ist in den Geräte-Einstellungen stummgeschaltet");
      return;
    }
    if (this.ttsPlayback === "browser") {
      this._playBrowserTTS(this.ttsText || this.assistResponse.textContent);
      return;
    }
    if (data.url) {
      this._playTTS(data.url);
    } else {
      this._playBrowserTTS(this.ttsText || this.assistResponse.textContent);
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
      if (this.ttsPlayback !== "muted") {
        this._playBrowserTTS(this.assistResponse.textContent);
      } else {
        this._updateStateUI("Antwort", "Sprachausgabe ist stummgeschaltet");
      }
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
      if (this.currentTtsObjectUrl) {
        URL.revokeObjectURL(this.currentTtsObjectUrl);
        this.currentTtsObjectUrl = null;
      }
      this.currentTtsSource = null;
      this.currentSpeechUtterance = null;
      this.currentTtsPlaybackId = null;
      this.ttsEnded = true;
      this.pipeline?.notifyTtsFinished();
      this._setDiagnostic("diagAudio", "Wiedergabe erfolgreich", "ok");
      this._haptic("success");
      if (this.runEnded) this._scheduleNextListening();
    };

    const url = new URL(ttsUrl, this.latestHassUrl || window.location.origin);
    let audioData;
    try {
      audioData = await this._fetchTtsAudio(url);
    } catch (error) {
      this._reportTtsFailure(error, finish);
      return;
    }
    let fallbackPromise = null;
    let failureReported = false;
    const reportFailure = (error) => {
      if (failureReported) return;
      failureReported = true;
      this._reportTtsFailure(error, finish);
    };
    const playFallback = () => {
      fallbackPromise ||= this._playTtsWithAudioContext(
        audioData.arrayBuffer.slice(0),
        playbackId,
        finish
      );
      return fallbackPromise;
    };
    if (this.ttsPlayer) {
      try {
        this.ttsPlayer.onended = finish;
        this.ttsPlayer.onerror = () => {
          if (this.currentTtsPlaybackId === playbackId) {
            playFallback().catch((error) => {
              reportFailure(error);
            });
          }
        };
        this.ttsPlayer.volume = this.voiceVolume;
        this.currentTtsObjectUrl = URL.createObjectURL(new Blob(
          [audioData.arrayBuffer],
          { type: audioData.contentType }
        ));
        this.ttsPlayer.src = this.currentTtsObjectUrl;
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
      reportFailure(error);
    }
  }

  async _fetchTtsAudio(url) {
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
      throw new Error(`Home Assistant konnte TTS nicht erzeugen (${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer.byteLength) {
      throw new Error("Home Assistant hat eine leere TTS-Datei geliefert");
    }
    return {
      arrayBuffer,
      contentType: response.headers?.get?.("content-type") || "audio/mpeg",
    };
  }

  async _playTtsWithAudioContext(arrayBuffer, playbackId, finish) {
    const context = this.audio.audioContext;
    if (!context || context.state === "closed") {
      throw new Error("AudioContext ist nicht aktiv");
    }
    if (context.state === "suspended") await context.resume();

    const audioBuffer = await this._decodeAudioData(context, arrayBuffer);
    if (this.currentTtsPlaybackId !== playbackId) return;

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    if (this.audio.analyser) source.connect(this.audio.analyser);
    if (context.createGain) {
      const gain = context.createGain();
      gain.gain.value = this.voiceVolume;
      source.connect(gain);
      gain.connect(context.destination);
    } else {
      source.connect(context.destination);
    }
    source.onended = finish;
    this.currentTtsSource = source;
    source.start(0);
  }

  _reportTtsFailure(error, finish) {
    console.error("TTS playback failed", error);
    if (this._speakWithBrowserVoice(
      this.ttsText || this.assistResponse.textContent,
      finish
    )) {
      this.persistentNotice = "Home-Assistant-TTS nicht verfügbar – iPhone-Stimme wird verwendet";
      this._updateStateUI("Antwort", this.persistentNotice);
      return;
    }
    this.persistentNotice = `TTS-Fehler: ${error.message || "unbekannter Fehler"}`;
    this._updateStateUI("Antwort", this.persistentNotice);
    finish();
  }

  _playBrowserTTS(text) {
    this.ttsEnded = false;
    const playbackId = Symbol("browser-tts-playback");
    this.currentTtsPlaybackId = playbackId;
    let finished = false;
    const finish = () => {
      if (finished || this.currentTtsPlaybackId !== playbackId) return;
      finished = true;
      this.currentSpeechUtterance = null;
      this.currentTtsPlaybackId = null;
      this.ttsEnded = true;
      this.pipeline?.notifyTtsFinished();
      this._setDiagnostic("diagAudio", "Wiedergabe erfolgreich", "ok");
      this._haptic("success");
      if (this.runEnded) this._scheduleNextListening();
    };
    if (this._speakWithBrowserVoice(text, finish)) {
      this.persistentNotice = null;
      this._updateStateUI("Antwort", "Die iPhone-Stimme spricht");
      return;
    }
    this.persistentNotice = "TTS-Fehler: Auf diesem Gerät ist keine Browser-Stimme verfügbar";
    this._updateStateUI("Antwort", this.persistentNotice);
    finish();
  }

  _speakWithBrowserVoice(text, finish) {
    const synth = globalThis.speechSynthesis || window.speechSynthesis;
    const Utterance = globalThis.SpeechSynthesisUtterance || window.SpeechSynthesisUtterance;
    if (!synth || !Utterance || !text?.trim()) return false;
    try {
      const utterance = new Utterance(text.trim());
      utterance.lang = globalThis.navigator?.language || "de-DE";
      utterance.rate = this.speechRate;
      utterance.volume = this.voiceVolume;
      const selectedVoice = synth.getVoices?.().find(
        (voice) => voice.voiceURI === this.browserVoiceURI
      );
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.onend = finish;
      utterance.onerror = (event) => {
        this.persistentNotice = `TTS-Fehler: iPhone-Stimme fehlgeschlagen (${event.error || "unbekannt"})`;
        this._updateStateUI("Antwort", this.persistentNotice);
        finish();
      };
      this.currentSpeechUtterance = utterance;
      synth.cancel();
      synth.speak(utterance);
      return true;
    } catch (error) {
      console.warn("Browser speech synthesis failed", error);
      return false;
    }
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
      this.ttsPlayer.volume = this.voiceVolume;
      URL.revokeObjectURL(objectUrl);
    }).catch((error) => {
      console.debug("TTS player priming was not accepted", error);
      URL.revokeObjectURL(objectUrl);
    });
  }

  _applyRunConfiguration(config = {}) {
    const allowedStyles = new Set([
      "orb", "liquid_equalizer", "spectrum", "aurora", "pulse", "constellation", "minimal", "avatar",
    ]);
    const previousStyle = this.animationStyle;
    this.animationStyle = allowedStyles.has(config.animation_style)
      ? config.animation_style
      : "orb";
    if (this.animationStyle !== previousStyle) {
      if (this.animationStyle === "avatar") {
        this._ensureAvatarScene();
      } else if (previousStyle === "avatar") {
        this._teardownAvatarScene();
      }
    }
    this.ttsPlayback = ["pipeline", "browser", "muted"].includes(config.tts_playback)
      ? config.tts_playback
      : "pipeline";
    this.ttsEngine = config.tts_engine || null;
    this.secureUrl = config.secure_url || this.secureUrl;
    this._cacheSecureUrl(this.secureUrl);
    if (!this.persistentNotice?.startsWith("TTS-Fehler:")) {
      this.persistentNotice = null;
    }
    if (!this.ttsEngine && this.ttsPlayback === "pipeline") {
      this.persistentNotice = "Keine TTS-Quelle in der gewählten Assist-Pipeline";
    }
    if (this.ttsSourceLabel) {
      this.ttsSourceLabel.textContent = this.ttsPlayback === "muted"
        ? "Stummgeschaltet"
        : (this.ttsPlayback === "browser"
          ? "iPhone-/Browser-Stimme"
          : (this.ttsEngine || "Nicht konfiguriert"));
    }
    this._renderDeviceSettings(config.selects || this.deviceSelects);
    this.vadSensitivity = this.deviceSelects.vad_sensitivity?.value || this.vadSensitivity;
    const pipelineName = this.deviceSelects.pipeline?.value;
    this._setDiagnostic(
      "diagPipeline",
      pipelineName || "Nicht ausgewählt",
      pipelineName ? "ok" : "error"
    );
    const ttsName = this.ttsPlayback === "muted"
      ? "Stummgeschaltet"
      : (this.ttsPlayback === "browser" ? "iPhone-/Browser-Stimme" : this.ttsEngine);
    this._setDiagnostic(
      "diagTts",
      ttsName || "Nicht konfiguriert",
      ttsName ? (this.ttsPlayback === "muted" ? "warn" : "ok") : "error"
    );
    this._setState(this.state);
  }

  _scheduleNextListening() {
    if (this.restartTimer || this.destroyed || this.pausedByUser || this.pausedForBackground) return;
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
    console.error("HA Voice Control error", normalized);
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
    globalThis.speechSynthesis?.cancel();
    if (this.currentTtsObjectUrl) URL.revokeObjectURL(this.currentTtsObjectUrl);
    this.currentTtsObjectUrl = null;
    this.currentTtsSource = null;
    this.currentTtsPlaybackId = null;
    this.ttsEnded = true;
    this._setState("ERROR");
    this._updateStateUI("Verbindung unterbrochen", normalized.message);
    this._setDiagnostic("diagConnection", "Fehler", "error");
    this._stopVisualization();
    this.pipeline?.endAudio();

    if (/token|password|auth|anmeldung/i.test(normalized.message)) {
      this.latestToken = null;
    }
    if (recoverable) this._scheduleReconnect();
  }

  _scheduleReconnect() {
    if (this.reconnectTimer || this.reconnecting || this.destroyed) return;
    // Back off instead of hammering Home Assistant every 3s: a failed retry
    // feeds straight back into this method, so a flat delay turns an outage
    // into an endless tight loop.
    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts
    );
    const jittered = Math.round(delay * (0.75 + Math.random() * 0.5));
    this.reconnectAttempts += 1;
    const seconds = Math.round(jittered / 1000);
    this._updateStateUI(
      "Verbindung unterbrochen",
      `Neuer Versuch in ${seconds} Sekunde${seconds === 1 ? "" : "n"} …`
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._reconnect();
    }, jittered);
  }

  async _reconnect() {
    if (this.reconnecting || this.destroyed) return;
    this.reconnecting = true;
    let retryError = null;
    this._setState("CONNECTING");
    this._updateStateUI("Neu verbinden", "Home Assistant wird kontaktiert …");
    try {
      await this._connectPipeline();
      this.reconnectAttempts = 0;
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
    if (this.animationStyle === "avatar") {
      if (frequencyData.length && this.avatarScene) {
        let sum = 0;
        for (let i = 0; i < frequencyData.length; i++) sum += frequencyData[i];
        this.avatarScene.setAudioLevel?.(sum / frequencyData.length / 255);
      }
      return;
    }
    if (this.animationStyle === "liquid_equalizer") {
      this._drawLiquidEqualizer(frequencyData);
      return;
    }
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
      const level = Math.sqrt(this.smoothedLevels[i]);
      const angle = (i / this.smoothedLevels.length) * Math.PI * 2 - Math.PI / 2;
      const inner = radius + 8;
      const outer = inner + 2 + level * 25;
      ctx.globalAlpha = 0.1 + level * 0.58;
      ctx.lineWidth = 1.1 + level * 1.65;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.13;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.055;
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  _smoothClosedPath(points) {
    const last = points[points.length - 1];
    const first = points[0];
    const firstMid = {
      x: (first.x + last.x) / 2,
      y: (first.y + last.y) / 2,
    };
    let path = `M ${firstMid.x.toFixed(2)} ${firstMid.y.toFixed(2)}`;
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const next = points[(index + 1) % points.length];
      const middleX = (point.x + next.x) / 2;
      const middleY = (point.y + next.y) / 2;
      path += ` Q ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
      path += ` ${middleX.toFixed(2)} ${middleY.toFixed(2)}`;
    }
    return `${path} Z`;
  }

  _drawLiquidEqualizer(frequencyData) {
    const paths = this.equalizerPaths;
    if (!paths?.main) return;
    const time = this._now() / 1000;
    const hearing = this.state === "HEARING";
    const speaking = this.state === "SPEAKING";
    const active = hearing || speaking;
    const usableBins = Math.min(frequencyData.length, 120);
    let average = 0;
    for (let index = 2; index < usableBins; index++) average += frequencyData[index];
    average = usableBins > 2 ? average / (usableBins - 2) / 255 : 0;

    const microphonePulse = Math.min(1, Math.max(0, (average - 0.018) * 6.5));
    const syntheticPulse = speaking
      ? 0.38 + 0.62 * Math.abs(Math.sin(time * 3.9) * Math.cos(time * 1.75))
      : 0;
    const voicePulse = hearing
      ? microphonePulse
      : (speaking && microphonePulse > 0.1 ? microphonePulse : syntheticPulse);
    const targetEnergy = active ? 0.14 + voicePulse * 0.86 : 0.08;
    this.equalizerEnergy += (targetEnergy - this.equalizerEnergy) * (active ? 0.16 : 0.06);

    for (let band = 0; band < this.equalizerBands.length; band++) {
      const startBin = Math.floor((band / this.equalizerBands.length) * usableBins);
      const endBin = Math.max(
        startBin + 1,
        Math.floor(((band + 1) / this.equalizerBands.length) * usableBins)
      );
      let bandAverage = 0;
      for (let bin = startBin; bin < endBin; bin++) bandAverage += frequencyData[bin] || 0;
      bandAverage = (bandAverage / Math.max(1, endBin - startBin)) / 255;
      const measuredBand = Math.min(1, Math.max(0, (bandAverage - 0.018) * 4.8));
      const frequency = speaking ? 2.8 + band * 0.13 : 4.1 + band * 0.19;
      const phase = band * 1.73 + Math.sin(time * 0.61 + band) * 0.7;
      const simulatedBand = Math.abs(Math.sin(time * frequency + phase)) * this.equalizerEnergy;
      const targetBand = active
        ? (measuredBand > 0.08 ? measuredBand : simulatedBand * voicePulse)
        : 0;
      this.equalizerBands[band] += (targetBand - this.equalizerBands[band])
        * (active ? 0.24 : 0.08);
    }

    const points = [];
    const count = 56;
    const baseRadius = 63 + this.equalizerEnergy * 3;
    const equalizerScale = active ? 0.9 + voicePulse * 0.18 : 1;
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const bandPosition = (index / count) * this.equalizerBands.length;
      const bandIndex = Math.floor(bandPosition) % this.equalizerBands.length;
      const nextBand = (bandIndex + 1) % this.equalizerBands.length;
      const bandMix = bandPosition - Math.floor(bandPosition);
      const bandEnergy = this.equalizerBands[bandIndex] * (1 - bandMix)
        + this.equalizerBands[nextBand] * bandMix;
      const deformation = active
        ? (bandEnergy - this.equalizerEnergy * 0.3) * (10 + voicePulse * 6)
        : 0;
      const slowFlow = Math.sin(angle * 2 + time * 0.72)
        * (3.1 + this.equalizerEnergy * 7.8);
      const crossFlow = Math.sin(angle * 3 - time * 1.06 + 0.8)
        * (1.8 + this.equalizerEnergy * 4.7);
      const surface = Math.sin(angle * 5 + time * 1.55) * this.equalizerEnergy * 2.4;
      const breathing = Math.sin(time * 1.28) * 1.4;
      const radius = (baseRadius + slowFlow + crossFlow + surface + breathing)
        * equalizerScale + deformation;
      const stretchX = 1 + Math.sin(time * 0.64) * 0.04
        + this.equalizerEnergy * Math.sin(time * 2.1) * 0.075;
      const stretchY = 1 + Math.cos(time * 0.58) * 0.035
        - this.equalizerEnergy * Math.sin(time * 2.1) * 0.06;
      points.push({
        x: 100 + Math.cos(angle) * radius * stretchX,
        y: 100 + Math.sin(angle) * radius * stretchY,
      });
    }

    const path = this._smoothClosedPath(points);
    for (const element of [paths.main, paths.clip, paths.aura]) {
      element?.setAttribute("d", path);
    }
    const auraScale = 1.12 + this.equalizerEnergy * 0.08;
    paths.aura?.setAttribute(
      "transform",
      `translate(100 100) scale(${auraScale.toFixed(3)}) translate(-100 -100)`
    );
    const driftX = Math.sin(time * 0.53) * 10 + this.equalizerEnergy * Math.sin(time * 2.7) * 5;
    const driftY = Math.cos(time * 0.47) * 8 + this.equalizerEnergy * Math.cos(time * 2.2) * 4;
    paths.light?.setAttribute("transform", `translate(${driftX.toFixed(2)} ${driftY.toFixed(2)})`);
    paths.dark?.setAttribute(
      "transform",
      `translate(${(-driftX * 0.72).toFixed(2)} ${(-driftY * 0.58).toFixed(2)})`
    );
    paths.specular?.setAttribute(
      "transform",
      `translate(${(driftX * 0.28).toFixed(2)} ${(driftY * 0.22).toFixed(2)}) rotate(-28 67 57)`
    );
    paths.waveOne?.setAttribute(
      "transform",
      `translate(${(Math.sin(time * 0.8) * 7).toFixed(2)} ${(Math.cos(time * 0.9) * 5).toFixed(2)})`
    );
    paths.waveTwo?.setAttribute(
      "transform",
      `translate(${(Math.sin(time * 0.64 + 2) * -6).toFixed(2)} ${(Math.cos(time * 0.7) * -4).toFixed(2)})`
    );
  }

  _showStartButton(label) {
    this.startBtn.textContent = label;
    this.startOverlay.classList.add("visible");
  }

  _goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/");
  }

  _closeSettings() {
    this.settingsPanel.classList.remove("open");
    this.settingsPanel.setAttribute("aria-hidden", "true");
  }

  _setState(state) {
    this.state = state;
    this.container.className = `state-${state.toLowerCase()} animation-${this.animationStyle}`;
    this._syncMicToggle();
    this._forwardAvatarState(state);
  }

  _forwardAvatarState(state) {
    if (this.animationStyle !== "avatar") return;
    const avatarState = {
      CONNECTING: "IDLE",
      STARTING: "IDLE",
      READY: "IDLE",
      PAUSED: "IDLE",
      LISTENING: "LISTENING",
      HEARING: "LISTENING",
      PROCESSING: "THINKING",
      SPEAKING: "SPEAKING",
      ERROR: "ERROR",
    }[state];
    if (!avatarState) return;
    if (!this.avatarAssemblyDone) {
      this.avatarPendingState = avatarState;
      return;
    }
    this.avatarScene?.setState?.(avatarState);
  }

  _ensureAvatarScene() {
    if (this.avatarScenePromise || !this.avatarCanvas) return this.avatarScenePromise;
    const jsBase = MAIN_SCRIPT_SRC ? new URL("./js/", MAIN_SCRIPT_SRC) : null;
    this.avatarScenePromise = (async () => {
      if (!jsBase) throw new Error("Avatar-Basis-URL konnte nicht ermittelt werden.");
      await loadAvatarScript(new URL("three.min.js", jsBase).href);
      await loadAvatarScript(new URL("avatar-particle-scene.js", jsBase).href);
      const SceneClass = globalThis.ParticleScene;
      if (!SceneClass) throw new Error("Partikel-Avatar-Skript wurde nicht korrekt geladen.");
      this.avatarAssemblyDone = false;
      this.avatarPendingState = null;
      const scene = new SceneClass(this.avatarCanvas, this.avatarCanvas.parentElement);
      globalThis.particleInterface = {
        setState: (state) => {
          if (state === "IDLE" && !this.avatarAssemblyDone) {
            this.avatarAssemblyDone = true;
            if (this.avatarPendingState) {
              scene.setState?.(this.avatarPendingState);
              this.avatarPendingState = null;
            }
          }
        },
      };
      await scene.prepare();
      scene.configure({ quality: "AUTO", animationSpeedMultiplier: 1, assemblyEnabled: true });
      scene.start();
      scene.setState("ASSEMBLING");
      this.avatarScene = scene;
      return scene;
    })().catch((error) => {
      console.error("Partikel-Avatar konnte nicht gestartet werden", error);
      this.avatarScenePromise = null;
      this.avatarScene = null;
      return null;
    });
    return this.avatarScenePromise;
  }

  _teardownAvatarScene() {
    this.avatarScene?.dispose?.();
    this.avatarScene = null;
    this.avatarScenePromise = null;
    this.avatarAssemblyDone = false;
    this.avatarPendingState = null;
  }

  _updateStateUI(title, detail = "") {
    this.stateIndicator.textContent = title;
    this.stateDetail.textContent = detail;
  }

  destroy() {
    this.destroyed = true;
    globalThis.document?.removeEventListener?.("visibilitychange", this.visibilityHandler);
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
    globalThis.speechSynthesis?.cancel();
    this.speechSynth?.removeEventListener?.("voiceschanged", this.voicesChangedHandler);
    if (this.currentTtsObjectUrl) URL.revokeObjectURL(this.currentTtsObjectUrl);
    this.currentTtsObjectUrl = null;
    this.audio.stop();
    this.pipeline?.disconnect();
    this._teardownAvatarScene();
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
