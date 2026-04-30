# Local Lore Oracle — Tasslequill's Desk

A player-facing lore assistant for **Foundry VTT v13** powered by an OpenAI-compatible LLM endpoint. Players type `/lore` in chat to consult **Tasslequill Stumblebrook**, a kender bard and self-proclaimed Chronicler of the Unwritten. GMs use `/lore-check` to deliver calibrated, roll-gated knowledge to specific players as private whispers.

**Current version:** 1.4.0
**Foundry compatibility:** v13 (minimum & verified)

---

## Installation

In Foundry: **Game Settings → Add-on Modules → Install Module**, then paste the manifest URL:

```
https://raw.githubusercontent.com/Dade512/local-lore-oracle/main/module.json
```

Activate in **Manage Modules** and configure below.

---

## Provider Support

The module talks to any OpenAI-compatible `/v1/chat/completions` endpoint. It has been tested with:

| Provider | Endpoint | Auth | Notes |
|---|---|---|---|
| **Anthropic Claude** (recommended) | `https://api.anthropic.com/v1/chat/completions` | API key (Bearer) | Best character voice and creative fiction handling |
| **Google Gemini** | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | API key (Bearer) | Free tier available; watch thinking-token budgets on 2.5+ |
| **OpenAI** | `https://api.openai.com/v1/chat/completions` | API key (Bearer) | Untested but should work |
| **Ollama** (local) | `http://<host>:11434/v1/chat/completions` | None — leave key blank | Offline, private; requires a capable GPU |

Authentication is conditional: if the API key field is populated, the module sends `Authorization: Bearer <key>`. If blank, no auth header is sent, which is what Ollama wants.

The module always sends the `anthropic-dangerous-direct-browser-access: true` header, required for Anthropic's API from a browser context. Other providers silently ignore the unknown header.

---

## Security Model (v1.4.0)

As of v1.4.0, the API key never leaves the GM's browser. Player `/lore` commands are routed through a server-side socket to the active GM client, which runs the LLM call and posts the response. Players never touch the API endpoint directly and cannot observe the key in network traffic.

This is the correct architecture for any Foundry module handling credentials. For a trusted home-game table it's belt-and-suspenders; for anyone running a semi-public server it's the difference between a safe deployment and an exposed key.

**What changed:**
- `module.json` now declares `"socket": true`
- Player `/lore` emits `module.local-lore-oracle` socket event to the active GM
- GM client enforces per-player rate limiting via an in-memory map
- If no GM is active, the player sees: *"No GM is available to consult Tassle."*
- GM `/lore` and `/lore-check` still call the LLM directly (GM context, no proxy needed)

---

## Setup — Anthropic Claude (Recommended)

Claude is the strongest fit for Tassle: consistent character voice, creative fiction framing, and willingness to commit to intentional misinformation when the `/lore-check` critical-fail tier calls for it.

### 1. Get an API Key

Sign up at [console.anthropic.com](https://console.anthropic.com). Verify your phone, add a payment method, and load some credits ($10 lasts a typical campaign a long time). Create an API key under **API Keys** — it starts with `sk-ant-`. Copy it immediately; it won't be shown again.

**Strongly recommended:** Set a monthly spend cap under **Limits** (e.g. $20/month) as a safety net against runaway loops.

### 2. Configure in Foundry

**Game Settings → Module Settings → Local Lore Oracle:**

| Setting | Value |
|---|---|
| API Endpoint | `https://api.anthropic.com/v1/chat/completions` |
| API Key | Your Anthropic key (`sk-ant-...`) |
| Model | `claude-haiku-4-5` (default) |
| Temperature | `0.80` |
| Max Tokens | `1024` |
| Cooldown | `15` (seconds between queries per player) |

### 3. Load the Knowledge Base

1. Run `Build-Oracle-Context.ps1` to produce the player-safe knowledge file
2. **Module Settings → Open Prompt Editor**
3. Paste the system prompt from `Player_Safe/Oracle_System_Prompt.md` into the top field
4. Paste the generated knowledge context into the bottom field
5. Save

Tassle is ready. Players type `/lore <question>` to consult him.

### Cost Expectations

Claude Haiku 4.5 is priced at $1/M input tokens and $5/M output tokens. A typical Tassle query (~4K input, ~700 output) costs about three-quarters of a cent. A 120-session campaign at 25 queries per session runs roughly $23 total. Orders of magnitude cheaper than buying everyone pizza.

---

## Setup — Gemini

A solid free-tier alternative. Good for character voice, but thinking-token budgets on Gemini 2.5+ models can cause mid-sentence truncation if `Max Tokens` is too low.

### 1. Get an API Key

Generate one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). A single key works for all Gemini models.

