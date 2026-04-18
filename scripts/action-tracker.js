/* ============================================================
   ECHOES OF BAPHOMET — PF1.5 ACTION TRACKER v1.2
   Visual 3-action + reaction economy tracker for Combat Tracker.

   DISPLAY:  ◆ ◆ ◆ | ◇ [◇]   (3 actions + 1 reaction [+ Combat Reflexes])
   LOCATION: Injected BELOW combatant name row in Combat Tracker sidebar
   BEHAVIOR: Manual click-to-spend. Auto-reset on turn advance.
             Reads Stunned/Slowed/Staggered/Paralyzed/Nauseated
             from baphomet-utils condition buffs to auto-lock pips.

   v1.2 Changes:
   - [UI BUG FIX] Pip row injected as full-width block BELOW the
     combatant name row, not appended inline with HP/Initiative.
     Uses insertAdjacentElement('afterend') on the name/stats
     wrapper, ensuring it never crowds the initiative display.
   - [LOGIC BUG FIX] _readConditionActionLoss() rewritten to use
     boolean tracking (isStaggered, isNauseated) + integer accumulators
     (stunnedTotal, slowedTotal) inside the loop. Final calculation
     happens AFTER the loop — no order-dependent Math.max() calls.

   For Foundry VTT v13 + PF1e System
   Requires: baphomet-utils condition-overlay.js (for condition reading)
   ============================================================ */

const AT_MODULE_ID = 'baphomet-utils';

/* ----------------------------------------------------------
   STATE MANAGEMENT
   In-memory only. Resets on page reload. No DB writes.
   ---------------------------------------------------------- */

// Map<combatantId, { actions: [bool,bool,bool], reaction: [bool], combatReflex: bool, reflexPip: [bool], conditionLocked: number }>
// true = available, false = spent
const pipState = new Map();

function _initState(combatantId, hasCombatReflex) {
  pipState.set(combatantId, {
    actions: [true, true, true],
    reaction: [true],
    combatReflex: hasCombatReflex,
    reflexPip: hasCombatReflex ? [true] : [],
    conditionLocked: 0
  });
}

function _getState(combatantId) {
  return pipState.get(combatantId) ?? null;
}

function _resetState(combatantId) {
  const state = _getState(combatantId);
  if (!state) return;
  state.actions = [true, true, true];
  state.reaction = [true];
  if (state.combatReflex) state.reflexPip = [true];
  state.conditionLocked = 0;
}

/* ----------------------------------------------------------
   CONDITION READING — v1.2 REWRITE
   [DIRECTIVE: LOGIC BUG FIX]

   Previous implementation used Math.max() inside the item loop
   for Staggered/Nauseated, creating order-dependent results when
   conditions stacked (e.g. Staggered 2 + Stunned 1 could yield
   wrong totals depending on item array order).

   New implementation:
   1. Declare ALL condition trackers BEFORE the loop.
   2. Inside the loop: set booleans (isStaggered, isNauseated)
      and accumulate integers (stunnedTotal, slowedTotal).
      NO Math.max() or conditional logic inside the loop.
   3. AFTER the loop: calculate final actionsLost from all
      tracked values in one deterministic pass.

   Formula:
     baseBlock    = isStaggered || isNauseated ? 2 : 0
     additive     = stunnedTotal + slowedTotal
     actionsLost  = max(baseBlock, additive if not blocked) ...
     
   Actual rule: Staggered/Nauseated block to 2 actions lost
   (1 action remaining). Stunned/Slowed add on top of that.
   Combined: actionsLost = max(baseBlock, additive), capped at 3.
   ---------------------------------------------------------- */

