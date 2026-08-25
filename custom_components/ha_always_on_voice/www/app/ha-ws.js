/**
 * Home Assistant WebSocket Pipeline Client
 * Streams audio through the integration's ha_always_on_voice/run command,
 * which runs the pipeline via the registered Assist satellite entity.
 * Pipeline + VAD sensitivity are configured on the device page under
 * Settings -> Voice assistants -> Devices, not in this app.
 */

class HAVoicePipeline {
  constructor(hassUrl, accessToken) {
    this.hassUrl = hassUrl;
    this.accessToken = accessToken;
    this.ws = null;
    this.msgId = 1;

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
      let settled = false;
      const settleReject = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      };
      const settleResolve = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      };

      const timeoutId = setTimeout(() => {
        settleReject(new Error("WebSocket connection timed out"));
      }, 10000);

      const protocol = this.hassUrl.startsWith("https") ? "wss" : "ws";
      const url = new URL("/api/websocket", this.hassUrl);
      url.protocol = protocol;

      this.ws = new WebSocket(url.toString());
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = async () => {
        try {
          await this._authenticate();
          if (this.onConnected) {
            this.onConnected();
          }
          settleResolve();
        } catch (error) {
          settleReject(error);
        }
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
        settleReject(error instanceof Error ? error : new Error("WebSocket error"));
      };

      this.ws.onclose = (event) => {
        console.log("WebSocket closed", event.code, event.reason);
        settleReject(
          new Error(`WebSocket closed before auth completed (code ${event.code})`)
        );
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
    return new Promise((resolve, reject) => {
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
            reject(new Error(message.message || "Authentication failed"));
          }
        }
      };
      this.ws.addEventListener("message", onMessage);
    });
  }

  /**
   * Start a pipeline run for voice processing via the satellite entity
   */
  async startPipeline() {
    const msgId = this.msgId++;
    const msg = {
      id: msgId,
      type: "ha_always_on_voice/run",
      sample_rate: 16000,
    };

    this.ws.send(JSON.stringify(msg));
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
    if (message.type === "result") {
      if (message.success === false) {
        console.error("Pipeline command failed:", message.error);
        if (this.onError) {
          this.onError(new Error(message.error?.message || "Command failed"));
        }
      }
      return;
    }

    if (message.type !== "event" || !message.event) {
      return;
    }

    const { type, data } = message.event;

    switch (type) {
      case "stt-start":
        if (this.onSttStart) {
          this.onSttStart();
        }
        break;

      case "stt-end":
        if (this.onSttEnd) {
          this.onSttEnd({
            transcript: data?.stt_output?.text || "",
          });
        }
        break;

      case "intent-start":
        if (this.onIntentStart) {
          this.onIntentStart();
        }
        break;

      case "intent-end":
        if (this.onIntentEnd) {
          const speech = data?.intent_output?.response?.speech?.plain?.speech;
          this.onIntentEnd({ responseText: speech || "" });
        }
        break;

      case "tts-start":
        if (this.onTtsStart) {
          this.onTtsStart();
        }
        break;

      case "tts-end":
        if (this.onTtsEnd) {
          this.onTtsEnd({
            url: data?.tts_output?.url || "",
          });
        }
        break;

      case "run-end":
        if (this.onRunEnd) {
          this.onRunEnd({ success: true });
        }
        break;

      case "error":
        console.error("Pipeline error:", data);
        if (this.onError) {
          this.onError(new Error(data?.message || "Unknown error"));
        }
        break;

      default:
        // Ignore unhandled event types (wake-word-*, stt-vad-*, ...)
        break;
    }
  }
}
