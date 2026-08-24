/**
 * Audio capture module: handles getUserMedia, AudioContext setup,
 * and float32→int16 PCM conversion for HA Whisper pipeline.
 */

class AudioCapture {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.analyser = null;
    this.source = null;
    this.isRecording = false;
    this.onAudioData = null;
    this.onError = null;
    this.sampleRate = 16000;
  }

  async start() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create analyser for visualizations
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.source.connect(this.analyser);

      // Create script processor for PCM capture
      const bufferSize = 4096;
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        bufferSize,
        1, // input channels
        1  // output channels
      );

      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const float32Data = event.inputBuffer.getChannelData(0);
        const int16Data = this._float32ToInt16(float32Data);

        if (this.onAudioData) {
          this.onAudioData(int16Data);
        }
      };

      this.source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      this.isRecording = true;
    } catch (error) {
      console.error("Audio initialization failed:", error);
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }

  stop() {
    this.isRecording = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
    }
    if (this.source) {
      this.source.disconnect();
    }
    if (this.analyser) {
      this.analyser.disconnect();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }

    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.analyser = null;
    this.source = null;
  }

  /**
   * Get frequency data from analyser for visualization.
   * Returns Uint8Array of length analyser.frequencyBinCount
   */
  getFrequencyData() {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  /**
   * Convert Float32Array to Int16Array (PCM format expected by HA).
   * Float32 range: [-1.0, 1.0]
   * Int16 range: [-32768, 32767]
   */
  _float32ToInt16(float32Data) {
    const int16Data = new Int16Array(float32Data.length);
    for (let i = 0; i < float32Data.length; i++) {
      // Clamp to [-1.0, 1.0] and scale to 16-bit range
      let sample = float32Data[i];
      sample = Math.max(-1.0, Math.min(1.0, sample));
      int16Data[i] = sample < 0
        ? sample * 32768  // negative: -1.0 → -32768
        : sample * 32767; // positive: 1.0 → 32767
    }
    return int16Data;
  }

  /**
   * Convert Int16Array to ArrayBuffer for WebSocket binary transmission
   */
  int16ToBuffer(int16Data) {
    return int16Data.buffer;
  }
}
