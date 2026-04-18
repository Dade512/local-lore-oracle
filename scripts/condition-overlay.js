/* ============================================================
   ECHOES OF BAPHOMET — PF1.5 CONDITION OVERLAY v2.5
   Applies PF2e-style conditions as PF1e system Buffs.

   v2.5 Changes:
   - [BUG FIX] Auto-decrement (Frightened, Stunned) was not
     firing on turn advance. Root cause: pf1PostTurnChange hook
     may not fire reliably in all PF1e v13 builds, AND the
     combatTurn fallback had a guard that skipped it whenever
     pf1PostTurnChange had any listeners registered.
   
   - New approach: Use Foundry core hooks (combatTurn, combatRound)
     as PRIMARY triggers. pf1PostTurnChange kept as secondary.
     Debounce flag prevents double-decrements if multiple hooks
     fire for the same turn change.
   
   - Added console logging for all auto-decrement events.

   v2.5.1 Changes:
   - [BUG FIX] Math.clamp → Math.clamped (Foundry API).
     Math.clamp is not standard JS; Foundry provides Math.clamped.

   TIERED (1-4):  Frightened, Sickened, Stupefied, Clumsy,
                  Enfeebled, Drained, Stunned, Slowed, Fascinated
   TOGGLE (on/off): Fatigued, Off-Guard, Persistent Damage,
                    Blinded, Deafened, Nauseated, Confused,
                    Paralyzed, Staggered

   For Foundry VTT v13 + PF1e System
   Source: Homebrew_Master_File.md § Simplified Conditions
   ============================================================ */

const MODULE_ID = 'baphomet-utils';

/* ----------------------------------------------------------
   CORRUPTED EDGE SVG FILTER INJECTION
   ---------------------------------------------------------- */

function _injectCorruptedEdgeFilter() {
  if (document.getElementById('baph-corrupted-edge')) return;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'baph-svg-filters');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
  svg.setAttribute('aria-hidden', 'true');

  svg.innerHTML = `
    <defs>
      <filter id="baph-corrupted-edge" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="linearRGB">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.065 0.12"
          numOctaves="3"
          seed="7"
          stitchTiles="stitch"
          result="noise"
        />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale="3.5"
          xChannelSelector="R"
          yChannelSelector="G"
          result="displaced"
        />
      </filter>
    </defs>
  `;

  document.body.appendChild(svg);
}

/* ----------------------------------------------------------
   CONDITION DEFINITIONS
   ---------------------------------------------------------- */

