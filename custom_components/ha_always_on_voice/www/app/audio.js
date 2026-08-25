/**
 * Microphone capture and PCM conversion for Home Assistant's Assist pipeline.
 */

class AudioCapture {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.silentGain = null;
    this.analyser = null;
    this.source = null;
    this.isRecording = false;
    this.onAudioData = null;
    this.sampleRate = 16000;
  }

  static getSupportError() {
    if (!window.isSecureContext) {
      return new Error(
        "Mikrofonzugriff benötigt HTTPS. Öffne Home Assistant über eine sichere https://-Adresse."
      );
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return new Error(
        "Der Home-Assistant-Webbereich stellt keinen Mikrofonzugriff bereit. Bitte aktualisiere die App und öffne das Panel erneut."
      );
    }
    if (!(window.AudioContext || window.webkitAudioContext)) {
      return new Error("Audio wird von dieser Browser-Version nicht unterstützt.");
    }
    return null;
  }

  async start() {
    if (this.isRecording) return;

    const supportError = AudioCapture.getSupportError();
    if (supportError) throw supportError;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      try {
        this.audioContext = new AudioContextClass({ sampleRate: 16000 });
      } catch (_error) {
        // Older WebKit versions reject AudioContextOptions.
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }
      if (this.audioContext.state !== "running") {
        throw new Error("iOS verlangt einmaliges Tippen zum Aktivieren des Audiosystems.");
      }

      this.sampleRate = this.audioContext.sampleRate;
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.82;
      this.source.connect(this.analyser);

      // ScriptProcessor remains the most broadly supported PCM capture path in
      // iOS WebViews. A zero-gain output keeps the processor alive without
      // feeding the microphone back through the speaker.
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.silentGain = this.audioContext.createGain();
      this.silentGain.gain.value = 0;

      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isRecording || !this.onAudioData) return;
        this.onAudioData(this._float32ToInt16(event.inputBuffer.getChannelData(0)));
      };

      this.source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.silentGain);
      this.silentGain.connect(this.audioContext.destination);
      this.isRecording = true;
    } catch (error) {
      this.stop();
      if (error?.name === "NotAllowedError") {
        throw new Error(
          "Mikrofonzugriff wurde nicht erlaubt. Prüfe die Mikrofonfreigabe für Home Assistant in den iOS-Einstellungen."
        );
      }
      if (error?.name === "NotFoundError") {
        throw new Error("Auf diesem Gerät wurde kein Mikrofon gefunden.");
      }
      throw error;
    }
  }

  stop() {
    this.isRecording = false;
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor.disconnect();
    }
    this.silentGain?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
    }

    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.silentGain = null;
    this.analyser = null;
    this.source = null;
  }

  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  _float32ToInt16(float32Data) {
    const int16Data = new Int16Array(float32Data.length);
    for (let i = 0; i < float32Data.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Data[i]));
      int16Data[i] = sample < 0 ? sample * 32768 : sample * 32767;
    }
    return int16Data;
  }
}

globalThis.AudioCapture = AudioCapture;
if (typeof module !== "undefined") module.exports = { AudioCapture };
