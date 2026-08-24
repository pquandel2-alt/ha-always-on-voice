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

    this.style.display = "block";
    this.style.width = "100%";
    this.style.height = "100%";

    const iframe = document.createElement("iframe");
    iframe.id = "voice-app";
    iframe.src = this._getAppUrl();
    iframe.setAttribute("allow", "microphone");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
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