const CONDITIONS = {

  // ======== TIERED CONDITIONS (value 1–4) ========

  frightened: {
    name: 'Frightened',
    icon: 'icons/svg/terror.svg',
    maxTier: 4,
    type: 'tiered',
    description: '–X penalty to attack rolls, saving throws, skill checks, and ability checks. Decreases by 1 at end of your turn.',
    autoDecrement: true,
    buildChanges(tier) {
      const v = String(-tier);
      return [
        { formula: v, operator: 'add', target: 'attack',         modifier: 'penalty', priority: 0 },
        { formula: v, operator: 'add', target: 'allSavingThrows', modifier: 'penalty', priority: 0 },
        { formula: v, operator: 'add', target: 'skills',         modifier: 'penalty', priority: 0 },
      ];
    }
  },

  sickened: {
    name: 'Sickened',
    icon: 'icons/svg/poison.svg',
    maxTier: 4,
    type: 'tiered',
    description: '–X penalty to attack rolls, weapon damage, saving throws, skill checks, and ability checks. Cannot eat or drink (including potions). Spend 1 action to Retch (Fort save vs. source DC) to reduce by 1.',
    autoDecrement: false,
    buildChanges(tier) {
      const v = String(-tier);
      return [
        { formula: v, operator: 'add', target: 'attack',         modifier: 'penalty', priority: 0 },
        { formula: v, operator: 'add', target: 'damage',         modifier: 'penalty', priority: 0 },
        { formula: v, operator: 'add', target: 'allSavingThrows', modifier: 'penalty', priority: 0 },
        { formula: v, operator: 'add', target: 'skills',         modifier: 'penalty', priority: 0 },
      ];
    }
  },

  stupefied: {
    name: 'Stupefied',
    icon: 'icons/svg/daze.svg',
    maxTier: 4,
    type: 'tiered',
    description: '–X penalty to INT/WIS/CHA-based rolls, spell DCs, and Will saves. Casting a spell requires a DC (5 + X) flat check or it fails.',
    autoDecrement: false,
    buildChanges(tier) {
      const v = String(-tier);
      return [
        { formula: v, operator: 'add', target: 'int', modifier: 'penalty', priority: 0 },
        { formula: v, operator: 'add', target: 'wis', modifier: 'penalty', priority: 0 },
        { formula: v, operator: 'add', target: 'cha', modifier: 'penalty', priority: 0 },
      ];
    }
  },

  clumsy: {
    name: 'Clumsy',
    icon: 'icons/svg/falling.svg',
    maxTier: 4,
    type: 'tiered',
    description: '–X penalty to DEX-based attack rolls, Reflex saves, DEX-based skill checks, and AC.',
    autoDecrement: false,
    buildChanges(tier) {
      const v = String(-tier);
      return [
        { formula: v, operator: 'add', target: 'dex', modifier: 'penalty', priority: 0 },
      ];
    }
  },

  enfeebled: {
    name: 'Enfeebled',
    icon: 'icons/svg/downgrade.svg',
    maxTier: 4,
    type: 'tiered',
    description: '–X penalty to STR-based attack rolls, damage rolls, Fortitude saves, STR-based skill checks, and carrying capacity.',
    autoDecrement: false,
    buildChanges(tier) {
      const v = String(-tier);
      return [
        { formula: v, operator: 'add', target: 'str', modifier: 'penalty', priority: 0 },
      ];
    }
  },

  drained: {
    name: 'Drained',
    icon: 'icons/svg/blood.svg',
    maxTier: 4,
    type: 'tiered',
    description: '–X penalty to CON-based checks, Fortitude saves, and Max HP reduced by X × character level. Decreases by 1 after a full night\'s rest.',
    autoDecrement: false,
    buildChanges(tier) {
      const v = String(-tier);
      return [
        { formula: v, operator: 'add', target: 'con', modifier: 'penalty', priority: 0 },
      ];
    }
  },

  stunned: {
    name: 'Stunned',
    icon: 'icons/svg/stoned.svg',
    maxTier: 4,
    type: 'tiered',
    description: 'You lose X actions on your next turn. If Stunned exceeds 3, excess carries over to subsequent turns.',
    autoDecrement: true,
    buildChanges(_tier) {
      return [];
    }
  },

  slowed: {
    name: 'Slowed',
    icon: 'icons/svg/clockwork.svg',
    maxTier: 3,
    type: 'tiered',
    description: 'You lose X actions at the start of each turn (persistent while condition lasts). Does not decrease automatically.',
    autoDecrement: false,
    buildChanges(_tier) {
      return [];
    }
  },

  fascinated: {
    name: 'Fascinated',
    icon: 'icons/svg/eye.svg',
    maxTier: 4,
    type: 'tiered',
    description: '–X penalty to Perception and skill checks. Cannot use Concentrate actions except to investigate the source of fascination.',
    autoDecrement: false,
    buildChanges(tier) {
      const v = String(-tier);
      return [
        { formula: v, operator: 'add', target: 'skill.per', modifier: 'penalty', priority: 0 },
        { formula: v, operator: 'add', target: 'skills',    modifier: 'penalty', priority: 0 },
      ];
    }
  },

  // ======== TOGGLE CONDITIONS (on/off, no tiers) ========

  fatigued: {
    name: 'Fatigued',
    icon: 'icons/svg/unconscious.svg',
    maxTier: 1,
    type: 'toggle',
    description: '–1 penalty to AC and all saving throws. Cannot run or charge. Cannot use Exploration activities during travel.',
    autoDecrement: false,
    buildChanges() {
      return [
        { formula: '-1', operator: 'add', target: 'ac',              modifier: 'penalty', priority: 0 },
        { formula: '-1', operator: 'add', target: 'allSavingThrows', modifier: 'penalty', priority: 0 },
      ];
    }
  },

  offGuard: {
    name: 'Off-Guard',
    icon: 'icons/svg/target.svg',
    maxTier: 1,
    type: 'toggle',
    description: '–2 circumstance penalty to AC. (Formerly Flat-Footed.) Applied by flanking, surprise, or other conditions.',
    autoDecrement: false,
    buildChanges() {
      return [
        { formula: '-2', operator: 'add', target: 'ac', modifier: 'untyped', priority: 0 },
      ];
    }
  },

  persistentDamage: {
    name: 'Persistent Dmg',
    icon: 'icons/svg/fire.svg',
    maxTier: 1,
    type: 'toggle',
    description: 'Take damage at end of every turn. DC 15 flat check to end it. Receiving healing grants an immediate extra flat check.',
    autoDecrement: false,
    buildChanges() {
      return [];
    }
  },

  blinded: {
    name: 'Blinded',
    icon: 'icons/svg/blind.svg',
    maxTier: 1,
    type: 'toggle',
    description: 'Cannot see. Loses DEX bonus to AC. All opponents have total concealment (50% miss chance). –4 penalty to STR/DEX-based skill checks. Automatically fails sight-based Perception checks.',
    autoDecrement: false,
    buildChanges() {
      return [
        { formula: '-2', operator: 'add', target: 'allAttack',   modifier: 'penalty', priority: 0 },
        { formula: '-4', operator: 'add', target: 'skills.per',  modifier: 'penalty', priority: 0 },
      ];
    }
  },

  deafened: {
    name: 'Deafened',
    icon: 'icons/svg/deaf.svg',
    maxTier: 1,
    type: 'toggle',
    description: 'Cannot hear. –4 penalty to initiative and Perception. 20% arcane spell failure on spells with verbal components. Automatically fails hearing-based Perception checks.',
    autoDecrement: false,
    buildChanges() {
      return [
        { formula: '-4', operator: 'add', target: 'skills.per',  modifier: 'penalty', priority: 0 },
        { formula: '-4', operator: 'add', target: 'init',        modifier: 'penalty', priority: 0 },
      ];
    }
  },

  nauseated: {
    name: 'Nauseated',
    icon: 'icons/svg/acid.svg',
    maxTier: 1,
    type: 'toggle',
    description: 'Can only take a single move action each turn. Cannot attack, cast spells, or concentrate. Cannot eat or drink (including potions).',
    autoDecrement: false,
    buildChanges() {
      return [
        { formula: '-20', operator: 'add', target: 'allAttack', modifier: 'penalty', priority: 0 },
      ];
    }
  },

  confused: {
    name: 'Confused',
    icon: 'icons/svg/daze.svg',
    maxTier: 1,
    type: 'toggle',
    description: 'Acts randomly each round: 01–25 act normally, 26–50 babble incoherently, 51–75 deal 1d8+STR to self, 76–100 attack nearest creature. Cannot make attacks of opportunity.',
    autoDecrement: false,
    buildChanges() {
      return [];
    }
  },

  paralyzed: {
    name: 'Paralyzed',
    icon: 'icons/svg/paralysis.svg',
    maxTier: 1,
    type: 'toggle',
    description: 'Cannot move, speak, or take any physical action. Helpless (effective DEX 0, –5 modifier). Melee attackers get +4 to hit. Vulnerable to coup de grace.',
    autoDecrement: false,
    buildChanges() {
      return [
        { formula: '-20', operator: 'add', target: 'dex', modifier: 'penalty', priority: 0 },
      ];
    }
  },

  staggered: {
    name: 'Staggered',
    icon: 'icons/svg/stoned.svg',
    maxTier: 1,
    type: 'toggle',
    description: 'Can only take a single move action or standard action each turn (not both). Cannot take full-round actions. Cannot run or charge.',
    autoDecrement: false,
    buildChanges() {
      return [];
    }
  },
};

