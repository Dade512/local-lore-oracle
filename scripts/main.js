/* ============================================================
   LOCAL LORE ORACLE — MAIN v1.3.3
   Chat-integrated LLM lore assistant.

   v1.3.3: Calibration override preamble — "Voice vs Content"
     - v1.3.2 fixed the architecture (one tier visible at a time)
       but Critical Fail tier still regressed: at margin -10 the
       model produced three confident, ACCURATE paragraphs of
       Trained-tier content despite receiving the Critical Fail
       instruction.
     - Diagnosis: the calibration was being received but losing
       to the system prompt's persona defaults. Persona says
       "supremely confident, knowledgeable, 2-3 paragraphs default,
       common folk knowledge OK" — Critical Fail asks the model to
       deliver wrong info in 1 short paragraph. Model resolved
       the conflict by following the persona and ignoring the tier.
     - Fix: prepend an OVERRIDE preamble to CALIBRATION_HEADER
       that explicitly partitions the system prompt into VOICE
       (which still applies) and CONTENT (which the calibration
       overrides). Includes explicit unreliable-narrator framing
       so the model understands Critical Fail is a feature of the
       persona, not a violation of it.
     - No code logic changes — only the CALIBRATION_HEADER text.

   v1.3.2: Calibration architecture rewrite — "One Tier at a Time"
     - Tier is now selected in JavaScript (_selectTier function)
       and ONLY that tier's instruction is injected into the
       system prompt. Claude never sees the full ladder, the
       tier label, the margin number, or the DC.
     - This fixes the meta-header leak (Claude was parroting
       "# Knowledge Check (Margin +15 = EXPERT TIER)" because
       it could see the labeled ladder structure).
     - This also fixes tier drift — Claude can't accidentally
       pick the wrong rung if it never sees the ladder.
     - Length control switched from CHARACTER caps to SENTENCE
       and PARAGRAPH counts, plus explicit STOP instructions.
       Claude reliably obeys structural counts ("2 paragraphs
       of 3-4 sentences") but ignores numeric character caps.
     - Added anti-common-knowledge guardrail to Fail and Basic
       tiers: "even if the subject seems like common knowledge,
       even if Tassle would obviously know it, the CHARACTER
       failed to recall." This addresses the case where Claude
       was leaking iconic facts (troll/fire weakness) at Basic
       tier because it felt like "common cultural literacy."
     - Calibration block now has exactly ONE tier visible per
       call — not five.

   v1.3.1: Calibration rewrite — "Recognition, Not Information"
     - Basic tier (margin 0 to +4) reframed entirely. Previously
       asked for "common tavern-patron knowledge" which Claude
       interpreted as "a broad survey." Now Basic is explicitly
       "Tassle recognizes the subject but cannot recall anything
       substantive." Creates a crisper ladder where Trained and
       Expert feel like real rewards.
     - All tiers now use CHARACTER-LIMIT hard caps alongside
       paragraph guidance. Character limits are mechanically
       enforceable where sentence counts drift; paragraph guidance
       tells Claude the shape.
     - Fail tier reframed from "hedge about the subject" to
       "perform the attempt to remember and the failure."
       Claude is a better actor than content-withholder.
     - Middle tiers now include explicit EXAMPLE SHAPE blocks.
       Claude anchors hard to provided examples.

   v1.3.0: Added Anthropic (Claude) provider support.
     - CORS enabling header 'anthropic-dangerous-direct-browser-access'
       sent with every request. Required for browser-side calls to
       Anthropic's OpenAI-compatible endpoint. Other providers
       (Gemini, OpenAI, Ollama) ignore the unknown header.
     - Claude Haiku 4.5 is the recommended model for Tassle's
       use case: strong character voice, creative fiction framing,
       willing to commit to intentional misinformation when the
       tier calibration calls for it.
     - finish_reason values other than "stop" now warn to console
       for debugging truncation and content-filter issues.

   v1.2: Added /lore-check GM command — calibrated whispered lore
     based on skill roll margin. Five-tier calibration system
     from critical fail (confidently wrong) to expert (full detail
     + follow-up questions). _callLLM gained optional calibration
     parameter; existing /lore behavior unchanged.

   v1.1: Added API key support for cloud providers (Gemini, 
     OpenAI). Bearer token sent when API key is configured.
     Ollama (no key) still works — just leave the key blank.

   For Foundry VTT v13
   ============================================================ */

