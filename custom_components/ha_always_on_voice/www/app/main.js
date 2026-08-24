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
    this.pipelineSelect = document.getElementById("pipelineSelect");
    this.settingsBtn = document.getElementById("settingsBtn");
    this.closeSettingsBtn = document.getElementById("closeSettingsBtn");
    this.testMicBtn = document.getElementById("testMicBtn");
    this.orb = document.getElementById("orb");
    this.frequencyCanvas = document.getElementById("frequencyRing");
    this.canvasCtx = this.frequencyCanvas.getContext("2d");

    this.currentTranscript = "";
    this.animationId = null;

    this._setupEventListeners();
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

    this.pipelineSelect.addEventListener("change", (e) => {
      if (this.pipeline) {
        this.pipeline.setPipeline(e.target.value);
      }
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
    return new Promise((resolve, reject) => {
      // Check if token is already in localStorage (PWA mode)
      const storedToken = localStorage.getItem("ha_auth_token");
      if (storedToken) {
        resolve(storedToken);
        return;
      }

      // Listen for postMessage from panel (iframe mode)
      const handleMessage = (event) => {
        if (event.data?.type === "HA_AUTH_TOKEN") {
          window.removeEventListener("message", handleMessage);
          localStorage.setItem("ha_auth_token", event.data.token);
          localStorage.setItem("ha_url", event.data.hassUrl);
          resolve(event.data.token);
        }
      };

      window.addEventListener("message", handleMessage);

      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener("message", handleMessage);
        reject(new Error("Auth token not received"));
      }, 5000);
    });
  }

  async _getHassUrl() {
    const stored = localStorage.getItem("ha_url");
    if (stored) return stored;
    return window.location.origin;
  }

  _onPipelineConnected() {
    this._updatePipelineList();
  }

  _updatePipelineList() {
    const pipelines = this.pipeline.getPipelines();
    this.pipelineSelect.innerHTML = "";
    pipelines.forEach((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.name || p.id;
      this.pipelineSelect.appendChild(option);
    });
    if (pipelines.length > 0) {
      this.pipelineSelect.value = pipelines[0].id;
    }
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
    // Processing continues
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

    // Try to recover after 3 seconds
    setTimeout(() => {
      try {
        this._startListening();
      } catch (e) {
        console.error("Failed to recover:", e);
      }
    }, 3000);
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
