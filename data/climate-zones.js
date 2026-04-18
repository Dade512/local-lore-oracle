/* ============================================================
   ECHOES OF BAPHOMET — GOLARION CLIMATE ZONES
   Climate presets for weather generation.

   Each zone defines temperature ranges (°F), precipitation
   chance (%), and wind speed ranges (mph) per season.

   Temperature model:
   - base: average daily high for the season
   - variance: random daily swing (+/-)
   - nightDrop: how much colder at night
   - precipitation: % chance per day
   - precipType: what falls (rain, snow, sleet, mix)
   - windBase: average wind speed
   - windGust: max gust above base

   Zones based on Golarion geography:
   - arctic:     Crown of the World, Irrisen
   - subarctic:  Brevoy (northern), Realm of the Mammoth Lords
   - temperate:  Brevoy (central), Mendev, Ustalav, Druma
   - warm:       Absalom, Taldor, Andoran, Cheliax
   - tropical:   Mwangi Expanse, Sargava
   - arid:       Osirion, Thuvia, Katapesh, Qadira
   - mountain:   Mindspin Mountains, Five Kings Mountains
   - coastal:    Varisian coast, Hermea, Mediogalti

   For Foundry VTT v13 + PF1e System
   ============================================================ */

const GOLARION_CLIMATES = {

  arctic: {
    name: 'Arctic',
    description: 'Crown of the World, Irrisen — perpetual cold, long winters, brief cool summers.',
    seasons: {
      spring:  { base: 28,  variance: 12, nightDrop: 15, precipitation: 30, precipType: ['snow', 'sleet'],          windBase: 18, windGust: 35 },
      summer:  { base: 48,  variance: 10, nightDrop: 18, precipitation: 25, precipType: ['rain', 'sleet'],          windBase: 12, windGust: 28 },
      fall:    { base: 25,  variance: 12, nightDrop: 18, precipitation: 35, precipType: ['snow', 'sleet'],          windBase: 20, windGust: 40 },
      winter:  { base: -5,  variance: 15, nightDrop: 20, precipitation: 40, precipType: ['snow', 'blizzard'],       windBase: 25, windGust: 55 },
    }
  },

  subarctic: {
    name: 'Subarctic',
    description: 'Northern Brevoy, Realm of the Mammoth Lords — harsh winters, cool summers.',
    seasons: {
      spring:  { base: 40,  variance: 12, nightDrop: 15, precipitation: 35, precipType: ['rain', 'snow', 'sleet'],  windBase: 14, windGust: 30 },
      summer:  { base: 62,  variance: 10, nightDrop: 15, precipitation: 30, precipType: ['rain'],                   windBase: 10, windGust: 25 },
      fall:    { base: 38,  variance: 12, nightDrop: 18, precipitation: 40, precipType: ['rain', 'snow', 'sleet'],  windBase: 16, windGust: 35 },
      winter:  { base: 10,  variance: 15, nightDrop: 22, precipitation: 45, precipType: ['snow', 'blizzard'],       windBase: 20, windGust: 45 },
    }
  },

  temperate: {
    name: 'Temperate',
    description: 'Central Brevoy, Mendev, Ustalav, Druma — four distinct seasons, moderate rainfall.',
    seasons: {
      spring:  { base: 58,  variance: 10, nightDrop: 14, precipitation: 40, precipType: ['rain'],                   windBase: 10, windGust: 25 },
      summer:  { base: 78,  variance: 8,  nightDrop: 15, precipitation: 30, precipType: ['rain', 'thunderstorm'],   windBase: 8,  windGust: 22 },
      fall:    { base: 55,  variance: 12, nightDrop: 16, precipitation: 35, precipType: ['rain'],                   windBase: 12, windGust: 28 },
      winter:  { base: 30,  variance: 12, nightDrop: 18, precipitation: 35, precipType: ['snow', 'rain', 'sleet'],  windBase: 14, windGust: 32 },
    }
  },

  warm: {
    name: 'Warm',
    description: 'Absalom, Taldor, Andoran, Cheliax — mild winters, warm summers, Mediterranean feel.',
    seasons: {
      spring:  { base: 68,  variance: 8,  nightDrop: 12, precipitation: 35, precipType: ['rain'],                   windBase: 8,  windGust: 20 },
      summer:  { base: 88,  variance: 6,  nightDrop: 14, precipitation: 15, precipType: ['rain', 'thunderstorm'],   windBase: 6,  windGust: 18 },
      fall:    { base: 65,  variance: 10, nightDrop: 14, precipitation: 30, precipType: ['rain'],                   windBase: 10, windGust: 22 },
      winter:  { base: 48,  variance: 10, nightDrop: 14, precipitation: 40, precipType: ['rain'],                   windBase: 12, windGust: 25 },
    }
  },

  tropical: {
    name: 'Tropical',
    description: 'Mwangi Expanse, Sargava — hot year-round, heavy monsoon rains, high humidity.',
    seasons: {
      spring:  { base: 85,  variance: 5,  nightDrop: 10, precipitation: 55, precipType: ['rain', 'thunderstorm'],   windBase: 6,  windGust: 20 },
      summer:  { base: 92,  variance: 4,  nightDrop: 8,  precipitation: 65, precipType: ['rain', 'monsoon'],        windBase: 8,  windGust: 30 },
      fall:    { base: 86,  variance: 5,  nightDrop: 10, precipitation: 50, precipType: ['rain', 'thunderstorm'],   windBase: 6,  windGust: 22 },
      winter:  { base: 80,  variance: 5,  nightDrop: 10, precipitation: 35, precipType: ['rain'],                   windBase: 5,  windGust: 15 },
    }
  },

  arid: {
    name: 'Arid / Desert',
    description: 'Osirion, Thuvia, Katapesh, Qadira — scorching days, cold nights, rare rain.',
    seasons: {
      spring:  { base: 82,  variance: 10, nightDrop: 28, precipitation: 8,  precipType: ['rain'],                   windBase: 10, windGust: 30 },
      summer:  { base: 105, variance: 8,  nightDrop: 35, precipitation: 3,  precipType: ['dust storm'],             windBase: 12, windGust: 40 },
      fall:    { base: 80,  variance: 10, nightDrop: 28, precipitation: 10, precipType: ['rain'],                   windBase: 10, windGust: 28 },
      winter:  { base: 58,  variance: 12, nightDrop: 30, precipitation: 12, precipType: ['rain'],                   windBase: 8,  windGust: 25 },
    }
  },

  mountain: {
    name: 'Mountain / Highland',
    description: 'Mindspin Mountains, Five Kings Mountains — cold, thin air, rapid weather shifts.',
    seasons: {
      spring:  { base: 42,  variance: 15, nightDrop: 20, precipitation: 35, precipType: ['rain', 'snow', 'sleet'],  windBase: 16, windGust: 40 },
      summer:  { base: 60,  variance: 12, nightDrop: 22, precipitation: 30, precipType: ['rain', 'thunderstorm'],   windBase: 14, windGust: 35 },
      fall:    { base: 38,  variance: 15, nightDrop: 22, precipitation: 40, precipType: ['snow', 'rain', 'sleet'],  windBase: 18, windGust: 42 },
      winter:  { base: 15,  variance: 15, nightDrop: 25, precipitation: 50, precipType: ['snow', 'blizzard'],       windBase: 22, windGust: 50 },
    }
  },

  coastal: {
    name: 'Coastal / Maritime',
    description: 'Varisian coast, Hermea, Mediogalti — moderate temps, frequent fog, steady rain.',
    seasons: {
      spring:  { base: 55,  variance: 8,  nightDrop: 10, precipitation: 45, precipType: ['rain', 'fog'],            windBase: 12, windGust: 28 },
      summer:  { base: 68,  variance: 6,  nightDrop: 10, precipitation: 25, precipType: ['rain', 'fog'],            windBase: 10, windGust: 25 },
      fall:    { base: 52,  variance: 8,  nightDrop: 12, precipitation: 50, precipType: ['rain', 'fog'],            windBase: 14, windGust: 32 },
      winter:  { base: 40,  variance: 8,  nightDrop: 12, precipitation: 55, precipType: ['rain', 'sleet', 'fog'],   windBase: 16, windGust: 35 },
    }
  },

};

