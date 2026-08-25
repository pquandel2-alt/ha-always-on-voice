/**
 * Main application: State machine + lifecycle management
 * States: IDLE → LISTENING → VAD_ACTIVE → PROCESSING → SPEAKING → LISTENING
 */

class VoiceAssistApp {
  constructor() {
    this.state = "IDLE";
    this.audio = new AudioCapture();
    this.pipeline = null;
    this.container = document.getElementById("app");

    // UI elements
    this.stateIndicator = document.getElementById("stateIndicator");
    this.assistResponse = document.getElementById("assistResponse");
    this.userTranscript = document.getElementById("userTranscript");
    this.settingsPanel = document.getElementById("settingsPanel");
    this.settingsBtn = document.getElementById("settingsBtn");
    this.closeSettingsBtn = document.getElementById("closeSettingsBtn");
    this.testMicBtn = document.getElementById("testMicBtn");
    this.orb = document.getElementById("orb");
    this.frequencyCanvas = document.getElementById("frequencyRing");
    this.canvasCtx = this.frequencyCanvas.getContext("2d");

    this.currentTranscript = "";
    this.animationId = null;

    // Kept fresh continuously (not just on first read) since HA access
    // tokens are short-lived and the panel re-sends one on every hass
    // update.
    this.latestToken = null;
    this.latestHassUrl = null;

    this._setupAuthListener();
    this._setupEventListeners();
  }

  _setupAuthListener() {
    window.addEventListener("message", (event) => {
      if (event.data?.type !== "HA_AUTH_TOKEN") return;
      this.latestToken = event.data.token;
      this.latestHassUrl = event.data.hassUrl;
      localStorage.setItem("ha_auth_token", event.data.token);
      localStorage.setItem("ha_url", event.data.hassUrl);
      if (this.pipeline) {
        this.pipeline.accessToken = event.data.token;
      }
    });
  }

  _setupEventListeners() {
    this.audio.onAudioData = (int16Data) => this._onAudioData(int16Data);
    this.audio.onError = (error) => this._handleError(error);

    this.settingsBtn.addEventListener("click", () => {
      this.settingsPanel.classList.toggle("open");
    });

    this.closeSettingsBtn.addEventListener("click", () => {
      this.settingsPanel.classList.remove("open");
    });

    this.testMicBtn.addEventListener("click", () => this._testMicrophone());
  }

  async init() {
    try {
      this._setState("IDLE");
      this._updateStateUI("Initializing...");

      // Get auth token from parent window or localStorage
      const token = await this._getAuthToken();
      const hassUrl = await this._getHassUrl();

      this.pipeline = new HAVoicePipeline(hassUrl, token);
      this.pipeline.onConnected = () => this._onPipelineConnected();
      this.pipeline.onSttStart = () => this._onSttStart();
      this.pipeline.onSttEnd = (data) => this._onSttEnd(data);
      this.pipeline.onIntentStart = () => this._onIntentStart();
      this.pipeline.onIntentEnd = (data) => this._onIntentEnd(data);
      this.pipeline.onTtsStart = () => this._onTtsStart();
      this.pipeline.onTtsEnd = (data) => this._onTtsEnd(data);
      this.pipeline.onRunEnd = (data) => this._onRunEnd(data);
      this.pipeline.onError = (error) => this._handleError(error);

      await this.pipeline.connect();
      await this.audio.start();

      this._updateStateUI("Ready");
      this._setState("LISTENING");
      this._startListening();
    } catch (error) {
      console.error("Initialization failed:", error);
      this._handleError(error);
    }
  }

  async _getAuthToken() {
    const embedded = window.self !== window.top;

    if (embedded) {
      // Running inside the HA panel iframe: always wait for a fresh
      // token from the parent instead of trusting a possibly-expired
      // one cached in localStorage from a previous session.
      const fresh = await this._waitForToken(8000);
      if (fresh) return fresh;
    }

    const stored = localStorage.getItem("ha_auth_token");
    if (stored) return stored;

    throw new Error("Auth token not received");
  }

  _waitForToken(timeoutMs) {
    return new Promise((resolve) => {
      if (this.latestToken) {
        resolve(this.latestToken);
        return;
      }
      const interval = setInterval(() => {
        if (this.latestToken) {
          clearInterval(interval);
          clearTimeout(timeoutId);
          resolve(this.latestToken);
        }
      }, 100);
      const timeoutId = setTimeout(() => {
        clearInterval(interval);
        resolve(null);
      }, timeoutMs);
    });
  }

  async _getHassUrl() {
    if (this.latestHassUrl) return this.latestHassUrl;
    const stored = localStorage.getItem("ha_url");
    if (stored) return stored;
    return window.location.origin;
  }

  _onPipelineConnected() {
    // Pipeline/VAD sensitivity are configured on the device page under
    // Settings -> Voice assistants -> Devices, nothing to do here.
  }

  _startListening() {
    this._setState("LISTENING");
    this._updateStateUI("Listening...");
    this.assistResponse.textContent = "";
    this.userTranscript.textContent = "";
    this._startPipeline();
    this._startVisualization();
  }

  async _startPipeline() {
    try {
      await this.pipeline.startPipeline();
    } catch (error) {
      this._handleError(error);
    }
  }

  _onAudioData(int16Data) {
    if (this.state !== "LISTENING" && this.state !== "VAD_ACTIVE") {
      return;
    }
    this.pipeline.sendAudio(int16Data);
  }

  _onSttStart() {
    if (this.state === "LISTENING") {
      this._setState("VAD_ACTIVE");
      this._updateStateUI("Hearing you...");
    }
  }