/* ----------------------------------------------------------
   BUFF MANAGEMENT
   ---------------------------------------------------------- */

function _buffName(condKey, tier) {
  const cond = CONDITIONS[condKey];
  if (cond.type === 'toggle') return cond.name;
  return `${cond.name} ${tier}`;
}

function _findExistingBuff(actor, condKey) {
  return actor.items.find(i =>
    i.type === 'buff' &&
    i.getFlag(MODULE_ID, 'conditionKey') === condKey
  );
}

async function applyCondition(actor, condKey, tier) {
  if (!actor || !CONDITIONS[condKey]) return;

  const cond = CONDITIONS[condKey];
  tier = Math.clamped(tier, 0, cond.maxTier);

  if (tier === 0) return removeCondition(actor, condKey);

  const existing = _findExistingBuff(actor, condKey);

  if (existing) {
    const changes = cond.buildChanges(tier);
    await existing.update({
      name: _buffName(condKey, tier),
      'system.changes': [],
      [`flags.${MODULE_ID}.tier`]: tier,
    });
    if (changes.length > 0) {
      await pf1.components.ItemChange.create(changes, { parent: existing });
    }
    if (!existing.system.active) {
      await existing.setActive(true);
    }
  } else {
    const changes = cond.buildChanges(tier);

    const descHtml = cond.type === 'tiered'
      ? `<p><strong>${cond.name} ${tier}:</strong> ${cond.description.replace(/–X/g, `–${tier}`).replace(/\bX\b/g, String(tier))}</p>`
      : `<p><strong>${cond.name}:</strong> ${cond.description}</p>`;

    const [created] = await actor.createEmbeddedDocuments('Item', [{
      img: cond.icon,
      name: _buffName(condKey, tier),
      type: 'buff',
      system: {
        subType: 'temp',
        description: { value: descHtml },
      },
      flags: {
        [MODULE_ID]: {
          conditionKey: condKey,
          tier: tier,
          autoDecrement: cond.autoDecrement,
          conditionType: cond.type,
        }
      }
    }]);

    if (changes.length > 0) {
      await pf1.components.ItemChange.create(changes, { parent: created });
    }
    await created.setActive(true);
  }

  _postConditionChat(actor, cond, tier, 'apply');
}