// Cloud cover descriptions based on precipitation chance
const CLOUD_DESCRIPTIONS = [
  { maxChance: 10, options: ['Clear skies', 'Cloudless', 'Not a cloud in sight'] },
  { maxChance: 25, options: ['Partly cloudy', 'Scattered clouds', 'A few clouds drift past'] },
  { maxChance: 40, options: ['Mostly cloudy', 'Overcast patches', 'Grey skies threatening'] },
  { maxChance: 60, options: ['Overcast', 'Heavy cloud cover', 'Low grey ceiling'] },
  { maxChance: 100, options: ['Dense overcast', 'Thick blanket of clouds', 'Sky like a lead sheet'] },
];

// Wind descriptions based on speed (mph)
const WIND_DESCRIPTIONS = [
  { maxSpeed: 5,  options: ['Calm', 'Still air', 'Barely a breeze'] },
  { maxSpeed: 12, options: ['Light breeze', 'Gentle wind', 'A mild breeze'] },
  { maxSpeed: 20, options: ['Moderate wind', 'Steady breeze', 'Brisk wind'] },
  { maxSpeed: 30, options: ['Strong wind', 'Gusting hard', 'Wind whipping cloaks'] },
  { maxSpeed: 45, options: ['Gale force', 'Howling wind', 'Near-storm winds'] },
  { maxSpeed: 999, options: ['Storm winds', 'Violent gale', 'Dangerous winds'] },
];

// Temperature feel descriptions
const TEMP_DESCRIPTIONS = [
  { maxTemp: 0,   options: ['Deadly cold', 'Bone-cracking freeze', 'Lethally frigid'] },
  { maxTemp: 15,  options: ['Bitter cold', 'Painfully cold', 'Biting frost'] },
  { maxTemp: 32,  options: ['Freezing', 'Below freezing', 'Ice on everything'] },
  { maxTemp: 45,  options: ['Cold', 'Chill in the air', 'Coat weather'] },
  { maxTemp: 55,  options: ['Cool', 'Brisk', 'A nip in the air'] },
  { maxTemp: 68,  options: ['Mild', 'Pleasant', 'Comfortable'] },
  { maxTemp: 78,  options: ['Warm', 'Pleasantly warm', 'Shirt-sleeve weather'] },
  { maxTemp: 90,  options: ['Hot', 'Sweltering', 'Heat pressing down'] },
  { maxTemp: 105, options: ['Very hot', 'Scorching', 'Oppressive heat'] },
  { maxTemp: 999, options: ['Deadly heat', 'Furnace-like', 'Heat that kills'] },
];
