import { LitElement, html, css } from "https://cdn.jsdelivr.net/gh/lit/lit@3/dist/index.js";

class HaVoicePanel extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      narrow: { type: Boolean },
      route: { type: Object },
    };
  }

  static get styles() {
    return css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
      }
    `;
  }

  render() {
    return html`
      <iframe
        id="voice-app"
        src="${this._getAppUrl()}"
        allow="microphone"
        @load="${this._onIframeLoad}"
      ></iframe>
    `;
  }

  _getAppUrl() {
    const url = new URL("/ha_voice_app/index.html", window.location.origin);
    return url.toString();
  }

  _onIframeLoad() {
    const iframe = this.shadowRoot.querySelector("iframe");
    if (!iframe || !iframe.contentWindow) return;

    const token = this.hass?.auth?.accessToken;
    if (!token) {
      console.error("No access token available");
      return;
    }

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
