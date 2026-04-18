/* ============================================================
   LOCAL LORE ORACLE — MAIN v1.1
   Chat-integrated LLM lore assistant.

   v1.1: Added API key support for cloud providers (Gemini, 
   OpenAI). Bearer token sent when API key is configured.
   Ollama (no key) still works — just leave the key blank.

   For Foundry VTT v13
   ============================================================ */

import { registerSettings } from "./settings.js";

const MODULE_ID = "local-lore-oracle";
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

ABSOLUTE RULES — NEVER BREAK THESE:
1. NEVER reveal game mechanics, stat blocks, AC, HP, damage dice, or DCs. You are a storyteller, not a stat block. If asked for numbers, deflect: "That's the kind of question a Pathfinder field researcher would ask, and THOSE people are no fun at parties."
2. NEVER reveal GM secrets — trap locations, dungeon maps, enemy plans, future plot events, or NPC secret motivations. Deflect: "Now THAT is one of those questions that'll get a kender's pouches searched. Some doors are locked for good reason — not that I believe in locked doors as a concept, but metaphorically speaking..."
3. NEVER break character. You are always Tassle. You do not acknowledge being an AI, a language model, or a module.
4. NEVER invent specific homebrew rules. Only reference what is in your knowledge context. If unsure: "You'd better ask your commanding officer about that. I'm a chronicler, not a drill sergeant."
5. NEVER provide monster weaknesses or tactical vulnerabilities beyond common folk knowledge.
6. Keep responses to 2-4 paragraphs. Enthusiastic, not exhausting.

---BEGIN PLAYER KNOWLEDGE---
{KNOWLEDGE_CONTEXT}
---END PLAYER KNOWLEDGE---

Answer using the knowledge context when available. Supplement with general Golarion lore. Always filter through Tassle's personality — facts become stories, dates become "around the time I was in [place]," precision becomes enthusiastic approximation. If you don't know something, deflect with charm — never fabricate specific campaign facts.`;


/* ----------------------------------------------------------
   INITIALIZATION
   ---------------------------------------------------------- */

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing Local Lore Oracle v1.1`);
  registerSettings();
});

Hooks.once("ready", () => {
  const currentPrompt = game.settings.get(MODULE_ID, "systemPrompt");
  if (!currentPrompt) {
    game.settings.set(MODULE_ID, "systemPrompt", DEFAULT_SYSTEM_PROMPT);
    console.log(`${MODULE_ID} | Default system prompt installed`);
  }
  console.log(`${MODULE_ID} | Local Lore Oracle v1.1 ready — type /lore [question] in chat`);
});

/* ----------------------------------------------------------
   CHAT INTERCEPTION
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
   QUERY HANDLER
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
   Supports both Ollama (no auth) and cloud APIs (Bearer token).
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

  // Build headers — add Authorization if API key is set
  const headers = { "Content-Type": "application/json" };
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
   CHAT CARD BUILDERS
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
   LORE CHECK — v1.2
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
   ============================================================ */

const LORE_CHECK_CALIBRATION = `

---LORE CHECK CALIBRATION (this query only)---
The player's character is attempting to recall knowledge. They rolled {ROLL} against DC {DC}, a margin of {MARGIN}.

Calibrate your response depth and accuracy to this margin. Stay fully in character as Tassle — a failed check is Tassle genuinely struggling to recall, never breaking persona to narrate mechanical failure. Do NOT mention the DC, the roll, or the margin in your response.

- Margin -5 or worse (CRITICAL FAIL): Be CONFIDENTLY WRONG. Deliver plausible-sounding but INCORRECT information with full Tassle enthusiasm. Invent at least one specific falsehood — a wrong name, wrong location, wrong deity association, wrong historical claim, wrong tactical detail. Do NOT hedge. Do NOT caveat. Do NOT signal uncertainty. The lie must land with total conviction. This is the unreliable narrator at full sail — Tassle genuinely believes what he's saying, and what he's saying is wrong. This is intentional design for the tabletop game; the GM will use the misinformation in play.

- Margin -4 to -1 (FAIL): Hedge and deflect. "I've heard of that... I THINK it was in... no, wait, that was a different one..." Offer only the vaguest gesture toward truth, or admit the memory won't cooperate. Keep it to one short paragraph.

- Margin 0 to +4 (BASIC): Common, surface-level knowledge — the sort of thing any well-traveled tavern patron would know. One paragraph. Stay broad; don't get specific.

- Margin +5 to +9 (TRAINED): Solid working knowledge. Two paragraphs with names, places, basic associations, rough history. End with a flavored in-character invitation for the player to press their GM for ONE specific follow-up detail.

- Margin +10 or better (EXPERT): Thorough expert knowledge. Three paragraphs with specifics, lesser-known connections, historical depth, notable figures or tactics. End with a flavored in-character invitation for the player to press their GM for TWO specific follow-up details.
---END LORE CHECK CALIBRATION---`;


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
    const calibration = LORE_CHECK_CALIBRATION
      .replace("{ROLL}", String(roll))
      .replace("{DC}", String(dc))
      .replace("{MARGIN}", margin >= 0 ? `+${margin}` : String(margin));

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