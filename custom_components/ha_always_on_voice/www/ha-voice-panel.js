class HaVoicePanel extends HTMLElement {
  set hass(value) {
    this._hass = value;
    this._maybeSendToken();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;

    // Fixed positioning instead of width/height:100% — HA wraps custom
    // panels in ancestors that don't reliably provide a definite height,
    // which makes percentage-based sizing collapse to the iframe's
    // intrinsic default (~150px). Fixed positioning ties us to the
    // viewport directly instead.
    this.style.display = "block";
    this.style.position = "fixed";
    this.style.inset = "0";
    this.style.width = "100vw";
    this.style.height = "100vh";

    const iframe = document.createElement("iframe");
    iframe.id = "voice-app";
    iframe.src = this._getAppUrl();
    iframe.setAttribute("allow", "microphone");
    iframe.style.position = "fixed";
    iframe.style.inset = "0";
    iframe.style.width = "100vw";
    iframe.style.height = "100vh";
    iframe.style.border = "none";
    iframe.style.display = "block";
    iframe.addEventListener("load", () => this._maybeSendToken());

    this._iframe = iframe;
    this.appendChild(iframe);
  }

  _getAppUrl() {
    return new URL("/ha_voice_app/index.html", window.location.origin).toString();
  }

  _maybeSendToken() {
    const iframe = this._iframe;
    if (!iframe || !iframe.contentWindow) return;

    const token = this._hass?.auth?.accessToken;
    if (!token) return;

    iframe.contentWindow.postMessage(
      {
        type: "HA_AUTH_TOKEN",
        token,
        hassUrl: window.location.origin,
      },
      "*"
    );
  }
}

customElements.define("ha-voice-panel", HaVoicePanel);
