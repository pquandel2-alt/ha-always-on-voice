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
          <div class="orb-surface"></div>
          <div class="liquid-layer liquid-layer-one"></div>
          <div class="liquid-layer liquid-layer-two"></div>
          <div class="orb-highlight"></div>
          <div class="orb-core"></div>
          <div class="orb-stars"><i></i><i></i><i></i><i></i><i></i><i></i></div>
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
