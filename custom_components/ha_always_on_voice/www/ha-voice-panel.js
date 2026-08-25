const APP_BASE = "/ha_voice_app";
const APP_VERSION = "1.0.0";

function loadVoiceScript(name, readyCheck) {
  if (readyCheck()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-ha-voice-script="${name}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `${APP_BASE}/${name}?v=${APP_VERSION}`;
    script.dataset.haVoiceScript = name;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Voice asset failed: ${name}`));
    document.head.appendChild(script);
  });
}

async function loadVoiceAssets() {
  await loadVoiceScript("ui.js", () => Boolean(globalThis.HAVoiceMarkup));
  await loadVoiceScript("audio.js", () => Boolean(globalThis.AudioCapture));
  await loadVoiceScript("ha-ws.js", () => Boolean(globalThis.HAVoicePipeline));
  await loadVoiceScript("main.js", () => Boolean(globalThis.VoiceAssistApp));
}

class HaVoicePanel extends HTMLElement {
  set hass(value) {
    this._hass = value;
    const token = value?.auth?.accessToken;
    if (token) this._app?.updateAuth(token, window.location.origin);
    this._maybeStart();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <link rel="stylesheet" href="${APP_BASE}/style.css?v=${APP_VERSION}">
        <div id="voiceMount" class="voice-mount"></div>
      `;
    }
    this.style.display = "block";
    this.style.position = "fixed";
    this.style.inset = "0";
    this.style.width = "100vw";
    this.style.height = "100dvh";
    this._assetsReady = loadVoiceAssets()
      .then(() => {
        const mount = this.shadowRoot.querySelector("#voiceMount");
        if (!mount.querySelector("#app")) mount.innerHTML = globalThis.HAVoiceMarkup;
        return true;
      })
      .catch((error) => {
        console.error("HA Voice Control assets failed to load", error);
        this.shadowRoot.querySelector("#voiceMount").textContent =
          "HA Voice Control konnte nicht geladen werden. Bitte Home Assistant neu laden.";
        return false;
      });
    this._maybeStart();
  }

  async _maybeStart() {
    if (this._started || !this._hass?.auth?.accessToken || !this._assetsReady) return;
    this._started = true;
    if (!(await this._assetsReady) || !this.isConnected) return;

    this._app = new globalThis.VoiceAssistApp({
      root: this.shadowRoot,
      authProvider: () => ({
        token: this._hass?.auth?.accessToken,
        hassUrl: window.location.origin,
      }),
    });
    this._app.updateAuth(this._hass.auth.accessToken, window.location.origin);
    await this._app.init();
  }

  disconnectedCallback() {
    this._app?.destroy();
  }
}

if (!customElements.get("ha-voice-panel")) {
  customElements.define("ha-voice-panel", HaVoicePanel);
}
