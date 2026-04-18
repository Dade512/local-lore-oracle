/* ============================================================
   ECHOES OF BAPHOMET — WEATHER ENGINE v1.1
   Season-aware, climate-zone-based weather generation
   integrated with Simple Calendar.

   v1.1 Changes:
   - [BUG FIX] Math.clamp → Math.clamped (Foundry API).
   - [BUG FIX] getWeatherFor API properly async — was mixing
     sync + async, silently defaulting to 'temperate'.
   - [CLEANUP] Trimmed verbose debug logging for production.
   - [UI] Weather state exposed for weather-ui.js consumption.

   WHAT IT DOES:
   - Reads current date from Simple Calendar
   - Determines current season from Golarion calendar
   - Generates daily weather (temp, wind, precipitation, clouds)
     based on the active climate zone
   - GM can change climate zone via macro API or Weather UI
   - Stores current weather in module settings for persistence
   - Posts daily weather to chat in Croaker's Ledger style

   HOOKS:
   - simple-calendar-date-time-change: fires when SC date changes
   - ready: initialize weather state

   DEPENDENCIES:
   - Simple Calendar Reborn (foundryvtt-simple-calendar-reborn)
   - baphomet-utils climate-zones.js (loaded first via module.json)

   For Foundry VTT v13 + PF1e System
   ============================================================ */

const WE_MODULE_ID = 'baphomet-utils';

/* ----------------------------------------------------------
   GOLARION SEASON MAPPING
   ---------------------------------------------------------- */

const GOLARION_MONTHS = [
  'Abadius', 'Calistril', 'Pharast', 'Gozran',
  'Desnus', 'Sarenith', 'Erastus', 'Arodus',
  'Rova', 'Lamashan', 'Neth', 'Kuthona'
];

const MONTH_TO_SEASON = {
  0: 'winter', 1: 'winter', 2: 'spring', 3: 'spring',
  4: 'spring', 5: 'summer', 6: 'summer', 7: 'summer',
  8: 'fall',   9: 'fall',  10: 'fall',  11: 'winter',
};

/* ----------------------------------------------------------
   SEEDED RANDOM NUMBER GENERATOR (mulberry32)
   ---------------------------------------------------------- */

