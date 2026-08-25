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
                <stop offset="0" stop-color="#e1fff9"/>
                <stop offset="0.18" stop-color="#94f3de"/>
                <stop class="svg-accent-stop" offset="0.48"/>
                <stop offset="0.76" stop-color="#247da8"/>
                <stop offset="1" stop-color="#0a294b"/>
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
              <radialGradient id="specularGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#ffffff" stop-opacity="0.72"/>
                <stop offset="0.36" stop-color="#f4fffd" stop-opacity="0.34"/>
                <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="depthGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#4ddfc7" stop-opacity="0.32"/>
                <stop offset="0.58" stop-color="#1c7ca0" stop-opacity="0.12"/>
                <stop offset="1" stop-color="#08213c" stop-opacity="0"/>
              </radialGradient>
              <linearGradient id="causticStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
                <stop offset="0.42" stop-color="#eafffb" stop-opacity="0.5"/>
                <stop offset="0.72" stop-color="#a9f9eb" stop-opacity="0.2"/>
                <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
              </linearGradient>
              <linearGradient id="rimLight" x1="12%" y1="8%" x2="86%" y2="92%">
                <stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/>
                <stop offset="0.38" stop-color="#dffff8" stop-opacity="0.14"/>
                <stop offset="0.7" stop-color="#7ce7d5" stop-opacity="0.08"/>
                <stop offset="1" stop-color="#55c8e8" stop-opacity="0.52"/>
              </linearGradient>
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
              <linearGradient id="equalizerShell" x1="12%" y1="5%" x2="88%" y2="96%">
                <stop class="equalizer-color equalizer-color-one" offset="0"/>
                <stop class="equalizer-color equalizer-color-two" offset="0.18"/>
                <stop class="equalizer-color equalizer-color-three" offset="0.46"/>
                <stop class="equalizer-color equalizer-color-four" offset="0.72"/>
                <stop class="equalizer-color equalizer-color-five" offset="1"/>
              </linearGradient>
              <radialGradient id="equalizerPearl" cx="42%" cy="36%" r="65%">
                <stop offset="0" stop-color="#ffffff" stop-opacity="0.76"/>
                <stop offset="0.24" stop-color="#effffb" stop-opacity="0.22"/>
                <stop offset="0.58" stop-color="#baffef" stop-opacity="0.04"/>
                <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="equalizerDepth" cx="68%" cy="76%" r="74%">
                <stop offset="0" stop-color="#03162f" stop-opacity="0.86"/>
                <stop offset="0.36" stop-color="#073b66" stop-opacity="0.56"/>
                <stop offset="1" stop-color="#0d355e" stop-opacity="0"/>
              </radialGradient>
              <linearGradient id="equalizerCaustic" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0" stop-color="#dffff8" stop-opacity="0"/>
                <stop offset="0.44" stop-color="#f1fffc" stop-opacity="0.72"/>
                <stop offset="0.72" stop-color="#a4ffec" stop-opacity="0.22"/>
                <stop offset="1" stop-color="#dffff8" stop-opacity="0"/>
              </linearGradient>
              <filter id="equalizerGlow" x="-45%" y="-45%" width="190%" height="190%">
                <feGaussianBlur stdDeviation="8"/>
              </filter>
              <path id="fluidShape" d="M100 12 C151 8 188 45 187 98 C186 149 151 187 100 188 C49 189 13 152 13 101 C13 50 49 16 100 12 Z">
                <animate attributeName="d" dur="7s" repeatCount="indefinite"
                  calcMode="spline" keyTimes="0;0.33;0.66;1"
                  keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"
                  values="M100 12 C151 8 188 45 187 98 C186 149 151 187 100 188 C49 189 13 152 13 101 C13 50 49 16 100 12 Z;
                          M93 19 C144 1 192 30 187 86 C183 142 167 184 112 190 C55 196 15 169 14 116 C13 66 42 34 93 19 Z;
                          M108 11 C164 18 181 57 189 110 C197 162 141 192 87 185 C34 178 15 139 15 87 C15 37 55 4 108 11 Z;
                          M100 12 C151 8 188 45 187 98 C186 149 151 187 100 188 C49 189 13 152 13 101 C13 50 49 16 100 12 Z"/>
              </path>
              <clipPath id="sphereClip"><use href="#fluidShape"/></clipPath>
              <clipPath id="auroraClip"><rect x="9" y="38" width="182" height="124" rx="62"/></clipPath>
              <clipPath id="equalizerClip">
                <path id="equalizerClipPath" d="M100 15 C151 15 185 49 185 100 C185 151 151 185 100 185 C49 185 15 151 15 100 C15 49 49 15 100 15 Z"/>
              </clipPath>
            </defs>

            <g class="svg-design svg-sphere">
              <use href="#fluidShape" fill="url(#fluidBase)"/>
              <g clip-path="url(#sphereClip)">
                <ellipse class="svg-flow svg-flow-light" cx="57" cy="45" rx="105" ry="67" fill="url(#flowLight)"/>
                <ellipse class="svg-flow svg-flow-dark" cx="142" cy="151" rx="101" ry="73" fill="url(#flowDark)"/>
                <circle cx="100" cy="100" r="88" fill="url(#fluidShade)"/>
                <ellipse class="svg-refraction" cx="124" cy="148" rx="73" ry="43" fill="url(#depthGlow)"/>
                <path class="svg-caustic svg-caustic-one" d="M26 105 C55 78 84 91 111 75 C137 60 164 73 181 96"
                  fill="none" stroke="url(#causticStroke)" stroke-width="3.1" stroke-linecap="round"/>
                <path class="svg-caustic svg-caustic-two" d="M43 132 C70 113 101 122 124 106 C144 92 159 98 172 111"
                  fill="none" stroke="url(#causticStroke)" stroke-width="1.7" stroke-linecap="round" opacity="0.55"/>
                <ellipse class="svg-specular" cx="62" cy="48" rx="37" ry="25" fill="url(#specularGlow)" transform="rotate(-25 62 48)"/>
                <path d="M38 66 C53 37 78 27 103 25" fill="none" stroke="#fff" stroke-opacity="0.24"
                  stroke-width="2.2" stroke-linecap="round"/>
              </g>
              <use href="#fluidShape" fill="none" stroke="#03111f" stroke-opacity="0.4" stroke-width="3"/>
              <use href="#fluidShape" fill="none" stroke="url(#rimLight)" stroke-width="1.5"/>
            </g>

            <g class="svg-design svg-equalizer">
              <path id="equalizerAuraPath" d="M100 15 C151 15 185 49 185 100 C185 151 151 185 100 185 C49 185 15 151 15 100 C15 49 49 15 100 15 Z"
                fill="var(--accent)" opacity="0.22" filter="url(#equalizerGlow)"
                transform="translate(100 100) scale(1.14) translate(-100 -100)"/>
              <path id="equalizerMainPath" d="M100 15 C151 15 185 49 185 100 C185 151 151 185 100 185 C49 185 15 151 15 100 C15 49 49 15 100 15 Z"
                fill="url(#equalizerShell)"/>
              <g clip-path="url(#equalizerClip)">
                <ellipse id="equalizerLightField" cx="70" cy="61" rx="76" ry="54" fill="url(#equalizerPearl)"/>
                <ellipse id="equalizerDarkField" cx="137" cy="143" rx="82" ry="67" fill="url(#equalizerDepth)"/>
                <path id="equalizerWaveOne" d="M18 96 C50 70 75 88 101 70 C130 51 158 65 185 89"
                  fill="none" stroke="url(#equalizerCaustic)" stroke-width="3.2" stroke-linecap="round"/>
                <path id="equalizerWaveTwo" d="M22 124 C55 103 85 118 113 96 C140 76 163 88 186 104"
                  fill="none" stroke="url(#equalizerCaustic)" stroke-width="1.5" stroke-linecap="round" opacity="0.58"/>
                <ellipse id="equalizerSpecular" cx="67" cy="57" rx="27" ry="18" fill="url(#equalizerPearl)" transform="rotate(-28 67 57)"/>
              </g>
              <path id="equalizerShadowRim" d="M100 15 C151 15 185 49 185 100 C185 151 151 185 100 185 C49 185 15 151 15 100 C15 49 49 15 100 15 Z"
                fill="none" stroke="#020b18" stroke-opacity="0.62" stroke-width="3"/>
              <path id="equalizerRimPath" d="M100 15 C151 15 185 49 185 100 C185 151 151 185 100 185 C49 185 15 151 15 100 C15 49 49 15 100 15 Z"
                fill="none" stroke="#d9fff7" stroke-opacity="0.48" stroke-width="1.2"/>
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
        <div class="status-copy">
          <p class="state-indicator" id="stateIndicator">Initialisieren</p>
          <p class="state-detail" id="stateDetail">HA Voice Control wird vorbereitet …</p>
        </div>
        <button class="mic-toggle-btn" id="micToggleBtn" type="button" aria-label="Mikrofon pausieren">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3M9 22h6"/>
          </svg>
        </button>
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
          <h3>Assist und Darstellung</h3>
          <label class="setting-field">
            <span>Assist-Pipeline</span>
            <select id="pipelineSetting"></select>
          </label>
          <label class="setting-field">
            <span>Ende der Spracheingabe</span>
            <select id="vadSetting"></select>
          </label>
          <label class="setting-field">
            <span>Animation</span>
            <select id="animationSetting"></select>
          </label>
          <label class="setting-field">
            <span>Sprachausgabe</span>
            <select id="ttsSetting"></select>
          </label>
          <div class="settings-info-row">
            <span>TTS-Quelle der Pipeline</span>
            <strong id="ttsSourceLabel">Wird ermittelt …</strong>
          </div>
          <a class="settings-link" href="/config/voice-assistants/assistants">
            Assist-Pipelines verwalten
          </a>
        </section>
        <section class="settings-section">
          <h3>iPhone-/Browser-Stimme</h3>
          <label class="setting-field">
            <span>Stimme</span>
            <select id="browserVoiceSetting"><option value="">Systemstandard</option></select>
          </label>
          <label class="setting-field setting-range">
            <span>Lautstärke <strong id="volumeValue">100 %</strong></span>
            <input id="volumeSetting" type="range" min="0" max="100" step="5" value="100">
          </label>
          <label class="setting-field setting-range">
            <span>Sprechgeschwindigkeit <strong id="speechRateValue">1,0×</strong></span>
            <input id="speechRateSetting" type="range" min="0.7" max="1.3" step="0.1" value="1">
          </label>
        </section>
        <section class="settings-section diagnostics-section">
          <h3>Systemdiagnose</h3>
          <div class="diagnostic-grid">
            <span>Mikrofon</span><strong id="diagMic">Prüfung ausstehend</strong>
            <span>Verbindung</span><strong id="diagConnection">Wird verbunden</strong>
            <span>Assist-Pipeline</span><strong id="diagPipeline">Wird ermittelt</strong>
            <span>Spracherkennung</span><strong id="diagStt">Noch nicht verwendet</strong>
            <span>TTS-Anbieter</span><strong id="diagTts">Wird ermittelt</strong>
            <span>Audioausgabe</span><strong id="diagAudio">Prüfung ausstehend</strong>
          </div>
          <div class="latency-grid" aria-label="Letzte Laufzeiten">
            <div><span>STT</span><strong id="latencyStt">–</strong></div>
            <div><span>Antwort</span><strong id="latencyIntent">–</strong></div>
            <div><span>TTS</span><strong id="latencyTts">–</strong></div>
          </div>
          <button id="runDiagnosticsBtn" type="button">Systemcheck starten</button>
        </section>
        <section class="settings-section quick-access-note">
          <h3>iPhone-Schnellzugriff</h3>
          <p class="settings-hint">
            Nutze das offizielle Home-Assistant-Widget <strong>„Seite öffnen“</strong>
            und wähle <strong>HA Voice Control</strong>. Ein zusätzlicher Kurzbefehl
            oder Direktlink ist nicht erforderlich.
          </p>
        </section>
      </div>
    </aside>
  </div>
`;