function _readConditionActionLoss(actor) {
  if (!actor) return { actionsLost: 0, fullyIncapacitated: false };

  /* ── Declare all trackers before the loop ────────────── */
  let isStaggered       = false;   // boolean: move-or-standard only
  let isNauseated       = false;   // boolean: move only (same action loss as staggered)
  let stunnedTotal      = 0;       // integer: sum of all Stunned tiers
  let slowedTotal       = 0;       // integer: sum of all Slowed tiers
  let fullyIncapacitated = false;

  /* ── Loop: ONLY set/accumulate, no calculations ──────── */
  for (const item of actor.items) {
    if (item.type !== 'buff') continue;
    const flags = item.flags?.[AT_MODULE_ID];
    if (!flags?.conditionKey) continue;
    if (!item.system?.active) continue;

    const tier = flags.tier ?? 1;

    switch (flags.conditionKey) {
      case 'stunned':
        stunnedTotal += tier;    // accumulate; do NOT clamp here
        break;
      case 'slowed':
        slowedTotal += tier;     // accumulate; do NOT clamp here
        break;
      case 'staggered':
        isStaggered = true;      // boolean flag only
        break;
      case 'nauseated':
        isNauseated = true;      // boolean flag only
        break;
      case 'paralyzed':
        fullyIncapacitated = true;
        break;
    }
  }

  /* ── Post-loop calculation ────────────────────────────── */
  if (fullyIncapacitated) {
    return { actionsLost: 3, fullyIncapacitated: true };
  }

  // Base block: Staggered or Nauseated each lock 2 action pips (1 remains)
  const baseBlock = (isStaggered || isNauseated) ? 2 : 0;

  // Additive: Stunned and Slowed stack together
  const additive = stunnedTotal + slowedTotal;

  // Final: take the greater of the two (they don't simply add —
  // Staggered doesn't add 2 on top of Stunned 2, it competes).
  // Combined conditions: if Stunned 3 + Staggered, Stunned wins (3 > 2).
  // If Staggered + Stunned 1, Staggered wins (2 > 1).
  const actionsLost = Math.min(Math.max(baseBlock, additive), 3);

  return { actionsLost, fullyIncapacitated: false };
}

function _hasCombatReflexes(actor) {
  if (!actor) return false;
  return actor.items.some(i =>
    i.type === 'feat' &&
    i.name.toLowerCase().includes('combat reflexes')
  );
}

/* ----------------------------------------------------------
   APPLY CONDITION LOCKS
   Auto-lock pips at turn start based on conditions.
   ---------------------------------------------------------- */

function _applyConditionLocks(combatantId, actor) {
  const state = _getState(combatantId);
  if (!state) return;

  const { actionsLost, fullyIncapacitated } = _readConditionActionLoss(actor);

  if (fullyIncapacitated) {
    state.actions = [false, false, false];
    state.reaction = [false];
    if (state.combatReflex) state.reflexPip = [false];
    state.conditionLocked = 3;
    return;
  }

  // Lock leftmost pips (index 0 first)
  const toLock = Math.min(actionsLost, 3);
  for (let i = 0; i < toLock; i++) {
    state.actions[i] = false;
  }
  state.conditionLocked = toLock;
}

/* ----------------------------------------------------------
   UI: BUILD PIP ROW
   ---------------------------------------------------------- */

function _buildPipRow(combatantId, isOwner) {
  const state = _getState(combatantId);
  if (!state) return null;

  const row = document.createElement('div');
  row.classList.add('baph-action-tracker');
  row.dataset.combatantId = combatantId;

  // --- Action pips (3) ---
  state.actions.forEach((available, idx) => {
    const pip = document.createElement('div');
    pip.classList.add('baph-pip', 'action');
    pip.dataset.pipType = 'action';
    pip.dataset.pipIndex = idx;
    pip.title = `Action ${idx + 1}`;

    if (!available && idx < state.conditionLocked) {
      pip.classList.add('condition-locked');
      pip.title = `Action ${idx + 1} — Lost to condition`;
    } else if (!available) {
      pip.classList.add('spent');
    }

    if (isOwner) {
      pip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _togglePip(combatantId, 'action', idx);
      });
    }

    row.appendChild(pip);
  });

  // --- Separator ---
  const sep = document.createElement('div');
  sep.classList.add('baph-pip-separator');
  row.appendChild(sep);

  // --- Reaction pip ---
  state.reaction.forEach((available, idx) => {
    const pip = document.createElement('div');
    pip.classList.add('baph-pip', 'reaction');
    pip.dataset.pipType = 'reaction';
    pip.dataset.pipIndex = idx;
    pip.title = 'Reaction';

    if (!available) pip.classList.add('spent');

    if (isOwner) {
      pip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _togglePip(combatantId, 'reaction', idx);
      });
    }

    row.appendChild(pip);
  });

  // --- Combat Reflexes pip ---
  if (state.combatReflex) {
    state.reflexPip.forEach((available, idx) => {
      const pip = document.createElement('div');
      pip.classList.add('baph-pip', 'combat-reflex');
      pip.dataset.pipType = 'reflex';
      pip.dataset.pipIndex = idx;
      pip.title = 'Combat Reflexes — AoO Only';

      if (!available) pip.classList.add('spent');

      if (isOwner) {
        pip.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          _togglePip(combatantId, 'reflex', idx);
        });
      }

      row.appendChild(pip);
    });
  }

  // Block event propagation on the entire row
  ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(evt => {
    row.addEventListener(evt, (e) => e.stopPropagation());
  });

  return row;
}

/* ----------------------------------------------------------
   PIP TOGGLE LOGIC
   ---------------------------------------------------------- */