async function removeCondition(actor, condKey) {
  const existing = _findExistingBuff(actor, condKey);
  if (!existing) return;

  const cond = CONDITIONS[condKey];
  await existing.delete();
  _postConditionChat(actor, cond, 0, 'remove');
}

async function adjustCondition(actor, condKey, delta) {
  const existing = _findExistingBuff(actor, condKey);
  const currentTier = existing?.getFlag(MODULE_ID, 'tier') ?? 0;
  const newTier = Math.max(0, currentTier + delta);
  return applyCondition(actor, condKey, newTier);
}

function _postConditionChat(actor, cond, tier, action) {
  const isRemove = action === 'remove';
  const color = isRemove ? 'var(--baph-success-bright, #5a9a5a)' : 'var(--baph-gold, #b8943e)';
  const label = isRemove
    ? `${cond.name} removed`
    : cond.type === 'toggle'
      ? `${cond.name}`
      : `${cond.name} ${tier}`;

  ChatMessage.create({
    content: `<div style="font-family: var(--baph-font-heading, 'Courier Prime', monospace); text-transform: uppercase; letter-spacing: 0.05em; color: ${color}; font-size: 13px;">
      ${actor.name} — ${label}
    </div>
    ${!isRemove ? `<div style="font-family: var(--baph-font-body, 'Alegreya', serif); color: var(--baph-text-secondary, #8a919d); font-size: 12px; margin-top: 2px;">
      ${cond.description.replace(/–X/g, `–${tier}`).replace(/\bX\b/g, String(tier))}
    </div>` : ''}`,
    speaker: ChatMessage.getSpeaker({ actor })
  });
}

