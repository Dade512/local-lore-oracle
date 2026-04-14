/* ============================================================
   LOCAL LORE ORACLE — MAIN v1.0
   Chat-integrated local LLM lore assistant.

   DEPLOYMENT: Ollama on Win11 gaming PC (RX 6800 XT, 32GB RAM)
   connected to Foundry server via Tailscale.
   MODEL: gemma4:e4b (6GB VRAM, 128K context, 2-4s responses)

   FLOW:
   1. Player types /lore [question] in chat
   2. Module intercepts, suppresses raw command
   3. Posts a "thinking" card (Tassle rummaging through pouches)
   4. Constructs system prompt (persona + guardrails + knowledge)
   5. Sends POST to Ollama OpenAI-compatible endpoint
   6. Replaces thinking card with formatted response
   7. On error, replaces with in-character error card

   For Foundry VTT v13
   ============================================================ */

import { registerSettings } from "./settings.js";

const MODULE_ID = "local-lore-oracle";
const ORACLE_ALIAS = "Tasslequill Stumblebrook";
const ORACLE_SUBTITLE = "Chronicler of the Unwritten · Devotee of Cayden Cailean";

// Cooldown tracking
let _lastQueryTime = 0;

/* ----------------------------------------------------------
   DEFAULT SYSTEM PROMPT
   Baked-in fallback used on first install before the GM
   pastes the full prompt from Oracle_System_Prompt.md.
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
  console.log(`${MODULE_ID} | Initializing Local Lore Oracle`);
  registerSettings();
});

Hooks.once("ready", () => {
  // Install default system prompt on first run
  const currentPrompt = game.settings.get(MODULE_ID, "systemPrompt");
  if (!currentPrompt) {
    game.settings.set(MODULE_ID, "systemPrompt", DEFAULT_SYSTEM_PROMPT);
    console.log(`${MODULE_ID} | Default system prompt installed`);
  }

  console.log(`${MODULE_ID} | Local Lore Oracle ready — type /lore [question] in chat`);
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

  // Cooldown check
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
  // Post the thinking message immediately
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
   ---------------------------------------------------------- */

async function _callLLM(query) {
  const endpoint = game.settings.get(MODULE_ID, "apiEndpoint");
  const model = game.settings.get(MODULE_ID, "modelName");
  const temperature = game.settings.get(MODULE_ID, "temperature");
  const maxTokens = game.settings.get(MODULE_ID, "maxTokens");
  const systemPrompt = _buildSystemPrompt();

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Ollama returned ${response.status}: ${errorText.slice(0, 200)}`);
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