### 2. Configure in Foundry

| Setting | Value |
|---|---|
| API Endpoint | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| API Key | Your Google AI Studio key |
| Model | `gemini-2.5-flash` or `gemini-3.1-flash-lite-preview` |
| Max Tokens | `1024` or higher — thinking models need headroom |

### Model Notes

- **Gemini 3.1 Flash-Lite Preview** — cheapest option, defaults to minimal thinking. Good persona but may refuse to commit to critical-fail misinformation.
- **Gemini 3 Flash Preview** — Pro-grade intelligence; defaults to high thinking (may truncate if max_tokens is too low). Add `reasoning_effort: "minimal"` for cleaner output.
- **Gemini 2.5 Flash** — stable, no announced deprecation.
- **Gemini 2.0 Flash** — deprecates June 1, 2026. Do not use.

---

## Setup — Ollama (Local, Offline)

For GMs who prefer a local model over cloud inference. Requires a beefy GPU on the same network (Tailscale works well).

### 1. Install Ollama

Download from [ollama.com](https://ollama.com). On Windows, it auto-detects AMD GPUs via DirectML.

```bash
ollama pull gemma4:e4b
ollama list
```

### 2. Configure in Foundry

| Setting | Value |
|---|---|
| API Endpoint | `http://<your-host-ip>:11434/v1/chat/completions` |
| API Key | *(leave blank)* |
| Model | `gemma4:e4b` |

### 3. Start Ollama Before Sessions

```bash
ollama serve
ollama run gemma4:e4b    # loads model into VRAM
/bye                     # exit chat, model stays resident
```

Close Ollama after the session to free VRAM for other uses.

---

## Commands

### `/lore <question>` — Player-Facing

Anyone can use this. Query is routed to the GM client via socket, which consults Tassle and posts the response publicly so the whole table can enjoy the rambling.

```
/lore What's the deal with the Hellknights?
/lore Tell me about Molthune
/lore Recommend a tavern in Canorate
```

If no GM client is active when the command is used, the player sees: *"No GM is available to consult Tassle."* — the query is silently dropped, no API call is made.

### `/lore-check <player> <DC> <roll> <subject>` — GM-Only

Delivers calibrated lore to a specific player as a **whisper**, based on their Knowledge skill roll margin. Players with bad rolls get hedging or outright misinformation; expert rolls unlock detail and follow-up questions.

```
/lore-check Michael 15 22 baphomet cult rituals
```

Parameters:
- **player** — Foundry user name, case-insensitive, single token
- **DC** — the difficulty class for the check
- **roll** — the total the player rolled (not the raw d20)
- **subject** — everything after the roll, multi-word is fine

The module computes margin = roll − DC and tells Tassle how to calibrate his answer.

#### Calibration Tiers (v1.3.2 — "One Tier at a Time")

| Margin | Result | Tassle's Response |
|---|---|---|
| **−5 or worse** | Critical Fail | Confidently wrong. Plausible-sounding misinformation delivered with full enthusiasm — the unreliable narrator at full sail. (~800 chars) |
| **−4 to −1** | Fail | Performs the forgetting. Tassle genuinely can't dig the memory up, with charm. Not about the subject — about the failure. (~350 chars) |
| **0 to +4** | Basic | **Recognition without recall.** Tassle knows the thing exists, and that's the end of what he can offer. The consolation prize tier. (~400 chars) |
| **+5 to +9** | Trained | Solid working knowledge. Deity names, regions, basic structure unlocked. Two paragraphs ending with an invitation for ONE follow-up detail from the GM. (~900 chars) |
| **+10 or better** | Expert | Thorough expert knowledge. All details unlocked. Three paragraphs ending with an invitation for TWO follow-up details from the GM. (~1400 chars) |

Because the response is whispered, each player only sees their own roll's result — so one player can walk away with the truth while another is confidently repeating a lie, and the table has to sort it out in character. That's the design.

#### Notes on Misinformation Design

The critical-fail tier is intentional. Tassle is an unreliable narrator by character design — his flaws are features, not bugs. **Model matters here:** Claude and larger models reliably commit to the lie; smaller cost-efficient models (e.g. Flash-Lite tiers) may refuse and produce technically-correct responses instead. If your table prefers a softer outcome, change the critical-fail instruction in the `TIER_CRITICAL_FAIL` constant in `scripts/main.js`.

---

## The Oracle: Tasslequill Stumblebrook

A 74-year-old kender bard and devotee of Cayden Cailean. Bombastic, confident, and utterly convinced that every book he owns was "found." Maintains **The Accidental Ledger** — a chaotic tavern review system he claims was mandated by Cayden himself in a dream.

### Accidental Ledger Ratings

| Rating | Name | Meaning |
|---|---|---|
| ★★★★★ | Cayden's Own | Perfection. Maybe three taverns in all of Golarion. |
| ★★★★ | Worth the Walk | Good ale, interesting patrons. |
| ★★★ | Passable Pour | Won't kill you. Probably. |
| ★★ | Watered Down | Disappointing. The bouncer recognized him. |
| ★ | Cayden Wept | An offense to the Lucky Drunk. |
| 🚫 | Banned For Life | All misunderstandings. |

---

## Guardrails

The Oracle is architecturally firewalled to prevent meta-knowledge leaks:

- **Knowledge injection is player-safe only.** `Build-Oracle-Context.ps1` reads exclusively from `Player_Safe/` directories. GM-only content never reaches the LLM.
- **System prompt enforces persona guardrails.** Explicit "NEVER" rules prevent stat blocks, trap locations, monster weaknesses, and GM secrets.
- **Character-driven deflection.** When the LLM doesn't know something or shouldn't reveal it, Tassle deflects in character rather than refusing robotically.
- **Hallucination coverage.** If the model confabulates, it reads as Tassle being Tassle — "I MIGHT be confusing this with a different city…"
- **`/lore-check` GM-gating.** Non-GM users attempting `/lore-check` are blocked with a notification. The command never fires for players, so they cannot self-calibrate their own knowledge checks.
- **API key GM-only (v1.4.0).** Player `/lore` commands are proxied through the GM client via Foundry's socket layer. The key is never read or transmitted by a player browser.

---

## Troubleshooting

**"Failed to fetch" error**
Usually CORS. This module sends `anthropic-dangerous-direct-browser-access: true` which enables Anthropic's browser-side calls. If you're on a provider with stricter CORS, you'll need a local proxy. Check browser console (F12) for the actual error.

**"No GM is available to consult Tassle."**
No active GM client is connected. The GM needs to have Foundry open for player `/lore` queries to work. If you're testing solo as GM, your own `/lore` command bypasses the socket and calls directly — this message won't appear for you.

**Mid-sentence truncation**
The model hit the output token ceiling. Increase **Max Response Tokens** in settings. For reasoning models (Gemini 2.5+, Claude with extended thinking enabled), the thinking tokens share the budget — bump to 2048+ if needed.

**Non-normal finish_reason warning in console**
The module logs `finish_reason` values that aren't `"stop"`. Common ones: `"length"` means token ceiling, `"content_filter"` means safety system blocked output, others are provider-specific. Useful for diagnosing silent truncation.

**`/lore-check` produces correct info on critical fails**
Your model refuses to confabulate. Anthropic Claude or Gemini 3 Flash Preview handle this reliably; smaller/safety-heavy models may not. See the "Notes on Misinformation Design" section above.

**Basic tier is giving too much info**
That was v1.3.0–v1.3.1's behavior with some providers. v1.3.2 restructured the calibration entirely — the model now sees ONLY the relevant tier's instruction (computed in JS), not the full ladder. Combined with explicit anti-common-knowledge framing for Basic and Fail tiers, iconic facts (troll/fire weakness, etc.) should stay locked. If you're still seeing leakage at Basic tier, verify `scripts/main.js` is actually at v1.3.2+ (check `MODULE_VERSION` near the top).

**Meta-headers in responses ("# Knowledge Check (Margin +X)")**
This was a v1.3.1 bug — Claude was parroting the tier ladder structure back at the player. v1.3.2 fixes it by never showing Claude the labels in the first place. If you see meta-headers on v1.3.2+, that's a regression worth flagging.

---

## File Map

| File | Purpose |
|---|---|
| `scripts/main.js` | Chat interception for `/lore` and `/lore-check`, socket proxy, LLM API call, thinking/response/error cards, calibration prompt |
| `scripts/settings.js` | Module settings registration + prompt editor FormApplication |
| `styles/oracle.css` | Croaker's Ledger themed chat cards |
| `templates/prompt-editor.html` | Textarea form for editing prompt + knowledge |
| `module.json` | Module manifest |

### Related Campaign Files (not in module)

| File | Location |
|---|---|
| Character bible | `Player_Safe/Known_NPCs/Tasslequill_Stumblebrook.md` |
| System prompt source | `Player_Safe/Oracle_System_Prompt.md` |
| Knowledge context output | `Player_Safe/Oracle_Knowledge_Context.md` |
| Knowledge builder | `LLM_Only_Docs/Powershell_Scripts/Build-Oracle-Context.ps1` |

---

## Changelog

### v1.4.0 — "Keys Behind the Bar"
Three Priority A security fixes. No user-facing feature changes; command surface and visual output are identical.

**Fix 1 — HTML escape LLM output (`_formatResponse`):**
LLM text was inserted directly into chat HTML without escaping. A model response containing `<script>` tags or malformed HTML could execute in every connected player's browser. Fixed by passing paragraph text through `_escapeHtml()` before the `\n → <br>` conversion. Order matters: escaping first ensures no raw HTML structure reaches the DOM; escaping after would have destroyed the `<br>` tags.

**Fix 2 — Socket-based GM proxy for API calls:**
Player `/lore` commands previously triggered a `fetch()` from the player's browser that read the API key from world settings and included it in the `Authorization` header. Any player with browser devtools open could observe and extract the key. Fixed by adding `"socket": true` to `module.json` and routing player queries through `game.socket.emit()`. The GM client receives the query, runs the LLM call, and posts the response. The API key never leaves the GM's browser context. If no GM is active, the player receives a clear in-chat warning.

**Fix 3 — GM-side rate limiting by sender:**
Cooldown was enforced entirely client-side via `_lastQueryTime`. A player could bypass it by reloading or manually emitting socket events. Fixed by adding `_gmRateLimitMap` (a `Map<userId, timestamp>`) on the GM side. The GM socket handler checks elapsed time per sender before processing any query. The client-side cooldown is retained as UX feedback (stops the UI before the round-trip) but is no longer the enforcement gate.

**Architecture note:** GM `/lore` and `/lore-check` continue to call `_callLLM()` directly — they already operate in GM context and there's no socket overhead to justify. The socket proxy applies only to player-originated `/lore` requests.

### v1.3.4 — "The Response IS The Forgetting"
- **Fail tier rewrite.** v1.3.3 fixed Critical Fail and stabilized Basic, Trained, and Expert. Fail tier (margin -4 to -1) still leaked under live testing — the model would open with a charming preamble ("chased me through three provinces, taught them my drinking songs") and then slip in actual content like regions, factions, and tactics.
- **Diagnosis.** Critical Fail asks for *active wrongness* (positive instruction — invent falsehoods). Fail asked for *absence of content* (negative instruction — don't deliver info). Models follow positive instructions reliably; negative instructions tend to get reinterpreted as "give a charmingly vague answer" rather than "make the response itself BE the forgetting."
- **Fix.** Reframed `TIER_FAIL` with a positive content directive: the *content* of the response is the experience of trying to remember and failing — the stutter, false starts, mental groping, giving up. The subject's name appears as the thing being forgotten; no fact about the subject appears anywhere. Includes an explicit anti-anecdote rule ("that time I encountered one" sneaks content in through the back door). Lifts the existing example shape into the load-bearing definition of the response, not just an illustration.
- **No code logic changes.** Only `TIER_FAIL` text changed.

### v1.3.3 — "Voice vs Content"
- **Override preamble added to calibration header.** v1.3.2 fixed the *architecture* (model only sees one tier at a time) but the Critical Fail tier still regressed under live testing — at margin -10 the model produced three confident, accurate paragraphs of Trained-tier content. Diagnosis: the calibration was being received but losing to the system prompt's persona defaults ("supremely confident, 2-3 paragraphs default, common folk knowledge OK"). The Critical Fail tier asks the model to do something the persona's defaults *resist* — deliver wrong info in one short paragraph — and the model resolved the conflict by following the persona.
- **Fix.** The `CALIBRATION_HEADER` now opens with an explicit override preamble that partitions the system prompt into two halves: VOICE (always applies — Tassle's exclamations, tangents, mannerisms, Cayden references) and CONTENT (calibration wins — length, confidence level, what specifics are permitted). Includes explicit unreliable-narrator framing so the model understands Critical Fail is a *feature* of the persona, not a violation of it.
- **No code logic changes.** Only the `CALIBRATION_HEADER` text changed.

### v1.3.2 — "One Tier at a Time"
- **Calibration architecture rewrite.** Tier is now selected in JavaScript (`_selectTier`) and ONLY that tier's instruction is injected into the prompt. The model never sees the full ladder, never sees tier labels, never sees the margin or DC. Eliminates meta-header leak, tier drift, and common-knowledge leak.
- **Length control switched from character caps to sentence/paragraph counts.**
- **Calibration block ships as five separate `TIER_*` constants** plus a common header/footer.

### v1.3.1 — "Recognition, Not Information"
- `/lore-check` calibration rewrite. Basic tier reframed from "tavern-patron knowledge" to "recognition only." Fail tier reframed as performance of forgetting. Character-limit hard caps per tier. Example-shape blocks added.

### v1.3.0 — "The Ink Reaches Further"
- Added Anthropic Claude provider support via the OpenAI-compatible endpoint.
- `_callLLM` now sends `anthropic-dangerous-direct-browser-access: true`. Required for Claude from browser context; silently ignored by other providers.
- `finish_reason` non-stop values logged to console. Default model changed to `claude-haiku-4-5`.

### v1.2.0 — "A Private Consultation"
- Added `/lore-check` GM command with five-tier calibration system.
- Non-GM users blocked from `/lore-check`. Shares `/lore` cooldown.

### v1.1.0 — "The Oracle Goes to the Cloud"
- Added API key / Bearer token support. Ollama still works with blank key.

### v1.0.0 — Initial Release
- `/lore` command with Ollama-only local inference.
- Croaker's Ledger themed chat cards.
- System prompt + player-safe knowledge injection. Cooldown.

---

## Credits

Built for the *Echoes of Baphomet's Fall* PF1.5 homebrew campaign. Part of the Croaker's Ledger tooling family alongside [baphomet-utils](https://github.com/Dade512/baphomet-utils).

Tasslequill Stumblebrook is an original NPC. Cayden Cailean, Golarion, and the Pathfinder setting are property of Paizo Inc.