/* ----------------------------------------------------------
   UI: Token HUD Condition Panel
   ---------------------------------------------------------- */

function _buildConditionPanel(actor) {
  const panel = document.createElement('div');
  panel.classList.add('baph-condition-panel');

  const tieredHeader = document.createElement('div');
  tieredHeader.classList.add('baph-section-header');
  tieredHeader.textContent = 'Conditions';
  panel.appendChild(tieredHeader);

  const grid = document.createElement('div');
  grid.classList.add('baph-conditions-grid');

  const tieredLabel = document.createElement('div');
  tieredLabel.style.cssText = 'grid-column: 1 / -1; font-family: var(--baph-font-heading, monospace); font-size: 8px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--baph-text-muted, #5c6370); padding: 2px 0 1px; border-bottom: 1px solid var(--baph-border, #2a2f38);';
  tieredLabel.textContent = '— Tiered —';
  grid.appendChild(tieredLabel);

  for (const [key, cond] of Object.entries(CONDITIONS)) {
    if (cond.type !== 'tiered') continue;
    grid.appendChild(_buildTieredRow(actor, key, cond));
  }

  const toggleLabel = document.createElement('div');
  toggleLabel.style.cssText = tieredLabel.style.cssText;
  toggleLabel.textContent = '— Status —';
  grid.appendChild(toggleLabel);

  for (const [key, cond] of Object.entries(CONDITIONS)) {
    if (cond.type !== 'toggle') continue;
    grid.appendChild(_buildToggleRow(actor, key, cond));
  }

  panel.appendChild(grid);
  return panel;
}

function _buildTieredRow(actor, key, cond) {
  const existing = _findExistingBuff(actor, key);
  const currentTier = existing?.getFlag(MODULE_ID, 'tier') ?? 0;

  const row = document.createElement('div');
  row.classList.add('baph-condition-row');
  if (currentTier > 0) row.classList.add('active');

  const labelRow = document.createElement('div');
  labelRow.style.display = 'flex';
  labelRow.style.alignItems = 'center';

  const label = document.createElement('span');
  label.classList.add('baph-condition-label');
  label.textContent = cond.name;
  label.title = cond.description;
  labelRow.appendChild(label);

  if (cond.autoDecrement) {
    const indicator = document.createElement('span');
    indicator.classList.add('baph-auto-indicator');
    indicator.textContent = '↓';
    indicator.title = 'Auto-decrements at end of turn';
    labelRow.appendChild(indicator);
  }

  row.appendChild(labelRow);

  const tierGroup = document.createElement('div');
  tierGroup.classList.add('baph-tier-group');

  const btnRemove = document.createElement('button');
  btnRemove.classList.add('baph-tier-btn', 'baph-btn-remove');
  btnRemove.textContent = '✕';
  btnRemove.title = 'Remove';
  if (currentTier === 0) btnRemove.classList.add('disabled');
  btnRemove.addEventListener('click', async (e) => {
    e.stopPropagation();
    await removeCondition(actor, key);
    _refreshPanel(e.target);
  });
  tierGroup.appendChild(btnRemove);

  for (let t = 1; t <= cond.maxTier; t++) {
    const btn = document.createElement('button');
    btn.classList.add('baph-tier-btn');
    if (t === currentTier) btn.classList.add('selected');
    btn.textContent = String(t);
    btn.title = `${cond.name} ${t}`;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await applyCondition(actor, key, t);
      _refreshPanel(e.target);
    });
    tierGroup.appendChild(btn);
  }

  row.appendChild(tierGroup);
  return row;
}

function _buildToggleRow(actor, key, cond) {
  const existing = _findExistingBuff(actor, key);
  const isActive = !!existing;

  const row = document.createElement('div');
  row.classList.add('baph-condition-row', 'baph-toggle-row');
  if (isActive) row.classList.add('active');

  const label = document.createElement('span');
  label.classList.add('baph-condition-label', 'baph-toggle-label');
  label.textContent = cond.name;
  label.title = cond.description;
  row.appendChild(label);

  const btn = document.createElement('button');
  btn.classList.add('baph-toggle-btn');
  if (isActive) btn.classList.add('active');
  btn.textContent = isActive ? 'ON' : 'OFF';
  btn.title = isActive ? `Remove ${cond.name}` : `Apply ${cond.name}`;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (isActive) {
      await removeCondition(actor, key);
    } else {
      await applyCondition(actor, key, 1);
    }
    _refreshPanel(e.target);
  });

  row.appendChild(btn);
  return row;
}