function _togglePip(combatantId, type, index) {
  const state = _getState(combatantId);
  if (!state) return;

  if (type === 'action') {
    if (index < state.conditionLocked && !state.actions[index]) return;
    state.actions[index] = !state.actions[index];
  } else if (type === 'reaction') {
    state.reaction[index] = !state.reaction[index];
  } else if (type === 'reflex') {
    state.reflexPip[index] = !state.reflexPip[index];
  }

  _refreshPipRow(combatantId);
}

function _refreshPipRow(combatantId) {
  const existing = document.querySelector(`.baph-action-tracker[data-combatant-id="${combatantId}"]`);
  if (!existing) return;

  const parent = existing.parentElement;
  const isOwner = existing.dataset.isOwner === 'true';

  const newRow = _buildPipRow(combatantId, isOwner);
  if (newRow) {
    newRow.dataset.isOwner = String(isOwner);
    parent.replaceChild(newRow, existing);
  }
}

/* ----------------------------------------------------------
   COMBAT TRACKER INJECTION — v1.2 LAYOUT FIX
   [DIRECTIVE: UI BUG FIX]

   Previous behavior: pip row was appended to the combatant
   entry with nameBlock.after(pipRow), which inserted it as a
   sibling of .token-name. In PF1e's flexbox combat tracker,
   this caused the row to sit inline with HP and Initiative,
   pushing the initiative score off-screen.

   New behavior:
   1. Find the combatant's "stats wrapper" — the element that
      contains the name, HP, and initiative together in a row.
   2. Insert the pip row AFTER that entire wrapper as a new
      block-level element, so it sits beneath the stats row.
   3. CSS (.baph-action-tracker) uses width:100% to fill the
      full combatant width without overlapping anything.

   Insertion priority:
     a) .combatant-controls wrapper (PF1e v13 structure)
     b) .token-image (insert after the avatar block)
     c) First child of the combatant entry (safe fallback)
     d) append() as last resort
   ---------------------------------------------------------- */

Hooks.on('renderCombatTracker', (app, html, data) => {
  const combat = game.combat;
  if (!combat) return;

  const root = html instanceof HTMLElement ? html
    : html instanceof jQuery ? html[0]
    : html;
  if (!root) return;

  const combatantEntries = root.querySelectorAll('.combatant, [data-combatant-id]');

  combatantEntries.forEach(entry => {
    const combatantId = entry.dataset.combatantId
      ?? entry.getAttribute('data-combatant-id')
      ?? entry.closest('[data-combatant-id]')?.dataset.combatantId;

    if (!combatantId) return;

    const combatant = combat.combatants.get(combatantId);
    if (!combatant?.actor) return;

    // Ensure state exists
    if (!_getState(combatantId)) {
      _initState(combatantId, _hasCombatReflexes(combatant.actor));
    }

    // Sync Combat Reflexes if feat changed mid-combat
    const state = _getState(combatantId);
    const currentHasCR = _hasCombatReflexes(combatant.actor);
    if (state.combatReflex !== currentHasCR) {
      state.combatReflex = currentHasCR;
      state.reflexPip = currentHasCR ? [true] : [];
    }

    // Remove stale pip row before re-render
    const oldRow = entry.querySelector('.baph-action-tracker');
    if (oldRow) oldRow.remove();

    const isOwner = game.user.isGM || combatant.isOwner;
    const pipRow = _buildPipRow(combatantId, isOwner);
    if (!pipRow) return;

    pipRow.dataset.isOwner = String(isOwner);

    /* ── INJECTION POINT (Layout Fix) ──────────────────────
       We want the pip row to appear as a NEW ROW below the
       existing combatant stats row (name + HP + initiative).

       Strategy: find the stats wrapper and insert AFTER it.
       The stats wrapper is whatever contains .token-name,
       .token-resource, and .token-initiative together.

       In PF1e v13's combat tracker, the structure is typically:
         <li.combatant>
           <img.token-image />
           <div.token-name>...</div>         ← name
           <div.token-resource>HP</div>      ← hp
           <div.token-initiative>...</div>   ← initiative
           <div.combatant-controls>...</div> ← buttons
         </li>

       We insert our pip row after .token-initiative (or before
       .combatant-controls). This puts it below all stat items
       but above the control buttons, keeping it visually
       associated with the combatant without crowding the row.
    ─────────────────────────────────────────────────────── */

    // Find the best anchor: insert pip row AFTER this element
    const initiativeEl   = entry.querySelector('.token-initiative');
    const resourceEl     = entry.querySelector('.token-resource');
    const nameEl         = entry.querySelector('.token-name, .combatant-name');
    const controlsEl     = entry.querySelector('.combatant-controls');

    if (initiativeEl) {
      // Best case: insert after initiative (below full stats row)
      initiativeEl.insertAdjacentElement('afterend', pipRow);
    } else if (controlsEl) {
      // Insert before controls (still below stats)
      entry.insertBefore(pipRow, controlsEl);
    } else if (resourceEl) {
      // Insert after HP display
      resourceEl.insertAdjacentElement('afterend', pipRow);
    } else if (nameEl) {
      // Fallback: insert after name only
      nameEl.insertAdjacentElement('afterend', pipRow);
    } else {
      // Last resort: append to end of combatant entry
      entry.appendChild(pipRow);
    }
  });
});