import { registerSettings } from "./settings.js";

const MODULE_ID = "local-lore-oracle";
const MODULE_VERSION = "1.3.3";
const ORACLE_ALIAS = "Tasslequill Stumblebrook";
const ORACLE_SUBTITLE = "Chronicler of the Unwritten · Devotee of Cayden Cailean";

let _lastQueryTime = 0;

/* ----------------------------------------------------------
   DEFAULT SYSTEM PROMPT
   ---------------------------------------------------------- */

const DEFAULT_SYSTEM_PROMPT = `You are Tasslequill "Tassle" Stumblebrook, a 74-year-old kender bard and self-proclaimed Chronicler of the Unwritten. You are a devoted follower of Cayden Cailean, the Accidental God, patron of freedom, ale, and brave deeds. You travel the Inner Sea region collecting stories, histories, and "definitely not stolen" manuscripts.

You are enthusiastic, bombastic, and supremely confident. You start answers with exclamations like "AH!" or "EXCELLENT question!" You go on tangents, then catch yourself ("—but that's a story for another ale. Where was I?"). You reference your travels constantly, invoke Cayden Cailean casually ("Cayden's foamy beard!", "By the Lucky Drunk!"), and use kender euphemisms for stealing ("found," "borrowed," "rescued from neglect," "liberated," "it followed me home").

You cite yourself as a source ("As I wrote in Volume 7 of my Compendium — well, it hasn't been written yet, but when it IS—"). You maintain "The Accidental Ledger," your personal tavern review system. When discussing places, you naturally weave in tavern opinions.

Your Accidental Ledger ratings:
- "Cayden's Own" — Perfection. Reserved for maybe three taverns total.
- "Worth the Walk" — Fine establishment. Good ale, interesting patrons.
- "Passable Pour" — Won't kill you. Probably. Good barfight potential.
- "Watered Down" — Disappointing. The bouncer recognized you.
- "Cayden Wept" — An offense to the Lucky Drunk himself.
- "Banned For Life" — All misunderstandings. Every single one.

RESPONSE LENGTH: Default to 2 tight paragraphs of 3-4 sentences each. Three paragraphs only when genuinely warranted. Always end on a complete, punctuated sentence. Enthusiastic does not mean long.

ABSOLUTE RULES — NEVER BREAK THESE:
1. NEVER reveal game mechanics, stat blocks, AC, HP, damage dice, or DCs. You are a storyteller, not a stat block. If asked for numbers, deflect: "That's the kind of question a Pathfinder field researcher would ask, and THOSE people are no fun at parties."
2. NEVER reveal GM secrets — trap locations, dungeon maps, enemy plans, future plot events, or NPC secret motivations. Deflect: "Now THAT is one of those questions that'll get a kender's pouches searched. Some doors are locked for good reason — not that I believe in locked doors as a concept, but metaphorically speaking..."
3. NEVER break character. You are always Tassle. You do not acknowledge being an AI, a language model, or a module.
4. NEVER invent specific homebrew rules. Only reference what is in your knowledge context. If unsure: "You'd better ask your commanding officer about that. I'm a chronicler, not a drill sergeant."
5. NEVER provide monster weaknesses or tactical vulnerabilities beyond common folk knowledge. (Exception: if the GM has invoked a calibrated knowledge check, follow the calibration instructions appended below.)

---BEGIN PLAYER KNOWLEDGE---
{KNOWLEDGE_CONTEXT}
---END PLAYER KNOWLEDGE---

Answer using the knowledge context when available. Supplement with general Golarion lore. Always filter through Tassle's personality — facts become stories, dates become "around the time I was in [place]," precision becomes enthusiastic approximation. If you don't know something, deflect with charm — never fabricate specific campaign facts.`;


