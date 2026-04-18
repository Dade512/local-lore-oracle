/* ============================================================
   ECHOES OF BAPHOMET — WEATHER CONFIG UI v1.0
   GM-facing weather configuration panel using ApplicationV2.

   ACCESS: Scene Controls → Token Tools → cloud icon ("Weather")
   FEATURES:
   - Current weather display (temp, precip, wind, clouds)
   - Climate zone selector with friendly names + descriptions
   - Apply zone → regenerates + posts weather
   - Toggle auto-post on day advance
   - "Post Today" and "Reroll Today" buttons
   - Graceful handling when Simple Calendar is missing

   STYLE: Croaker's Ledger — parchment, brass, iron gall ink.
   Uses existing --baph-* CSS variables from noir-theme.css.

   SCENE CONTROLS HOOK (v13 API):
   - In Foundry v13, controls is Record<string, SceneControl>
   - tools is Record<string, SceneControlTool>
   - Button tools use onChange (NOT onClick, which was v12)
   - order is required (non-optional number)

   For Foundry VTT v13 + PF1e System
   Requires: weather-engine.js (loaded before this file)
   ============================================================ */

const WU_MODULE_ID = 'baphomet-utils';

/* ----------------------------------------------------------
   APPLICATION CLASS
   Uses ApplicationV2 directly with _renderHTML returning
   programmatic DOM. No Handlebars templates needed.
   ---------------------------------------------------------- */

let _weatherUIInstance = null;

class BaphometWeatherConfig extends foundry.applications.api.ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id: 'baph-weather-config',
    classes: ['baph-weather-config'],
    position: { width: 340, height: 'auto' },
    window: {
      title: 'Weather — The Ledger',
      icon: 'fas fa-cloud-sun',
      resizable: false,
    },
    actions: {
      applyZone: BaphometWeatherConfig.#onApplyZone,
      postToday: BaphometWeatherConfig.#onPostToday,
      rerollToday: BaphometWeatherConfig.#onRerollToday,
      toggleAutoPost: BaphometWeatherConfig.#onToggleAutoPost,
    },
  };

  /* ── Render ────────────────────────────────────────────── */

  async _renderHTML(_context, _options) {
    const container = document.createElement('div');
    container.classList.add('baph-weather-body');

    const api = game.baphometWeather;
    if (!api) {
      container.innerHTML = `<p class="baph-wui-notice">Weather engine not initialized.</p>`;
      return container;
    }

    const state = await game.settings.get(WU_MODULE_ID, 'weatherState');
    const weather = state?.lastWeather;
    const climateKey = state?.climateZone ?? 'temperate';
    const autoPost = state?.postToChat ?? true;
    const hasSC = typeof SimpleCalendar !== 'undefined';

    // ── Current Weather Display ──
    const currentSection = document.createElement('div');
    currentSection.classList.add('baph-wui-section', 'baph-wui-current');

    if (weather && hasSC) {
      currentSection.innerHTML = `
        <div class="baph-wui-date">${weather.monthName} ${weather.day}, ${weather.year} AR</div>
        <div class="baph-wui-temp">
          <span class="baph-wui-high">${weather.highTemp}°F</span>
          <span class="baph-wui-sep">/</span>
          <span class="baph-wui-low">${weather.lowTemp}°F</span>
          <span class="baph-wui-tempdesc">— ${weather.tempDesc}</span>
        </div>
        <div class="baph-wui-detail baph-wui-precip ${weather.isRaining ? 'active' : ''}">${weather.precipDesc}</div>
        <div class="baph-wui-detail">${weather.windDesc} (${weather.windSpeed} mph${weather.windGust > weather.windSpeed ? `, gusts ${weather.windGust}` : ''})</div>
        <div class="baph-wui-detail baph-wui-clouds">${weather.cloudDesc}</div>
      `;
    } else if (!hasSC) {
      currentSection.innerHTML = `<p class="baph-wui-notice">Simple Calendar not detected.<br>Install Simple Calendar Reborn for weather generation.</p>`;
    } else {
      currentSection.innerHTML = `<p class="baph-wui-notice">No weather generated yet.<br>Advance the calendar or click Reroll.</p>`;
    }
    container.appendChild(currentSection);

    // ── Action Buttons ──
    // Post Today: enabled if SC is present (post() calls today() internally,
    // which generates weather on demand even if none is cached yet)
    // Reroll: enabled if SC is present
    const actions = document.createElement('div');
    actions.classList.add('baph-wui-actions');
    actions.innerHTML = `
      <button type="button" class="baph-wui-btn" data-action="postToday" ${!hasSC ? 'disabled' : ''}>
        <i class="fas fa-scroll"></i> Post Today
      </button>
      <button type="button" class="baph-wui-btn" data-action="rerollToday" ${!hasSC ? 'disabled' : ''}>
        <i class="fas fa-dice"></i> Reroll
      </button>
    `;
    container.appendChild(actions);

    // ── Divider ──
    const divider = document.createElement('div');
    divider.classList.add('baph-wui-divider');
    container.appendChild(divider);

    // ── Climate Zone Selector ──
    const zoneSection = document.createElement('div');
    zoneSection.classList.add('baph-wui-section');

    const zoneLabel = document.createElement('div');
    zoneLabel.classList.add('baph-wui-label');
    zoneLabel.textContent = 'Climate Zone';
    zoneSection.appendChild(zoneLabel);

    const select = document.createElement('select');
    select.classList.add('baph-wui-select');
    select.name = 'climateZone';

    for (const [key, zone] of Object.entries(GOLARION_CLIMATES)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = `${zone.name}`;
      opt.title = zone.description;
      if (key === climateKey) opt.selected = true;
      select.appendChild(opt);
    }
    zoneSection.appendChild(select);

    // Zone description (updates on change)
    const zoneDesc = document.createElement('div');
    zoneDesc.classList.add('baph-wui-zone-desc');
    zoneDesc.textContent = GOLARION_CLIMATES[climateKey]?.description ?? '';
    zoneSection.appendChild(zoneDesc);

    select.addEventListener('change', () => {
      const desc = GOLARION_CLIMATES[select.value]?.description ?? '';
      zoneDesc.textContent = desc;
    });

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.classList.add('baph-wui-btn', 'baph-wui-btn-primary');
    applyBtn.dataset.action = 'applyZone';
    applyBtn.innerHTML = '<i class="fas fa-map-marked-alt"></i> Apply Zone';
    zoneSection.appendChild(applyBtn);

    container.appendChild(zoneSection);

    // ── Auto-Post Toggle ──
    const toggleSection = document.createElement('div');
    toggleSection.classList.add('baph-wui-section', 'baph-wui-toggle-row');

    const toggleLabel = document.createElement('span');
    toggleLabel.classList.add('baph-wui-label');
    toggleLabel.textContent = 'Auto-post on day advance';
    toggleSection.appendChild(toggleLabel);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.classList.add('baph-wui-toggle', autoPost ? 'active' : '');
    toggleBtn.dataset.action = 'toggleAutoPost';
    toggleBtn.textContent = autoPost ? 'ON' : 'OFF';
    toggleBtn.title = autoPost ? 'Auto-posting enabled' : 'Auto-posting disabled';
    toggleSection.appendChild(toggleBtn);

    container.appendChild(toggleSection);

    return container;
  }

  _replaceHTML(result, content, options) {
    content.replaceChildren(result);
  }

  /* ── Actions ──────────────────────────────────────────── */

  static async #onApplyZone(event, target) {
    const select = this.element.querySelector('select[name="climateZone"]');
    if (!select) return;
    const zoneKey = select.value;
    await game.baphometWeather?.setClimate(zoneKey);
    this.render({ force: true });
  }

  static async #onPostToday() {
    await game.baphometWeather?.post();
    // Refresh panel in case weather was generated for the first time
    this.render({ force: true });
  }

  static async #onRerollToday() {
    await game.baphometWeather?.reroll();
    const weather = await game.baphometWeather?.today();
    if (weather) game.baphometWeather?.post();
    this.render({ force: true });
  }

  static async #onToggleAutoPost() {
    await game.baphometWeather?.toggleChat();
    this.render({ force: true });
  }
}

