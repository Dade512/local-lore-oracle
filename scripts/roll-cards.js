/* ============================================================
   ECHOES OF BAPHOMET — ROLL CARD STYLER v1.1
   Chat message post-processing for Gaslamp Gothic roll cards.

   v1.1 Changes (LAYOUT FIX):
   - [CRITICAL BUG FIX] _injectResultBar() no longer wraps the
     h3.dice-total in a div. PF1e's h3.dice-total contains ALL
     inline roll elements (d20 icon, natural, bonus, ⇒, total)
     as child spans. Wrapping the h3 in a flex div scrambled
     the native inline layout of those children.
   
   - New approach: apply .baph-result-bar class DIRECTLY to the
     existing .dice-result div (the h3's natural parent). This
     gives us the dark leather background strip without touching
     the h3's internal layout. CSS handles the rest.
   
   - Removed the DOM reparenting entirely. Zero layout side effects.

   WHAT IT DOES:
   - Adds a .baph-styled class to .dice-result to trigger the
     dark leather bar background via CSS.
   - Detects nat 20 and nat 1 d20 results and adds CSS classes
     to the message element for special styling:
       .baph-nat20  → gold bar, near-black text
       .baph-nat1   → dried blood bar, parchment text
   - Adds a flavor label ("CRITICAL SUCCESS" / "CRITICAL FAIL")
     beneath nat results.

   SCOPE: Only processes messages that contain a dice roll
   (.dice-roll present). Ignores chat, whisper-only messages.

   HOOKS:
   - renderChatMessage — fires after each message renders.
     V13 compatible: html param handled as HTMLElement or jQuery.

   For Foundry VTT v13 + PF1e System
   ============================================================ */

const RC_MODULE_ID = 'baphomet-utils';

/* ----------------------------------------------------------
   NAT DETECTION
   Reads the rendered HTML for d20 dice results.
   PF1e renders the natural d20 value in:
     h3.dice-total > span.natural
   and the full formula includes d20 icon + bonus + arrow + total.
   
   We also check the tooltip area for the d20 die face:
     .dice-rolls .roll.die.d20

   Returns: 'nat20' | 'nat1' | null
   ---------------------------------------------------------- */
function _detectNatResult(messageEl) {
  const diceRoll = messageEl.querySelector('.dice-roll');
  if (!diceRoll) return null;

  // Method 1: Check h3.dice-total data-natural attribute (PF1e sets this)
  const diceTotal = messageEl.querySelector('.dice-total[data-natural]');
  if (diceTotal) {
    const nat = parseInt(diceTotal.dataset.natural, 10);
    if (nat === 20) return 'nat20';
    if (nat === 1)  return 'nat1';
  }

  // Method 2: Check span.natural inside .dice-total
  const naturalSpan = messageEl.querySelector('.dice-total .natural');
  if (naturalSpan) {
    const val = parseInt(naturalSpan.textContent?.trim(), 10);
    if (val === 20) return 'nat20';
    if (val === 1)  return 'nat1';
  }

  // Method 3: Check individual d20 die results in tooltip
  const dieResults = messageEl.querySelectorAll('.dice-rolls .roll.die.d20');
  for (const die of dieResults) {
    const val = parseInt(die.textContent?.trim(), 10);
    if (val === 20) return 'nat20';
    if (val === 1)  return 'nat1';
  }

  return null;
}

/* ----------------------------------------------------------
   RESULT BAR APPLICATION — v1.1 REWRITE
   
   OLD (broken): Wrapped h3.dice-total in a new <div>, which
   broke PF1e's internal inline layout of the h3's children.
   
   NEW: Add .baph-styled class to the existing .dice-result div.
   CSS applies the dark leather background to .dice-result.baph-styled.
   The h3 and all its children remain UNTOUCHED in the DOM.
   
   Idempotent — won't double-apply on re-renders.
   ---------------------------------------------------------- */
function _applyResultBar(messageEl) {
  const diceResults = messageEl.querySelectorAll('.dice-result');
  
  for (const diceResult of diceResults) {
    // Already styled — skip
    if (diceResult.classList.contains('baph-styled')) continue;
    diceResult.classList.add('baph-styled');
  }
}

/* ----------------------------------------------------------
   NAT LABEL INJECTION
   Adds a small flavor label beneath the dice-result for
   nat 20 and nat 1. Idempotent.
   ---------------------------------------------------------- */
function _injectNatLabel(messageEl, natType) {
  // Don't add twice
  if (messageEl.querySelector('.baph-nat-label')) return;

  // Find the dice-result (our styled bar)
  const diceResult = messageEl.querySelector('.dice-result.baph-styled');
  if (!diceResult) return;

  const label = document.createElement('div');
  label.classList.add('baph-nat-label');

  if (natType === 'nat20') {
    label.classList.add('baph-nat20-label');
    label.textContent = '⚔ Critical Success';
  } else {
    label.classList.add('baph-nat1-label');
    label.textContent = '✖ Critical Failure';
  }

  // Insert after the dice-result, inside .dice-roll
  diceResult.insertAdjacentElement('afterend', label);
}

/* ----------------------------------------------------------
   MAIN HOOK — renderChatMessage
   V13: html may be HTMLElement or jQuery — handle both.
   ---------------------------------------------------------- */
Hooks.on('renderChatMessage', (message, html, data) => {
  // Normalize to HTMLElement
  const el = html instanceof HTMLElement ? html
    : html instanceof jQuery        ? html[0]
    : null;
  if (!el) return;

  // Only process roll messages
  if (!el.querySelector('.dice-roll')) return;

  // Apply the dark result bar styling (no DOM wrapping)
  _applyResultBar(el);

  // Detect nat and apply classes + label
  const natType = _detectNatResult(el);
  if (natType === 'nat20') {
    el.classList.add('baph-nat20');
    _injectNatLabel(el, 'nat20');
  } else if (natType === 'nat1') {
    el.classList.add('baph-nat1');
    _injectNatLabel(el, 'nat1');
  }
});

/* ----------------------------------------------------------
   READY
   ---------------------------------------------------------- */
Hooks.once('ready', () => {
  console.log(`${RC_MODULE_ID} | Roll Card Styler v1.1 ready`);
});
