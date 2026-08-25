globalThis.HAVoiceMarkup = `
  <div id="app" class="state-idle">
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>

    <main class="voice-shell">
      <header class="voice-header">
        <div class="brand-mark" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        <div>
          <p class="eyebrow">HOME ASSISTANT</p>
          <h1>Voice</h1>
        </div>
      </header>

      <section class="transcript-area" aria-live="polite">
        <p class="assist-response" id="assistResponse"></p>
        <p class="user-transcript" id="userTranscript"></p>
      </section>

      <section class="animation-container" aria-label="Voice Assist Status">
        <div class="orb-aura" aria-hidden="true"></div>
        <canvas id="frequencyRing" aria-hidden="true"></canvas>
        <div class="orb" aria-hidden="true">
          <div class="orb-surface"></div>
          <div class="orb-highlight"></div>
          <div class="orb-core"></div>
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
          <p class="state-detail" id="stateDetail">Voice Assist wird vorbereitet …</p>
        </div>
      </section>
    </main>

    <button class="settings-btn" id="settingsBtn" type="button" aria-label="Einstellungen öffnen">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.12 2.12-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V20h-3v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06-2.12-2.12.06-.06A1.65 1.65 0 0 0 7.2 15a1.65 1.65 0 0 0-1.51-1H5.6v-3h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06L8.93 6l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 .99-1.51V4.8h3v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06 2.12 2.12-.06.06A1.65 1.65 0 0 0 20.4 10v.01a1.65 1.65 0 0 0 1.51.99H22v3h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
      </svg>
    </button>

    <aside class="settings-panel" id="settingsPanel" aria-hidden="true">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="settings-header">
        <div>
          <p class="eyebrow">VOICE ASSIST</p>
          <h2>Einstellungen</h2>
        </div>
        <button class="close-btn" id="closeSettingsBtn" type="button" aria-label="Einstellungen schließen">×</button>
      </div>
      <div class="settings-content">
        <p class="settings-hint">
          Pipeline und Erkennungsdauer stellst du in Home Assistant unter
          Einstellungen → Sprachassistenten → Geräte → Voice Assist ein.
        </p>
        <button id="testMicBtn" type="button">Mikrofon testen</button>
      </div>
    </aside>
  </div>
`;