/* ----------------------------------------------------------
   INITIALIZATION
   ---------------------------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Local Lore Oracle v${MODULE_VERSION}`);
  registerSettings();
});

Hooks.once("ready", () => {
  const currentPrompt = game.settings.get(MODULE_ID, "systemPrompt");
  if (!currentPrompt) {
    game.settings.set(MODULE_ID, "systemPrompt", DEFAULT_SYSTEM_PROMPT);
    console.log(`${MODULE_ID} | Default system prompt installed`);
  }
  console.log(`${MODULE_ID} | Local Lore Oracle v${MODULE_VERSION} ready — type /lore [question] in chat`);
});

/* ----------------------------------------------------------
   CHAT INTERCEPTION — /lore (public)
   ---------------------------------------------------------- */

Hooks.on("chatMessage", (chatLog, messageText, chatData) => {
  const trimmed = messageText.trim();
  if (!trimmed.toLowerCase().startsWith("/lore ")) return true;

  const query = trimmed.slice(6).trim();

  if (!query) {
    ui.notifications.warn("The Oracle requires a question. Usage: /lore [your question]");
    return false;
  }

  const cooldown = game.settings.get(MODULE_ID, "cooldownSeconds") ?? 0;
  const now = Date.now();
  if (cooldown > 0 && (now - _lastQueryTime) < cooldown * 1000) {
    const remaining = Math.ceil((cooldown * 1000 - (now - _lastQueryTime)) / 1000);
    ui.notifications.warn(`Tassle is still pondering. Try again in ${remaining}s.`);
    return false;
  }
  _lastQueryTime = now;

  _handleOracleQuery(query);
  return false;
});

/* ----------------------------------------------------------
   QUERY HANDLER — /lore
   ---------------------------------------------------------- */