  _onSttEnd(data) {
    this.currentTranscript = data.transcript || "";
    this.userTranscript.textContent = `"${this.currentTranscript}"`;
    this._setState("VAD_ACTIVE");
    this.pipeline.endAudio();
  }

  _onIntentStart() {
    this._setState("PROCESSING");
    this._updateStateUI("Processing...");
  }

  _onIntentEnd(data) {
    if (data.responseText) {
      this.assistResponse.textContent = data.responseText;
    }
  }

  _onTtsStart() {
    this._setState("SPEAKING");
    this._updateStateUI("Speaking...");
  }

  _onTtsEnd(data) {
    if (data.url) {
      this._playTTS(data.url);
    }
  }

  _onRunEnd(data) {
    this._stopVisualization();
    if (data.success) {
      // After TTS plays, go back to listening
      setTimeout(() => {
        this._startListening();
      }, 500);
    } else {
      this._handleError(new Error("Pipeline run failed"));
    }
  }

  _playTTS(ttsUrl) {
    const audio = new Audio(ttsUrl);

    // Connect TTS audio to analyser for visualization
    if (this.audio.audioContext) {
      try {
        const track = this.audio.audioContext.createMediaElementSource(audio);
        track.connect(this.audio.analyser);
        this.audio.analyser.connect(this.audio.audioContext.destination);
      } catch (error) {
        console.error("Failed to connect TTS to analyser:", error);
        // Fallback: just play without visualization
      }
    }

    audio.onended = () => {
      // Auto-restart listening
    };

    audio.onerror = (error) => {
      console.error("TTS playback error:", error);
      this._handleError(error);
    };

    audio.play().catch((error) => {
      console.error("Failed to play TTS:", error);
    });
  }

  _startVisualization() {
    const draw = () => {
      if (!this.audio.analyser) {
        this.animationId = requestAnimationFrame(draw);
        return;
      }

      const frequencyData = this.audio.getFrequencyData();
      this._drawFrequencyRing(frequencyData);
      this.animationId = requestAnimationFrame(draw);
    };

    this.animationId = requestAnimationFrame(draw);
  }

  _stopVisualization() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Clear canvas
    this.canvasCtx.clearRect(0, 0, this.frequencyCanvas.width, this.frequencyCanvas.height);
  }

  _drawFrequencyRing(frequencyData) {
    const w = this.frequencyCanvas.width;
    const h = this.frequencyCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = 70;
    const maxBarHeight = 50;

    // Clear
    this.canvasCtx.clearRect(0, 0, w, h);

    // Determine color based on state
    let color = "#00d4aa"; // default listening
    if (this.state === "VAD_ACTIVE") {
      color = "#10b981";
    } else if (this.state === "PROCESSING") {
      color = "#f59e0b";
    } else if (this.state === "SPEAKING") {
      color = "#7c3aed";
    }

    // Draw frequency bars
    frequencyData.forEach((val, i) => {
      const angle = (i / frequencyData.length) * Math.PI * 2;
      const barHeight = (val / 255) * maxBarHeight;

      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      const x2 = cx + Math.cos(angle) * (radius + barHeight);
      const y2 = cy + Math.sin(angle) * (radius + barHeight);

      this.canvasCtx.strokeStyle = color;
      this.canvasCtx.lineWidth = 2;
      this.canvasCtx.globalAlpha = 0.7 + (val / 255) * 0.3;
      this.canvasCtx.beginPath();
      this.canvasCtx.moveTo(x1, y1);
      this.canvasCtx.lineTo(x2, y2);
      this.canvasCtx.stroke();
    });

    this.canvasCtx.globalAlpha = 1.0;
  }

  async _testMicrophone() {
    this.testMicBtn.disabled = true;
    this.testMicBtn.textContent = "Testing...";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      this.testMicBtn.textContent = "✓ Microphone OK";
      setTimeout(() => {
        this.testMicBtn.textContent = "Test Microphone";
        this.testMicBtn.disabled = false;
      }, 2000);
    } catch (error) {
      this.testMicBtn.textContent = "✗ Mic Error";
      setTimeout(() => {
        this.testMicBtn.textContent = "Test Microphone";
        this.testMicBtn.disabled = false;
      }, 2000);
      console.error("Mic test failed:", error);
    }
  }

  _handleError(error) {
    console.error("Error:", error);
    this._setState("ERROR");
    this._updateStateUI(`Error: ${error.message}`);

    if (/token|password|auth/i.test(error.message || "")) {
      // Stale/expired token — drop the cache so we don't immediately
      // fail the same way again on reconnect.
      localStorage.removeItem("ha_auth_token");
      this.latestToken = null;
    }

    // Try to recover after 3 seconds by fully reconnecting (fresh auth +
    // a new pipeline connection), not just restarting the pipeline run
    // on a connection that may itself be broken.
    setTimeout(() => {
      this._reconnect().catch((e) => console.error("Failed to recover:", e));
    }, 3000);
  }

  async _reconnect() {
    this._stopVisualization();
    this.audio.stop();
    if (this.pipeline) {
      this.pipeline.disconnect();
      this.pipeline = null;
    }
    await this.init();
  }

  _setState(newState) {
    this.state = newState;
    this.container.className = `state-${newState.toLowerCase()}`;
  }

  _updateStateUI(text) {
    this.stateIndicator.textContent = text;
  }

  destroy() {
    this._stopVisualization();
    this.audio.stop();
    if (this.pipeline) {
      this.pipeline.disconnect();
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  const app = new VoiceAssistApp();
  app.init().catch((error) => {
    console.error("Failed to initialize app:", error);
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    app.destroy();
  });
});