function _refreshPanel(element) {
  const container = element.closest('.baph-condition-container');
  if (!container) return;
  const panel = container.querySelector('.baph-condition-panel');
  if (!panel) return;

  const actorId = container.dataset.actorId;
  const actor = game.actors.get(actorId);
  if (!actor) return;

  setTimeout(() => {
    const newPanel = _buildConditionPanel(actor);
    panel.replaceWith(newPanel);
  }, 100);
}

/* ----------------------------------------------------------
   HOOKS
   ---------------------------------------------------------- */

Hooks.once('init', () => {
  console.log(`${MODULE_ID} | Initializing PF1.5 Condition Overlay v2.5`);
});

Hooks.once('ready', () => {
  _injectCorruptedEdgeFilter();

  game.baphometConditions = {
    apply: applyCondition,
    remove: removeCondition,
    adjust: adjustCondition,
    CONDITIONS,
    getTier(actor, condKey) {
      const buff = _findExistingBuff(actor, condKey);
      return buff?.getFlag(MODULE_ID, 'tier') ?? 0;
    },
    listActive(actor) {
      return actor.items
        .filter(i => i.type === 'buff' && i.getFlag(MODULE_ID, 'conditionKey'))
        .map(i => ({
          key: i.getFlag(MODULE_ID, 'conditionKey'),
          tier: i.getFlag(MODULE_ID, 'tier'),
          name: i.name,
          active: i.system.active,
        }));
    }
  };

  console.log(`${MODULE_ID} | PF1.5 Condition Overlay v2.5 ready.`);
  console.log(`${MODULE_ID} | API: game.baphometConditions.apply(actor, 'frightened', 3)`);
  console.log(`${MODULE_ID} | API: game.baphometConditions.adjust(actor, 'sickened', -1)`);
  console.log(`${MODULE_ID} | API: game.baphometConditions.remove(actor, 'clumsy')`);
});

// Token HUD button — v13 compatible
Hooks.on('renderTokenHUD', (hud, html, data) => {
  if (!game.user.isGM) return;

  const token = hud.object;
  const actor = token.actor;
  if (!actor) return;

  const hudElement = html instanceof HTMLElement ? html : (html[0] ?? html);

  const btn = document.createElement('div');
  btn.classList.add('control-icon', 'baph-condition-hud-btn');
  btn.title = 'PF1.5 Conditions';
  btn.innerHTML = '<i class="fas fa-head-side-virus"></i>';

  let panelOpen = false;
  let panelContainer = null;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (panelOpen && panelContainer) {
      panelContainer.remove();
      panelContainer = null;
      panelOpen = false;
      return;
    }

    panelContainer = document.createElement('div');
    panelContainer.classList.add('baph-condition-container');
    panelContainer.dataset.actorId = actor.id;
    panelContainer.appendChild(_buildConditionPanel(actor));

    const btnRect = btn.getBoundingClientRect();
    panelContainer.style.position = 'fixed';
    panelContainer.style.top = `${btnRect.top}px`;
    panelContainer.style.left = `${btnRect.left - 300}px`;
    panelContainer.style.zIndex = '1000';
    document.body.appendChild(panelContainer);

    for (const evt of ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup']) {
      panelContainer.addEventListener(evt, (ev) => ev.stopPropagation());
    }

    panelOpen = true;

    const hudCloseObserver = new MutationObserver(() => {
      if (!document.contains(hudElement) || !hudElement.querySelector('.baph-condition-hud-btn')) {
        panelContainer?.remove();
        panelContainer = null;
        panelOpen = false;
        hudCloseObserver.disconnect();
      }
    });
    hudCloseObserver.observe(hudElement.parentElement ?? document.body, { childList: true, subtree: true });
  });

  const rightCol = hudElement.querySelector('.col.right');
  if (rightCol) {
    rightCol.appendChild(btn);
  } else {
    console.warn(`${MODULE_ID} | Could not find .col.right in Token HUD`);
  }
});