/* ----------------------------------------------------------
   TURN ADVANCE: AUTO-RESET + CONDITION APPLICATION
   ---------------------------------------------------------- */

Hooks.on('pf1PostTurnChange', (combat, prior, current) => {
  if (!game.user.isGM) return;
  _handleTurnChange(combat, current.combatantId);
});

Hooks.on('combatTurn', (combat, updateData, updateOptions) => {
  if (Hooks.events['pf1PostTurnChange']?.length > 1) return;
  if (!game.user.isGM) return;

  const currentTurn = combat.current?.turn ?? updateData.turn;
  if (currentTurn == null) return;

  const currentCombatant = combat.turns[currentTurn];
  if (currentCombatant) _handleTurnChange(combat, currentCombatant.id);
});

Hooks.on('combatRound', (combat, updateData, updateOptions) => {
  if (!game.user.isGM) return;
  const currentTurn = combat.current?.turn ?? 0;
  const currentCombatant = combat.turns[currentTurn];
  if (currentCombatant) _handleTurnChange(combat, currentCombatant.id);
});

function _handleTurnChange(combat, activeCombatantId) {
  if (!activeCombatantId) return;

  const combatant = combat.combatants.get(activeCombatantId);
  if (!combatant?.actor) return;

  if (!_getState(activeCombatantId)) {
    _initState(activeCombatantId, _hasCombatReflexes(combatant.actor));
  }

  _resetState(activeCombatantId);
  _applyConditionLocks(activeCombatantId, combatant.actor);

  setTimeout(() => _refreshPipRow(activeCombatantId), 50);
}

/* ----------------------------------------------------------
   COMBAT LIFECYCLE: CLEANUP
   ---------------------------------------------------------- */

Hooks.on('deleteCombat', (combat) => {
  for (const c of combat.combatants) pipState.delete(c.id);
});

Hooks.on('deleteCombatant', (combatant) => {
  pipState.delete(combatant.id);
});

Hooks.on('createCombatant', (combatant) => {
  if (!combatant.actor) return;
  _initState(combatant.id, _hasCombatReflexes(combatant.actor));
});

/* ----------------------------------------------------------
   COMBAT START: INITIALIZE ALL COMBATANTS
   ---------------------------------------------------------- */

Hooks.on('combatStart', (combat) => {
  for (const combatant of combat.combatants) {
    if (!combatant.actor) continue;
    _initState(combatant.id, _hasCombatReflexes(combatant.actor));
  }

  const firstCombatant = combat.turns[0];
  if (firstCombatant?.actor) {
    _applyConditionLocks(firstCombatant.id, firstCombatant.actor);
  }
});

/* ----------------------------------------------------------
   MACRO API
   ---------------------------------------------------------- */

Hooks.once('ready', () => {
  game.baphometActions = {
    getState: (combatantId) => {
      const state = _getState(combatantId);
      if (!state) return null;
      return {
        actionsRemaining: state.actions.filter(a => a).length,
        actionsTotal: 3,
        reactionAvailable: state.reaction[0],
        combatReflexAvailable: state.combatReflex ? state.reflexPip[0] : null,
        conditionLocked: state.conditionLocked
      };
    },
    reset: (combatantId) => {
      _resetState(combatantId);
      _refreshPipRow(combatantId);
    },
    spendAction: (combatantId, count = 1) => {
      const state = _getState(combatantId);
      if (!state) return;
      for (let i = 0; i < 3 && count > 0; i++) {
        if (state.actions[i] && i >= state.conditionLocked) {
          state.actions[i] = false;
          count--;
        }
      }
      _refreshPipRow(combatantId);
    },
    spendReaction: (combatantId) => {
      const state = _getState(combatantId);
      if (!state) return;
      state.reaction[0] = false;
      _refreshPipRow(combatantId);
    }
  };

  console.log(`${AT_MODULE_ID} | Action Tracker v1.2 ready`);
});