function _mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function _getWeatherSeed(year, dayOfYear, climateName) {
  let hash = 0;
  const str = `${year}-${dayOfYear}-${climateName}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/* ----------------------------------------------------------
   WEATHER GENERATION
   ---------------------------------------------------------- */

function generateWeather(year, monthIndex, day, climateKey) {
  const climate = GOLARION_CLIMATES[climateKey];
  if (!climate) {
    console.warn(`${WE_MODULE_ID} | Weather: Unknown climate zone "${climateKey}"`);
    return null;
  }

  const season = MONTH_TO_SEASON[monthIndex];
  if (!season) {
    console.warn(`${WE_MODULE_ID} | Weather: Unknown month index ${monthIndex}`);
    return null;
  }

  const params = climate.seasons[season];
  const monthName = GOLARION_MONTHS[monthIndex] ?? 'Unknown';

  // Day of year for seed
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let dayOfYear = day;
  for (let i = 0; i < monthIndex; i++) dayOfYear += monthLengths[i];

  const seed = _getWeatherSeed(year, dayOfYear, climateKey);
  const rng = _mulberry32(seed);

  // Temperature
  const tempVariance = (rng() * 2 - 1) * params.variance;
  const highTemp = Math.round(params.base + tempVariance);
  const lowTemp = Math.round(highTemp - params.nightDrop + (rng() * 4 - 2));

  // Precipitation
  const precipRoll = rng() * 100;
  const isRaining = precipRoll < params.precipitation;
  let precipType = 'none';
  let precipIntensity = 'none';

  if (isRaining) {
    const typeIndex = Math.floor(rng() * params.precipType.length);
    precipType = params.precipType[typeIndex];
    const intensityRoll = rng();
    if (intensityRoll < 0.5) precipIntensity = 'light';
    else if (intensityRoll < 0.85) precipIntensity = 'moderate';
    else precipIntensity = 'heavy';
  }

  // Wind
  const windVariance = rng() * 8 - 4;
  const windSpeed = Math.max(0, Math.round(params.windBase + windVariance));
  const gustChance = rng();
  const windGust = gustChance < 0.3
    ? Math.round(windSpeed + rng() * (params.windGust - params.windBase))
    : windSpeed;

  // Cloud Cover — v1.1 FIX: Math.clamped instead of Math.clamp
  const cloudBase = params.precipitation + (rng() * 20 - 10);
  const cloudCover = Math.clamped(Math.round(cloudBase), 0, 100);

  // Descriptive text
  const tempDesc = _pickDescription(TEMP_DESCRIPTIONS, highTemp, rng);
  const windDesc = _pickDescription(WIND_DESCRIPTIONS, windSpeed, rng);
  const cloudDesc = _pickDescription(CLOUD_DESCRIPTIONS, cloudCover, rng);

  let precipDesc = 'No precipitation';
  if (isRaining) {
    const intensityWord = precipIntensity === 'light' ? 'Light'
      : precipIntensity === 'moderate' ? 'Moderate' : 'Heavy';
    precipDesc = `${intensityWord} ${precipType}`;
  }

  return {
    year, monthIndex, monthName, day, season,
    climate: climateKey, climateName: climate.name,
    highTemp, lowTemp, tempDesc,
    isRaining, precipType, precipIntensity, precipDesc,
    windSpeed, windGust, windDesc,
    cloudCover, cloudDesc,
    summary: _buildWeatherSummary(highTemp, lowTemp, precipDesc, windDesc, cloudDesc, season, climate.name),
  };
}

function _pickDescription(table, value, rng) {
  for (const tier of table) {
    const maxKey = tier.maxTemp ?? tier.maxSpeed ?? tier.maxChance ?? 999;
    if (value <= maxKey) {
      const idx = Math.floor(rng() * tier.options.length);
      return tier.options[idx];
    }
  }
  return table[table.length - 1].options[0];
}

function _buildWeatherSummary(high, low, precip, wind, clouds, season, climateName) {
  return `${climateName} — ${season.charAt(0).toUpperCase() + season.slice(1)}\n` +
    `High ${high}°F / Low ${low}°F\n` +
    `${clouds}. ${precip}. ${wind}.`;
}

/* ----------------------------------------------------------
   STATE MANAGEMENT
   ---------------------------------------------------------- */

async function _getWeatherState() {
  return game.settings.get(WE_MODULE_ID, 'weatherState') ?? {
    climateZone: 'temperate',
    lastWeather: null,
    lastDate: null,
    postToChat: true,
  };
}

async function _setWeatherState(state) {
  await game.settings.set(WE_MODULE_ID, 'weatherState', state);
}

/* ----------------------------------------------------------
   SIMPLE CALENDAR INTEGRATION
   ---------------------------------------------------------- */

function _getCurrentDateFromSC() {
  if (typeof SimpleCalendar === 'undefined') return null;
  const currentDate = SimpleCalendar.api.currentDateTime();
  if (!currentDate) return null;
  return {
    year: currentDate.year,
    monthIndex: currentDate.month,
    day: currentDate.day + 1,
  };
}

/* ----------------------------------------------------------
   GENERATE & DISPLAY
   ---------------------------------------------------------- */

async function generateTodayWeather(forceRegenerate = false) {
  if (!game.user.isGM) return null;

  const date = _getCurrentDateFromSC();
  if (!date) return null;

  const state = await _getWeatherState();
  const dateKey = `${date.year}-${date.monthIndex}-${date.day}`;

  if (!forceRegenerate && state.lastDate === dateKey && state.lastWeather) {
    return state.lastWeather;
  }

  const weather = generateWeather(date.year, date.monthIndex, date.day, state.climateZone);
  if (!weather) return null;

  state.lastWeather = weather;
  state.lastDate = dateKey;
  await _setWeatherState(state);

  console.log(`${WE_MODULE_ID} | Weather: ${weather.monthName} ${weather.day}, ${weather.year} — ${weather.highTemp}°F/${weather.lowTemp}°F, ${weather.precipDesc} (${weather.climateName})`);
  return weather;
}

/* ----------------------------------------------------------
   CHAT OUTPUT — Croaker's Ledger style
   ---------------------------------------------------------- */

function _postWeatherToChat(weather) {
  if (!weather) return;

  const precipColor = weather.isRaining
    ? 'var(--baph-blood, #6e2a22)'
    : 'var(--baph-ink-faint, #8a7b6e)';

  const content = `
    <div style="font-family: var(--baph-font-heading, 'Courier Prime', monospace); border-top: 2px solid var(--baph-brass, #9e7d43); padding-top: 4px;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--baph-brass-readable, #846528); margin-bottom: 4px;">
        ☁ Weather — ${weather.monthName} ${weather.day}, ${weather.year} AR
      </div>
      <div style="font-family: var(--baph-font-body, 'Alegreya', serif); font-size: 12px; color: var(--baph-ink-primary, #2a231d); line-height: 1.5;">
        <div style="margin-bottom: 2px;">
          <strong style="font-family: var(--baph-font-mono, 'IBM Plex Mono', monospace);">${weather.highTemp}°F</strong> /
          <span style="color: var(--baph-ink-secondary, #5e5246);">${weather.lowTemp}°F</span>
          — ${weather.tempDesc}
        </div>
        <div style="margin-bottom: 2px; color: ${precipColor};">${weather.precipDesc}</div>
        <div style="margin-bottom: 2px;">${weather.windDesc} (${weather.windSpeed} mph${weather.windGust > weather.windSpeed ? `, gusts ${weather.windGust}` : ''})</div>
        <div style="color: var(--baph-ink-secondary, #5e5246);">${weather.cloudDesc}</div>
      </div>
      <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--baph-ink-faint, #8a7b6e); margin-top: 4px; border-top: 1px solid var(--baph-leather-mid, #8a7b66); padding-top: 3px;">
        ${weather.climateName} · ${weather.season}
      </div>
    </div>
  `;

  ChatMessage.create({
    content,
    speaker: { alias: "The Ledger" },
    whisper: game.users.filter(u => u.isGM).map(u => u.id),
  });
}

/* ----------------------------------------------------------
   HOOKS & INITIALIZATION
   ---------------------------------------------------------- */

Hooks.once('init', () => {
  game.settings.register(WE_MODULE_ID, 'weatherState', {
    name: 'Weather Engine State',
    scope: 'world',
    config: false,
    type: Object,
    default: {
      climateZone: 'temperate',
      lastWeather: null,
      lastDate: null,
      postToChat: true,
    }
  });
  console.log(`${WE_MODULE_ID} | Weather Engine v1.1: Settings registered`);
});

Hooks.once('ready', async () => {
  if (!game.user.isGM) return;

  const weather = await generateTodayWeather();
  const state = await _getWeatherState();
  if (weather) {
    console.log(`${WE_MODULE_ID} | Weather Engine v1.1 ready — ${weather.climateName}, ${weather.season}`);
  } else {
    console.log(`${WE_MODULE_ID} | Weather Engine v1.1 ready — no Simple Calendar date available`);
  }

  // Expose API
  game.baphometWeather = {
    /** Generate (or retrieve cached) today's weather */
    today: generateTodayWeather,

    /** Force regenerate today's weather */
    reroll: () => generateTodayWeather(true),

    /** Post current weather to chat (GM whisper) */
    post: async () => {
      const weather = await generateTodayWeather();
      _postWeatherToChat(weather);
    },

    /** Get current climate zone key */
    getClimate: async () => (await _getWeatherState()).climateZone,

    /** Set climate zone, regenerate + post weather */
    setClimate: async (zoneKey) => {
      if (!GOLARION_CLIMATES[zoneKey]) {
        const valid = Object.keys(GOLARION_CLIMATES).join(', ');
        console.error(`${WE_MODULE_ID} | Invalid climate zone "${zoneKey}". Valid: ${valid}`);
        return;
      }
      const state = await _getWeatherState();
      state.climateZone = zoneKey;
      state.lastWeather = null;
      state.lastDate = null;
      await _setWeatherState(state);
      console.log(`${WE_MODULE_ID} | Climate zone → ${GOLARION_CLIMATES[zoneKey].name}`);
      const weather = await generateTodayWeather(true);
      _postWeatherToChat(weather);
    },

    /** List available climate zones */
    listClimates: () => {
      console.log(`${WE_MODULE_ID} | Climate zones:`);
      for (const [key, zone] of Object.entries(GOLARION_CLIMATES)) {
        console.log(`  ${key}: ${zone.name} — ${zone.description}`);
      }
      return Object.keys(GOLARION_CLIMATES);
    },

    /** Toggle chat posting on day advance */
    toggleChat: async () => {
      const state = await _getWeatherState();
      state.postToChat = !state.postToChat;
      await _setWeatherState(state);
      console.log(`${WE_MODULE_ID} | Weather auto-post: ${state.postToChat ? 'ON' : 'OFF'}`);
    },

    /** Get weather for a specific date
     *  v1.1 FIX: properly async — no longer silently defaults to temperate
     */
    getWeatherFor: async (year, monthIndex, day, climateKey) => {
      let key = climateKey;
      if (!key) {
        const state = await _getWeatherState();
        key = state.climateZone || 'temperate';
      }
      return generateWeather(year, monthIndex, day, key);
    },
  };
});

/* ── Simple Calendar date change hook ────────────────────── */
Hooks.on('simple-calendar-date-time-change', async (data) => {
  if (!game.user.isGM) return;

  const weather = await generateTodayWeather(true);
  if (!weather) return;

  const state = await _getWeatherState();
  if (state.postToChat) {
    _postWeatherToChat(weather);
  }
});
