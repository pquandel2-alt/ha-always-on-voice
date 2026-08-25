globalThis.HAVoiceMarkup = `
  <div id="app" class="state-idle">
    <audio id="ttsPlayer" playsinline preload="auto" aria-hidden="true"></audio>
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>

    <main class="voice-shell">
      <header class="voice-header">
        <button class="header-btn back-btn" id="backBtn" type="button" aria-label="Zurück">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div class="brand-mark" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div class="brand-copy">
          <p class="eyebrow">HOME ASSISTANT</p>
          <h1>Voice Control</h1>
        </div>
        <button class="header-btn settings-btn" id="settingsBtn" type="button" aria-label="Einstellungen öffnen">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.12 2.12-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V20h-3v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06-2.12-2.12.06-.06A1.65 1.65 0 0 0 7.2 15a1.65 1.65 0 0 0-1.51-1H5.6v-3h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06L8.93 6l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V4.8h3v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 2.12 2.12-.06.06A1.65 1.65 0 0 0 20.4 10v.01a1.65 1.65 0 0 0 1.51.99H22v3h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
          </svg>
        </button>
      </header>

      <section class="transcript-area" aria-live="polite">
        <p class="assist-response" id="assistResponse"></p>
        <p class="user-transcript" id="userTranscript"></p>
      </section>

      <section class="animation-container" aria-label="HA Voice Control Status">
        <div class="orb-aura" aria-hidden="true"></div>
        <canvas id="frequencyRing" aria-hidden="true"></canvas>
        <div class="orbit orbit-outer" aria-hidden="true"><span></span></div>
        <div class="orbit orbit-inner" aria-hidden="true"><span></span></div>
        <div class="pulse-rings" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="orb" aria-hidden="true">
          <svg class="voice-core-svg" viewBox="0 0 200 200" role="presentation">
            <defs>
              <linearGradient id="fluidBase" x1="20%" y1="10%" x2="82%" y2="92%">
                <stop offset="0" stop-color="#b7fff0"/>
                <stop class="svg-accent-stop" offset="0.43"/>
                <stop offset="1" stop-color="#276f9d"/>
              </linearGradient>
              <radialGradient id="fluidShade" cx="35%" cy="25%" r="82%">
                <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
                <stop offset="0.24" stop-color="#ffffff" stop-opacity="0"/>
                <stop offset="0.72" stop-color="#102d4b" stop-opacity="0.08"/>
                <stop offset="1" stop-color="#071326" stop-opacity="0.6"/>
              </radialGradient>
              <radialGradient id="flowLight" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#e9fffa" stop-opacity="0.5"/>
                <stop offset="0.62" stop-color="#d9fff8" stop-opacity="0.2"/>
                <stop offset="1" stop-color="#d9fff8" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="flowDark" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#071a31" stop-opacity="0.58"/>
                <stop offset="0.64" stop-color="#08233f" stop-opacity="0.24"/>
                <stop offset="1" stop-color="#08233f" stop-opacity="0"/>
              </radialGradient>
              <linearGradient id="auroraBase" x1="0" y1="0.35" x2="1" y2="0.65">
                <stop offset="0" stop-color="#49e2d0"/>
                <stop offset="0.5" stop-color="#31bdf1"/>
                <stop offset="1" stop-color="#8b7cf6"/>
              </linearGradient>
              <radialGradient id="spaceBase" cx="36%" cy="28%" r="78%">
                <stop offset="0" stop-color="#214b69"/>
                <stop offset="0.48" stop-color="#0b1b31"/>
                <stop offset="1" stop-color="#050b17"/>
              </radialGradient>
              <radialGradient id="auroraLight" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#a6fff3" stop-opacity="0.58"/>
                <stop offset="1" stop-color="#8ffff0" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="auroraViolet" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#5543e0" stop-opacity="0.46"/>
                <stop offset="1" stop-color="#6555e8" stop-opacity="0"/>
              </radialGradient>
              <clipPath id="sphereClip"><circle cx="100" cy="100" r="87"/></clipPath>
              <clipPath id="auroraClip"><rect x="9" y="38" width="182" height="124" rx="62"/></clipPath>
            </defs>

            <g class="svg-design svg-sphere">
              <circle cx="100" cy="100" r="88" fill="url(#fluidBase)"/>
              <g clip-path="url(#sphereClip)">
                <ellipse class="svg-flow svg-flow-light" cx="57" cy="45" rx="105" ry="67" fill="url(#flowLight)"/>
                <ellipse class="svg-flow svg-flow-dark" cx="142" cy="151" rx="101" ry="73" fill="url(#flowDark)"/>
                <circle cx="100" cy="100" r="88" fill="url(#fluidShade)"/>
              </g>
              <ellipse cx="69" cy="53" rx="26" ry="13" fill="#fff" opacity="0.16" transform="rotate(-24 69 53)"/>
              <circle cx="100" cy="100" r="88" fill="none" stroke="#dffff7" stroke-opacity="0.28" stroke-width="1.4"/>
            </g>

            <g class="svg-design svg-aurora">
              <rect x="9" y="38" width="182" height="124" rx="62" fill="url(#auroraBase)"/>
              <g clip-path="url(#auroraClip)">
                <ellipse class="svg-aurora-wave svg-aurora-wave-one" cx="48" cy="87" rx="105" ry="76" fill="url(#auroraLight)"/>
                <ellipse class="svg-aurora-wave svg-aurora-wave-two" cx="159" cy="128" rx="108" ry="80" fill="url(#auroraViolet)"/>
              </g>
              <path d="M41 54 C83 30 151 42 178 67" fill="none" stroke="#fff" stroke-opacity="0.17" stroke-width="2" stroke-linecap="round"/>
              <rect x="9" y="38" width="182" height="124" rx="62" fill="none" stroke="#bffcff" stroke-opacity="0.32" stroke-width="1.4"/>
            </g>

            <g class="svg-design svg-constellation">
              <circle cx="100" cy="100" r="88" fill="url(#spaceBase)"/>
              <g class="svg-star-map" fill="none" stroke="#7dd3fc" stroke-opacity="0.34" stroke-width="1">
                <path d="M55 65 L117 82 L145 58 M117 82 L87 132 L148 139 M87 132 L49 112"/>
              </g>
              <g class="svg-stars" fill="#dff8ff">
                <circle cx="55" cy="65" r="3.1"/><circle cx="117" cy="82" r="2.5"/>
                <circle cx="145" cy="58" r="3.5"/><circle cx="87" cy="132" r="3"/>
                <circle cx="148" cy="139" r="2.3"/><circle cx="49" cy="112" r="3.4"/>
              </g>
              <circle cx="100" cy="100" r="88" fill="none" stroke="#7dd3fc" stroke-opacity="0.42" stroke-width="1.4"/>
            </g>

            <g class="svg-design svg-minimal">
              <circle class="svg-minimal-disc" cx="100" cy="100" r="76"/>
              <circle cx="100" cy="100" r="76" fill="none" stroke="#e5fff9" stroke-opacity="0.28" stroke-width="1.5"/>
            </g>
          </svg>
        </div>
        <div class="start-overlay visible" id="startOverlay">
          <button class="start-btn" id="startBtn" type="button">
            Mikrofon starten
          </button>
        </div>
      </section>

      <section class="status-card" aria-live="polite">
        <span class="status-dot" aria-hidden="true"></span>
        <div>
          <p class="state-indicator" id="stateIndicator">Initialisieren</p>
          <p class="state-detail" id="stateDetail">HA Voice Control wird vorbereitet …</p>
        </div>
      </section>
    </main>

    <aside class="settings-panel" id="settingsPanel" aria-hidden="true">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="settings-header">
        <div>
          <p class="eyebrow">HA VOICE CONTROL</p>
          <h2>Einstellungen</h2>
        </div>
        <button class="close-btn" id="closeSettingsBtn" type="button" aria-label="Einstellungen schließen">×</button>
      </div>
      <div class="settings-content">
        <section class="settings-section">
          <h3>Sprachausgabe und Design</h3>
          <p class="settings-hint">
            Assist-Pipeline, Erkennungsdauer, TTS-Wiedergabe und Animation stellst
            du am Gerät HA Voice Control unter Geräte &amp; Dienste ein.
          </p>
          <div class="settings-info-row">
            <span>TTS-Quelle der Pipeline</span>
            <strong id="ttsSourceLabel">Wird ermittelt …</strong>
          </div>
          <a class="settings-link" href="/config/voice-assistants/assistants">
            Assist-Pipelines verwalten
          </a>
        </section>
        <section class="settings-section">
          <h3>iPhone-Schnellzugriff</h3>
          <p class="settings-hint">
            Erstelle einen iOS-Kurzbefehl mit der Aktion
            <strong>Home Assistant → Seite öffnen → HA Voice Control</strong>.
            Öffne danach die Kurzbefehl-Details und wähle
            <strong>Zum Home-Bildschirm</strong>.
          </p>
          <ol class="shortcut-steps">
            <li>„Kurzbefehl erstellen“ öffnen</li>
            <li>Home Assistant → Seite öffnen wählen</li>
            <li>HA Voice Control auswählen und zum Home-Bildschirm hinzufügen</li>
          </ol>
          <a class="settings-link settings-link-primary" id="createShortcutBtn"
             href="shortcuts://create-shortcut">
            Kurzbefehl erstellen
          </a>
          <a class="settings-link settings-link-secondary"
             href="homeassistant://navigate/ha_always_on_voice?server=default">
            HA Voice Control direkt öffnen
          </a>
        </section>
        <button id="testMicBtn" type="button">Mikrofon testen</button>
      </div>
    </aside>
  </div>
`;
