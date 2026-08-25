/**
 * Home Assistant WebSocket client for the custom browser satellite bridge.
 */

class HAVoicePipeline {
  constructor(hassUrl, accessToken) {
    this.hassUrl = hassUrl;
    this.accessToken = accessToken;
    this.ws = null;
    this.msgId = 1;
    this.connected = false;
    this.intentionalClose = false;
    this.activeRunId = null;
    this.binaryHandlerId = null;
    this.pendingCommands = new Map();
    this.configurationSubscriptionId = null;

    this.onSttStart = null;
    this.onVadStart = null;
    this.onSttEnd = null;
    this.onIntentStart = null;
    this.onIntentEnd = null;
    this.onTtsStart = null;
    this.onTtsEnd = null;
    this.onRunEnd = null;
    this.onError = null;
    this.onConnected = null;
    this.onConfiguration = null;
  }

  async connect() {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) return;

    this.intentionalClose = false;
    const protocol = this.hassUrl.startsWith("https") ? "wss" : "ws";
    const url = new URL("/api/websocket", this.hassUrl);
    url.protocol = protocol;

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        error ? reject(error) : resolve();
      };
      const timeoutId = setTimeout(
        () => finish(new Error("Zeitüberschreitung beim Verbinden mit Home Assistant.")),
        12000
      );

      this.ws = new WebSocket(url.toString());
      this.ws.binaryType = "arraybuffer";

      this.ws.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch (error) {
          console.error("Invalid WebSocket message", error);
          return;
        }

        if (message.type === "auth_required") {
          this.ws.send(JSON.stringify({
            type: "auth",
            access_token: this.accessToken,
          }));
          return;
        }
        if (message.type === "auth_ok") {
          this.connected = true;
          this.onConnected?.();
          finish();
          return;
        }
        if (message.type === "auth_invalid") {
          finish(new Error(message.message || "Home-Assistant-Anmeldung fehlgeschlagen."));
          return;
        }

        this._handleMessage(message);
      };

      this.ws.onerror = () => {
        const error = new Error("WebSocket-Verbindung zu Home Assistant fehlgeschlagen.");
        if (!settled) finish(error);
        else if (!this.intentionalClose) this.onError?.(error);
      };

      this.ws.onclose = (event) => {
        const wasConnected = this.connected;
        this.connected = false;
        this.binaryHandlerId = null;
        this.activeRunId = null;
        const error = new Error(`Verbindung zu Home Assistant getrennt (${event.code}).`);
        this._rejectPending(error);
        if (!settled) finish(error);
        else if (wasConnected && !this.intentionalClose) this.onError?.(error);
      };
    });
  }

  disconnect() {
    this.intentionalClose = true;
    this.connected = false;
    this.binaryHandlerId = null;
    this.activeRunId = null;
    this.configurationSubscriptionId = null;
    this._rejectPending(new Error("Verbindung beendet."));
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  startPipeline(sampleRate = 16000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) {
      return Promise.reject(new Error("Home Assistant ist nicht verbunden."));
    }

    this.binaryHandlerId = null;
    const id = this.msgId++;
    this.activeRunId = id;
    this.ws.send(JSON.stringify({
      id,
      type: "ha_always_on_voice/run",
      sample_rate: sampleRate,
    }));

    return this._waitForResult(id).then((result) => {
      const handlerId = result?.stt_binary_handler_id;
      if (!Number.isInteger(handlerId) || handlerId < 1 || handlerId > 255) {
        throw new Error("Home Assistant hat keinen gültigen Audio-Kanal bereitgestellt.");
      }
      this.binaryHandlerId = handlerId;
      return { ...result, run_id: id };
    });
  }

  sendAudio(int16Data) {
    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      this.binaryHandlerId === null
    ) return;

    const source = new Uint8Array(
      int16Data.buffer,
      int16Data.byteOffset,
      int16Data.byteLength
    );
    const framed = new Uint8Array(source.byteLength + 1);
    framed[0] = this.binaryHandlerId;
    framed.set(source, 1);
    this.ws.send(framed.buffer);
  }

  endAudio() {
    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      this.binaryHandlerId !== null
    ) {
      this.ws.send(Uint8Array.of(this.binaryHandlerId).buffer);
      this.binaryHandlerId = null;
    }
  }

  notifyTtsFinished() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) return;
    this.ws.send(JSON.stringify({
      id: this.msgId++,
      type: "ha_always_on_voice/tts_finished",
    }));
  }

  subscribeConfiguration() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) {
      return Promise.reject(new Error("Home Assistant ist nicht verbunden."));
    }
    const id = this.msgId++;
    this.configurationSubscriptionId = id;
    this.ws.send(JSON.stringify({
      id,
      type: "ha_always_on_voice/subscribe_config",
    }));
    return this._waitForResult(id);
  }

  selectOption(entityId, option) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) {
      return Promise.reject(new Error("Home Assistant ist nicht verbunden."));
    }
    if (!entityId || !option) {
      return Promise.reject(new Error("Ungültige Auswahl."));
    }
    const id = this.msgId++;
    this.ws.send(JSON.stringify({
      id,
      type: "call_service",
      domain: "select",
      service: "select_option",
      service_data: { entity_id: entityId, option },
    }));
    return this._waitForResult(id);
  }

  _waitForResult(id) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error("Home Assistant hat die Anfrage nicht bestätigt."));
      }, 10000);
      this.pendingCommands.set(id, { resolve, reject, timeoutId });
    });
  }

  _handleMessage(message) {
    if (message.type === "result") {
      const pending = this.pendingCommands.get(message.id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingCommands.delete(message.id);
        if (message.success === false) {
          pending.reject(new Error(message.error?.message || "Home-Assistant-Befehl fehlgeschlagen."));
        } else {
          pending.resolve(message.result);
        }
      } else if (message.success === false) {
        this.onError?.(new Error(message.error?.message || "Home-Assistant-Befehl fehlgeschlagen."));
      }
      return;
    }

    if (message.type !== "event" || !message.event) return;
    if (message.id === this.configurationSubscriptionId) {
      this.onConfiguration?.(message.event);
      return;
    }
    const { type, data } = message.event;
    switch (type) {
      case "stt-start":
        this.onSttStart?.();
        break;
      case "stt-vad-start":
        this.onVadStart?.();
        break;
      case "stt-end":
        this.onSttEnd?.({ transcript: data?.stt_output?.text || "" });
        break;
      case "intent-start":
        this.onIntentStart?.();
        break;
      case "intent-end": {
        const speech = data?.intent_output?.response?.speech?.plain?.speech;
        this.onIntentEnd?.({ responseText: speech || "" });
        break;
      }
      case "tts-start":
        this.onTtsStart?.({ text: data?.tts_input || "" });
        break;
      case "tts-end":
        this.onTtsEnd?.({ url: data?.tts_output?.url || "" });
        break;
      case "run-end":
        this.activeRunId = null;
        this.binaryHandlerId = null;
        this.onRunEnd?.({ success: true });
        break;
      case "error":
        this.binaryHandlerId = null;
        this.onError?.(new Error(data?.message || "Unbekannter Pipeline-Fehler."));
        break;
      default:
        break;
    }
  }

  _rejectPending(error) {
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pendingCommands.clear();
  }
}

globalThis.HAVoicePipeline = HAVoicePipeline;
if (typeof module !== "undefined") module.exports = { HAVoicePipeline };