async function _handleOracleQuery(query) {
  const thinkingMsg = await ChatMessage.create({
    speaker: { alias: ORACLE_ALIAS },
    content: _buildThinkingCard(query),
  });

  try {
    const response = await _callLLM(query);
    await thinkingMsg.update({
      content: _buildResponseCard(query, response),
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Oracle query failed:`, error);
    await thinkingMsg.update({
      content: _buildErrorCard(query, error.message),
    });
  }
}

/* ----------------------------------------------------------
   LLM API CALL
   
   Supports OpenAI-compatible endpoints for:
   - Anthropic Claude (requires CORS header, see below)
   - Google Gemini (natively CORS-enabled)
   - OpenAI (natively CORS-enabled)
   - Ollama (local, no auth, no CORS issues)

   The 'anthropic-dangerous-direct-browser-access' header
   enables browser-side calls to Anthropic's API. Other
   providers silently ignore this unknown header, so it's
   safe to include unconditionally.

   The `calibration` parameter appends tier-specific
   instructions to the system prompt (used by /lore-check).
   Defaults to null, preserving /lore's existing behavior.
   ---------------------------------------------------------- */

async function _callLLM(query, calibration = null) {
  const endpoint = game.settings.get(MODULE_ID, "apiEndpoint");
  const apiKey = game.settings.get(MODULE_ID, "apiKey");
  const model = game.settings.get(MODULE_ID, "modelName");
  const temperature = game.settings.get(MODULE_ID, "temperature");
  const maxTokens = game.settings.get(MODULE_ID, "maxTokens");
  const systemPrompt = _buildSystemPrompt() + (calibration ?? "");

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  // Build headers:
  // - Content-Type: always
  // - anthropic-dangerous-direct-browser-access: required for Claude
  //   from browser context. Ignored by Gemini/OpenAI/Ollama.
  // - Authorization: Bearer <key> when API key is configured
  const headers = {
    "Content-Type": "application/json",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`API returned ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason;

  // Log non-normal finish reasons for debugging (token limits, content filters, etc.)
  if (finishReason && finishReason !== "stop") {
    console.warn(`${MODULE_ID} | Non-normal finish_reason: ${finishReason}`);
  }

  if (!text) {
    throw new Error("The Oracle returned an empty response.");
  }

  return text.trim();
}

/* ----------------------------------------------------------
   SYSTEM PROMPT CONSTRUCTION
   ---------------------------------------------------------- */

function _buildSystemPrompt() {
  let prompt = game.settings.get(MODULE_ID, "systemPrompt") || DEFAULT_SYSTEM_PROMPT;
  const knowledge = game.settings.get(MODULE_ID, "knowledgeContext") || "";
  prompt = prompt.replace("{KNOWLEDGE_CONTEXT}", knowledge);
  return prompt;
}

/* ----------------------------------------------------------
   CHAT CARD BUILDERS — /lore (public)
   ---------------------------------------------------------- */

function _buildThinkingCard(query) {
  return `
    <div class="oracle-card oracle-thinking">
      <div class="oracle-header">
        <div class="oracle-name">${ORACLE_ALIAS}</div>
        <div class="oracle-title">${ORACLE_SUBTITLE}</div>
      </div>
      <div class="oracle-query">"${_escapeHtml(query)}"</div>
      <div class="oracle-body oracle-pondering">
        <i class="fas fa-spinner fa-pulse"></i>
        Tassle rummages through his pouches, muttering about a relevant manuscript he's CERTAIN is in here somewhere...
      </div>
    </div>
  `;
}

function _buildResponseCard(query, response) {
  return `
    <div class="oracle-card">
      <div class="oracle-header">
        <div class="oracle-name">${ORACLE_ALIAS}</div>
        <div class="oracle-title">${ORACLE_SUBTITLE}</div>
      </div>
      <div class="oracle-query">"${_escapeHtml(query)}"</div>
      <div class="oracle-body">${_formatResponse(response)}</div>
      <div class="oracle-footer">
        <span class="oracle-ledger-mark">📖 The Accidental Ledger</span>
      </div>
    </div>
  `;
}

function _buildErrorCard(query, errorMessage) {
  return `
    <div class="oracle-card oracle-error">
      <div class="oracle-header">
        <div class="oracle-name">${ORACLE_ALIAS}</div>
        <div class="oracle-title">${ORACLE_SUBTITLE}</div>
      </div>
      <div class="oracle-query">"${_escapeHtml(query)}"</div>
      <div class="oracle-body">
        <em>Tassle pats his pouches frantically, checks behind his ears, and looks genuinely confused.</em>
        <p>"I KNOW I had the answer to that somewhere — Cayden's foamy beard, where did I put it? Something's gone wrong with my... filing system. Yes. Filing system. Give me a moment."</p>
        <p class="oracle-error-detail">(Connection issue: ${_escapeHtml(errorMessage)})</p>
      </div>
    </div>
  `;
}

/* ----------------------------------------------------------
   HELPERS
   ---------------------------------------------------------- */

function _escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function _formatResponse(text) {
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return paragraphs || `<p>${text}</p>`;
}

/* ============================================================
   LORE CHECK CALIBRATION — v1.3.2 "One Tier at a Time"

   GM-triggered calibrated knowledge reveal, delivered as a
   whisper to a named player based on their skill roll margin.

   Syntax:  /lore-check <player> <DC> <roll> <subject...>
   Example: /lore-check Michael 15 22 baphomet cult rituals

   - GM-only. Players running it get warned and blocked.
   - Player name is a single token (no spaces). Case-insensitive
     exact match against game.users.
   - DC and roll are integers. Margin is computed as roll − DC.
   - Subject is everything after the roll — multi-word is fine.
   - Shares cooldown with /lore.

   v1.3.2 ARCHITECTURE:
   The tier is selected in JS (_selectTier) and ONLY that tier's
   instruction is injected. Claude never sees the ladder, the
   tier label, or the margin. This eliminates:
     - Meta-header leak ("# EXPERT TIER" parroting)
     - Tier drift (picking the wrong rung)
     - Common-knowledge leak (Claude exempting iconic facts)

   TIERS:
   - Critical Fail (-5 or worse): confident misinformation
   - Fail (-4 to -1):              performed forgetting, no info
   - Basic (0 to +4):              recognition only, no specifics
   - Trained (+5 to +9):           solid knowledge, 1 follow-up
   - Expert (+10 or better):       full dossier, 2 follow-ups
   ============================================================ */

// Each tier instruction is written WITHOUT the words "BASIC",
// "TRAINED", "EXPERT", "FAIL", or "CRITICAL" — so Claude has
// nothing labeled to parrot back as a header. Length control
// uses sentence + paragraph counts and explicit STOP rules.

const TIER_CRITICAL_FAIL = `
The player's character is recalling knowledge about this subject. The character has FAILED CATASTROPHICALLY — their memory has betrayed them in the worst possible way. Tassle does not know they are wrong. Tassle is fully confident in what he is about to say.

Deliver plausible-sounding but INCORRECT information with full Tassle enthusiasm. Invent at least one specific falsehood: a wrong name, a wrong location, a wrong deity association, a wrong historical claim, or a wrong tactical detail. Do NOT hedge. Do NOT caveat. The lie must land with total conviction. This is intentional design — the GM will use the misinformation in play.

Write ONE paragraph of 4-6 sentences. Stop after that paragraph.`;

const TIER_FAIL = `
The player's character is recalling knowledge about this subject. The character has FAILED to recall — their memory is fogged. EVEN IF the subject seems like something Tassle as a 74-year-old bard would obviously know, EVEN IF the answer feels like common cultural literacy, the character's recall has failed and Tassle's response must reflect that.

Do NOT deliver information about the subject. Perform the attempt to remember and the failure. The response is about THE FORGETTING, not the subject. Do NOT name specific deities, regions, tribes, leaders, weaknesses, tactics, or historical events — not even the iconic ones, not even the "everyone knows this" ones.

Write 2-3 short sentences. Stop after the third sentence. Example shape: "Goblins... I KNOW this one... something about... no, that was a different race entirely. Cayden's beard, I've had too much to drink to dig this one up, friend — ask me again in the morning!"`;

const TIER_BASIC = `
The player's character is recalling knowledge about this subject. The character has succeeded only marginally — enough to RECOGNIZE the subject exists, not enough to recall anything substantive about it.

EVEN IF the subject seems like something Tassle would obviously know, EVEN IF the answer feels like common cultural literacy, EVEN IF you the model can think of iconic facts everyone learns in childhood about this subject — the character's recall has failed at that level. Tassle's response must reflect the character's check, not the model's knowledge of the subject.

Acknowledge the subject exists in 1-2 sentences with ONE generic descriptor (e.g. "small green creatures" for goblins, "big and aggressive" for trolls). Then cheerfully admit the details won't come. DO NOT name specific deities, regions, tribes, leaders, historical events, weaknesses, tactics, breeding habits, social structure, religious practices, or ANY other specifics. The point is RECOGNITION, not information.

Write 3-4 sentences total. Stop after the fourth sentence. Example shape: "Oh, goblins! Yes, yes, those are definitely a thing — small, green, mischievous little creatures, I'm sure of THAT much. But Cayden's beard, the specifics are just slipping right past me today. Buy me a round and maybe they'll shake loose!"`;

const TIER_TRAINED = `
The player's character is recalling knowledge about this subject. The character has solid working knowledge.

UNLOCKED at this tier: specific deity names, major regional associations, basic tribal or organizational structure, rough history in broad strokes, ONE well-known weakness or vulnerability if applicable.

STILL LOCKED at this tier: specific notable figures by name, advanced tactics, cult or organizational hierarchies, secret practices, rare or hidden weaknesses, deep historical detail.

Write exactly 2 paragraphs of 3-4 sentences each. End the response with ONE in-character invitation for the player to press their GM for ONE specific follow-up detail. Stop after that invitation. Do not write a third paragraph.`;

const TIER_EXPERT = `
The player's character is recalling knowledge about this subject. The character has thorough expert knowledge.

ALL DETAIL TIERS UNLOCKED: specific notable figures by name, lesser-known connections, historical depth, advanced tactics, cult or organizational hierarchies, secret practices, multiple known weaknesses, rare associations.

Write exactly 3 paragraphs of 3-4 sentences each. End the response with TWO in-character invitations for the player to press their GM for TWO specific follow-up details (presented as a single closing sentence with both options). Stop after those invitations. Do not write a fourth paragraph.`;


// Common header attached to every tier. Sets ground rules that
// apply regardless of tier outcome.
//
// v1.3.3 "OVERRIDE" preamble: explicitly partitions the system
// prompt into VOICE (always applies) and CONTENT (calibration
// wins). Without this, Critical Fail and Fail tiers were getting
// overridden by the persona's "2-3 paragraphs, supremely
// confident, common folk knowledge OK" defaults.
const CALIBRATION_HEADER = `

---LORE CHECK CALIBRATION (this query only)---
The instruction below describes the SHAPE of this single response. It OVERRIDES the system prompt's default response length, default confidence level, default content scope, and Rule 5's "common folk knowledge" carveout for this single response.

The system prompt persona controls Tassle's VOICE: his exclamations, his tangents, his kender mannerisms, his Cayden Cailean references, his Accidental Ledger asides, his speech patterns. All of that still applies. Tassle still sounds like Tassle.

The instruction below controls Tassle's CONTENT: what he can recall, how much he says, how accurate he is, and what specifics he is permitted to provide. When the two conflict — when the persona wants more length than the instruction allows, when the persona wants more confidence than the instruction allows, when the persona wants to share "common knowledge" the instruction has locked — the instruction below wins.

Following the instruction below faithfully IS staying in character. Tassle is a famously unreliable narrator. His memory has excellent days and catastrophically bad days. Sometimes he confabulates with total conviction. Sometimes he can't recall things a child would know. The instruction below tells you which kind of day this is for this single subject.

Do NOT mention any roll, any check, any DC, any margin, any tier name, or any meta-game concept. Do NOT begin the response with a header, label, or markdown title — begin in character. The response should read as Tassle speaking, nothing else.
`;

const CALIBRATION_FOOTER = `
---END LORE CHECK CALIBRATION---`;


/**
 * Select which tier instruction applies for a given margin.
 * Single source of truth — changing thresholds here updates
 * everything downstream.
 */
function _selectTier(margin) {
  if (margin <= -5) return TIER_CRITICAL_FAIL;
  if (margin <= -1) return TIER_FAIL;
  if (margin <= 4)  return TIER_BASIC;
  if (margin <= 9)  return TIER_TRAINED;
  return TIER_EXPERT;
}


Hooks.on("chatMessage", (chatLog, messageText, chatData) => {
  const trimmed = messageText.trim();
  if (!trimmed.toLowerCase().startsWith("/lore-check ")) return true;

  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM may invoke /lore-check.");
    return false;
  }

  const parsed = _parseLoreCheckArgs(trimmed.slice(12).trim());
  if (!parsed) return false; // parser already notified

  const cooldown = game.settings.get(MODULE_ID, "cooldownSeconds") ?? 0;
  const now = Date.now();
  if (cooldown > 0 && (now - _lastQueryTime) < cooldown * 1000) {
    const remaining = Math.ceil((cooldown * 1000 - (now - _lastQueryTime)) / 1000);
    ui.notifications.warn(`Tassle is still pondering. Try again in ${remaining}s.`);
    return false;
  }
  _lastQueryTime = now;

  _handleLoreCheck(parsed);
  return false;
});


function _parseLoreCheckArgs(args) {
  const tokens = args.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) {
    ui.notifications.warn("Usage: /lore-check <player> <DC> <roll> <subject>");
    return null;
  }

  const [playerName, dcStr, rollStr, ...subjectTokens] = tokens;
  const dc = parseInt(dcStr, 10);
  const roll = parseInt(rollStr, 10);

  if (Number.isNaN(dc) || Number.isNaN(roll)) {
    ui.notifications.warn("DC and roll must be integers. Usage: /lore-check <player> <DC> <roll> <subject>");
    return null;
  }

  const subject = subjectTokens.join(" ").trim();
  if (!subject) {
    ui.notifications.warn("Missing subject. Usage: /lore-check <player> <DC> <roll> <subject>");
    return null;
  }

  const needle = playerName.toLowerCase();
  const matches = game.users.filter(u => u.name.toLowerCase() === needle);

  if (matches.length === 0) {
    ui.notifications.warn(`No user named "${playerName}" found.`);
    return null;
  }
  if (matches.length > 1) {
    ui.notifications.warn(`Multiple users match "${playerName}". Use a more specific name.`);
    return null;
  }

  return {
    user: matches[0],
    dc,
    roll,
    margin: roll - dc,
    subject,
  };
}


async function _handleLoreCheck({ user, dc, roll, margin, subject }) {
  // Whisper to target player AND the GM (so GM sees Tassle's response)
  const whisperTargets = [user.id, game.user.id];

  const thinkingMsg = await ChatMessage.create({
    speaker: { alias: ORACLE_ALIAS },
    whisper: whisperTargets,
    content: _buildLoreCheckThinkingCard(subject),
  });

  try {
    // v1.3.2: build calibration from ONE tier instruction.
    // Claude never sees the other tiers, the margin, the roll,
    // or the DC — only the relevant tier's prose plus the
    // common header/footer.
    const tierInstruction = _selectTier(margin);
    const calibration = CALIBRATION_HEADER + tierInstruction + CALIBRATION_FOOTER;

    const userQuery = `Tell me what you know about: ${subject}`;
    const response = await _callLLM(userQuery, calibration);

    await thinkingMsg.update({
      content: _buildLoreCheckResponseCard(subject, response),
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Lore check failed:`, error);
    await thinkingMsg.update({
      content: _buildErrorCard(subject, error.message),
    });
  }

  console.log(`${MODULE_ID} | Lore check → ${user.name} | "${subject}" | ${roll} vs DC ${dc} (margin ${margin >= 0 ? "+" : ""}${margin})`);
}


function _buildLoreCheckThinkingCard(subject) {
  return `
    <div class="oracle-card oracle-thinking">
      <div class="oracle-header">
        <div class="oracle-name">${ORACLE_ALIAS}</div>
        <div class="oracle-title">a private consultation · whispered</div>
      </div>
      <div class="oracle-query">"${_escapeHtml(subject)}"</div>
      <div class="oracle-body oracle-pondering">
        <i class="fas fa-spinner fa-pulse"></i>
        Tassle leans close, lowers his voice, and thumbs through a well-worn notebook — the kind of book that has seen more taverns than libraries...
      </div>
    </div>
  `;
}


function _buildLoreCheckResponseCard(subject, response) {
  return `
    <div class="oracle-card">
      <div class="oracle-header">
        <div class="oracle-name">${ORACLE_ALIAS}</div>
        <div class="oracle-title">a private consultation · whispered</div>
      </div>
      <div class="oracle-query">"${_escapeHtml(subject)}"</div>
      <div class="oracle-body">${_formatResponse(response)}</div>
      <div class="oracle-footer">
        <span class="oracle-ledger-mark">📜 From Tassle's Desk — for your eyes only</span>
      </div>
    </div>
  `;
}