/* ----------------------------------------------------------
   SCENE CONTROLS BUTTON
   
   Foundry v13 (13.350) API:
   - controls is Record<string, SceneControl> (object, not array)
   - tools is Record<string, SceneControlTool> (object, not array)
   - Tool buttons use onChange (NOT onClick — that was v12)
   - order is required (non-optional number)
   - button: true makes it a one-shot button (no toggle state)
   
   Defensive: guard against controls.tokens not existing.
   ---------------------------------------------------------- */

Hooks.on('getSceneControlButtons', (controls) => {
  if (!game.user.isGM) return;

  // v13: controls is an object keyed by control name
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) {
    console.warn(`${WU_MODULE_ID} | Weather UI: Could not find token controls for scene button`);
    return;
  }

  tokenControls.tools.baphWeather = {
    name: 'baphWeather',
    title: 'Weather Config',
    icon: 'fas fa-cloud-sun',
    button: true,
    visible: game.user.isGM,
    order: Object.keys(tokenControls.tools).length,
    onChange: () => {
      if (_weatherUIInstance?.rendered) {
        _weatherUIInstance.close();
      } else {
        if (!_weatherUIInstance) {
          _weatherUIInstance = new BaphometWeatherConfig();
        }
        _weatherUIInstance.render({ force: true });
      }
    },
  };
});

/* ----------------------------------------------------------
   READY — log
   ---------------------------------------------------------- */

Hooks.once('ready', () => {
  if (!game.user.isGM) return;
  console.log(`${WU_MODULE_ID} | Weather Config UI v1.0 ready`);
});