/* ----------------------------------------------------------
   AUTO-DECREMENT — v2.5 REWRITE
   ---------------------------------------------------------- */

const _decrementProcessed = new Set();

async function _handleAutoDecrement(combat, priorCombatantId, source) {
  if (!game.user.isGM) return;
  if (!priorCombatantId) {
    console.log(`${MODULE_ID} | Auto-decrement (${source}): no prior combatant ID, skipping`);
    return;
  }

  const dedupeKey = `${combat.id}-${combat.round}-${combat.turn}-${priorCombatantId}`;
  if (_decrementProcessed.has(dedupeKey)) {
    console.log(`${MODULE_ID} | Auto-decrement (${source}): already processed ${dedupeKey}, skipping duplicate`);
    return;
  }
  _decrementProcessed.add(dedupeKey);

  if (_decrementProcessed.size > 50) {
    const entries = [..._decrementProcessed];
    entries.slice(0, entries.length - 20).forEach(k => _decrementProcessed.delete(k));
  }

  const combatant = combat.combatants.get(priorCombatantId);
  if (!combatant?.actor) {
    console.log(`${MODULE_ID} | Auto-decrement (${source}): combatant ${priorCombatantId} has no actor`);
    return;
  }

  const actor = combatant.actor;
  console.log(`${MODULE_ID} | Auto-decrement (${source}): processing end-of-turn for ${actor.name}`);

  let decremented = false;
  for (const [key, cond] of Object.entries(CONDITIONS)) {
    if (!cond.autoDecrement) continue;
    
    const buff = _findExistingBuff(actor, key);
    if (!buff) continue;
    
    const currentTier = buff.getFlag(MODULE_ID, 'tier') ?? 0;
    if (currentTier > 0) {
      console.log(`${MODULE_ID} | Auto-decrement: ${actor.name} ${cond.name} ${currentTier} → ${currentTier - 1}`);
      await adjustCondition(actor, key, -1);
      decremented = true;
    }
  }

  if (!decremented) {
    console.log(`${MODULE_ID} | Auto-decrement (${source}): ${actor.name} has no auto-decrement conditions active`);
  }
}

function _getPriorCombatantId(combat, updateData) {
  const currentTurn = combat.current?.turn ?? updateData?.turn ?? 0;

  let prevTurn;
  if (currentTurn === 0) {
    prevTurn = combat.turns.length - 1;
  } else {
    prevTurn = currentTurn - 1;
  }

  const priorCombatant = combat.turns[prevTurn];
  return priorCombatant?.id ?? null;
}

Hooks.on('pf1PostTurnChange', (combat, prior, current) => {
  console.log(`${MODULE_ID} | Hook fired: pf1PostTurnChange`, { prior, current });
  
  const priorId = prior?.combatantId ?? prior?.id ?? prior?.combatant?.id ?? null;
  _handleAutoDecrement(combat, priorId, 'pf1PostTurnChange');
});

Hooks.on('combatTurn', (combat, updateData, updateOptions) => {
  console.log(`${MODULE_ID} | Hook fired: combatTurn`, { turn: combat.current?.turn, round: combat.current?.round });
  
  const priorId = _getPriorCombatantId(combat, updateData);
  _handleAutoDecrement(combat, priorId, 'combatTurn');
});

Hooks.on('combatRound', (combat, updateData, updateOptions) => {
  console.log(`${MODULE_ID} | Hook fired: combatRound`, { turn: combat.current?.turn, round: combat.current?.round });
  
  const lastCombatant = combat.turns[combat.turns.length - 1];
  const priorId = lastCombatant?.id ?? null;
  _handleAutoDecrement(combat, priorId, 'combatRound');
});
