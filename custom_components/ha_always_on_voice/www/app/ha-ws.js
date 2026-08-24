/**
 * Home Assistant WebSocket Pipeline Client
 * Manages communication with HA's assist_pipeline/run
 */

class HAVoicePipeline {
  constructor(hassUrl, accessToken) {
    this.hassUrl = hassUrl;
    this.accessToken = accessToken;
    this.ws = null;
    this.msgId = 1;
    this.pipelines = [];
    this.selectedPipeline = null;

    // Event callbacks
    this.onSttStart = null;
    this.onSttEnd = null;
    this.onIntentStart = null;
    this.onIntentEnd = null;
    this.onTtsStart = null;
    this.onTtsEnd = null;
    this.onRunEnd = null;
    this.onError = null;
    this.onConnected = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const protocol = this.hassUrl.startsWith("https") ? "wss" : "ws";
      const url = new URL("/api/websocket", this.hassUrl);
      url.protocol = protocol;

      this.ws = new WebSocket(url.toString());
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = async () => {
        await this._authenticate();
        await this._loadPipelines();
        if (this.onConnected) {
          this.onConnected();
        }
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          if (typeof event.data === "string") {
            const message = JSON.parse(event.data);
            this._handleMessage(message);
          }
        } catch (error) {
          console.error("Failed to process WebSocket message:", error);
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (this.onError) {
          this.onError(error);
        }
        reject(error);
      };

      this.ws.onclose = () => {
        console.log("WebSocket closed");
      };
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async _authenticate() {
    return new Promise((resolve) => {
      const msg = {
        type: "auth",
        access_token: this.accessToken,
      };
      this.ws.send(JSON.stringify(msg));

      const onMessage = (event) => {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          if (message.type === "auth_ok") {
            this.ws.removeEventListener("message", onMessage);
            resolve();
          } else if (message.type === "auth_invalid") {
            this.ws.removeEventListener("message", onMessage);
            throw new Error("Authentication failed");
          }
        }
      };
      this.ws.addEventListener("message", onMessage);
    });
  }

  async _loadPipelines() {
    return new Promise((resolve) => {
      const msgId = this.msgId++;
      const msg = {
        id: msgId,
        type: "assist_pipeline/pipeline/list",
      };
      this.ws.send(JSON.stringify(msg));

      const onMessage = (event) => {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data);
          if (message.id === msgId && message.type === "result") {
            this.ws.removeEventListener("message", onMessage);
            this.pipelines = message.result?.pipelines || [];
            // Set first pipeline as default
            if (this.pipelines.length > 0) {
              this.selectedPipeline = this.pipelines[0].id;
            }
            resolve();
          }
        }
      };
      this.ws.addEventListener("message", onMessage);
    });
  }

  getPipelines() {
    return this.pipelines;
  }

  setPipeline(pipelineId) {
    const pipeline = this.pipelines.find((p) => p.id === pipelineId);
    if (pipeline) {
      this.selectedPipeline = pipelineId;
    }
  }

  /**
   * Start a pipeline run for voice processing
   * @param {Int16Array} audioData - Initial audio chunk (optional)
   */
  async startPipeline(audioData = null) {
    const msgId = this.msgId++;
    const msg = {
      id: msgId,
      type: "assist_pipeline/run",
      start_stage: "stt",
      end_stage: "tts",
      input: {
        sample_rate: 16000,
      },
      pipeline: this.selectedPipeline,
    };

    this.ws.send(JSON.stringify(msg));

    // Send initial audio if provided
    if (audioData) {
      this._sendAudioChunk(audioData);
    }

    return msgId;
  }

  /**
   * Send audio chunk via binary WebSocket message
   */
  _sendAudioChunk(int16Data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const buffer = int16Data.buffer.slice(
      int16Data.byteOffset,
      int16Data.byteOffset + int16Data.byteLength
    );
    this.ws.send(buffer);
  }

  /**
   * Enqueue audio chunk for transmission
   */
  sendAudio(int16Data) {
    this._sendAudioChunk(int16Data);
  }

  /**
   * Signal end of audio (tells HA STT pipeline you're done speaking)
   */
  endAudio() {
    // Send empty buffer to signal VAD end
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(new ArrayBuffer(0));
    }
  }

  _handleMessage(message) {
    switch (message.type) {
      case "result":
        // Ignore result messages (responses to list calls)
        break;

      case "assist_pipeline/stt-start":
        if (this.onSttStart) {
          this.onSttStart();
        }
        break;

      case "assist_pipeline/stt-end":
        if (this.onSttEnd) {
          this.onSttEnd({
            transcript: message.data?.transcript || "",
          });
        }
        break;

      case "assist_pipeline/intent-start":
        if (this.onIntentStart) {
          this.onIntentStart();
        }
        break;

      case "assist_pipeline/intent-end":
        if (this.onIntentEnd) {
          this.onIntentEnd({
            intent: message.data?.intent || {},
          });
        }
        break;

      case "assist_pipeline/tts-start":
        if (this.onTtsStart) {
          this.onTtsStart();
        }
        break;

      case "assist_pipeline/tts-end":
        if (this.onTtsEnd) {
          this.onTtsEnd({
            url: message.data?.url || "",
          });
        }
        break;

      case "assist_pipeline/run-end":
        if (this.onRunEnd) {
          this.onRunEnd({
            success: message.data?.success !== false,
          });
        }
        break;

      case "assist_pipeline/error":
        console.error("Pipeline error:", message.data);
        if (this.onError) {
          this.onError(new Error(message.data?.message || "Unknown error"));
        }
        break;

      default:
        // Ignore unknown message types
        break;
    }
  }
}
