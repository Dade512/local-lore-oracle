# Local Lore Oracle — Tasslequill's Desk

A player-facing lore assistant for **Foundry VTT v13** powered by an OpenAI-compatible LLM endpoint. Players type `/lore` in chat to consult **Tasslequill Stumblebrook**, a kender bard and self-proclaimed Chronicler of the Unwritten. GMs use `/lore-check` to deliver calibrated, roll-gated knowledge to specific players as private whispers.

**Current version:** 1.3.2
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
| Cooldown | `15` (seconds between queries) |

### 3. Load the Knowledge Base

1. Run `Build-Oracle-Context.ps1` to produce the player-safe knowledge file
2. **Module Settings → Open Prompt Editor**
3. Paste the system prompt from `Player_Safe/Oracle_System_Prompt.md` into the top field
4. Paste the generated knowledge context into the bottom field
5. Save

Tassle is ready. Players type `/lore <question>` to consult him.

### Cost Expectations

Claude Haiku 4.5 is priced at $1/M input tokens and $5/M output tokens. A typical Tassle query (~4K input, ~700 output) costs about three-quarters of a cent. A 120-session campaign at 25 queries per session runs roughly $23 total. Orders of magnitude cheaper than buying everyone pizza.

### Security Caveat

The `anthropic-dangerous-direct-browser-access` header is named that way for a reason: the API key is stored in Foundry's world settings and sent from the GM's browser on every call. Anyone with GM-level access to your world can inspect module settings and extract the key. For a homebrew game with trusted friends this is fine. The monthly spend cap is your safety net either way.

For public-facing deployments, you'd want a server-side proxy. For a home campaign, you're good.

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

Anyone can use this. Query goes to Tassle, response is posted publicly in chat so the whole table can enjoy his rambling.

```
/lore What's the deal with the Hellknights?
/lore Tell me about Molthune
/lore Recommend a tavern in Canorate
```

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

The critical-fail tier is intentional. Tassle is an unreliable narrator by character design — his flaws are features, not bugs. **Model matters here:** Claude and larger models reliably commit to the lie; smaller cost-efficient models (e.g. Flash-Lite tiers) may refuse and produce technically-correct responses instead. If your table prefers a softer outcome, change the critical-fail instruction in the `LORE_CHECK_CALIBRATION` constant at the bottom of `scripts/main.js`.

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

---

## Troubleshooting

**"Failed to fetch" error**
Usually CORS. This module sends `anthropic-dangerous-direct-browser-access: true` which enables Anthropic's browser-side calls. If you're on a provider with stricter CORS, you'll need a local proxy. Check browser console (F12) for the actual error.

**Mid-sentence truncation**
The model hit the output token ceiling. Increase **Max Response Tokens** in settings. For reasoning models (Gemini 2.5+, Claude with extended thinking enabled), the thinking tokens share the budget — bump to 2048+ if needed.

**Non-normal finish_reason warning in console**
The module logs `finish_reason` values that aren't `"stop"`. Common ones: `"length"` means token ceiling, `"content_filter"` means safety system blocked output, others are provider-specific. Useful for diagnosing silent truncation.

**`/lore-check` produces correct info on critical fails**
Your model refuses to confabulate. Anthropic Claude or Gemini 3 Flash Preview handle this reliably; smaller/safety-heavy models may not. See the "Notes on Misinformation Design" section above.

**Basic tier is giving too much info**
That was v1.3.0–v1.3.1's behavior with some providers. v1.3.2 restructured the calibration entirely — the model now sees ONLY the relevant tier's instruction (computed in JS), not the full ladder. Combined with explicit anti-common-knowledge framing for Basic and Fail tiers, iconic facts (troll/fire weakness, etc.) should stay locked. If you're still seeing leakage at Basic tier, verify `scripts/main.js` is actually at v1.3.2 (check `MODULE_VERSION` near the top).

**Meta-headers in responses ("# Knowledge Check (Margin +X)")**
This was a v1.3.1 bug — Claude was parroting the tier ladder structure back at the player. v1.3.2 fixes it by never showing Claude the labels in the first place. If you see meta-headers on v1.3.2, that's a regression worth a thumbs-down to flag.

---

## File Map

| File | Purpose |
|---|---|
| `scripts/main.js` | Chat interception for `/lore` and `/lore-check`, LLM API call, thinking/response/error cards, calibration prompt |
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

### v1.3.2 — "One Tier at a Time"
- **Calibration architecture rewrite.** Tier is now selected in JavaScript (`_selectTier`) and ONLY that tier's instruction is injected into the prompt. The model never sees the full ladder, never sees tier labels like "BASIC" or "EXPERT", never sees the margin or DC. This eliminates three failure modes simultaneously:
  - **Meta-header leak.** v1.3.1 sometimes produced responses starting with `# Knowledge Check (Margin +X = TIER)`. The model was parroting the labeled ladder it could see. With one tier visible at a time, there's nothing to parrot.
  - **Tier drift.** Responses occasionally over- or under-delivered for their margin. Without a ladder to read, the model can't pick the wrong rung.
  - **Common-knowledge leak.** Basic tier was leaking iconic facts (troll/fire weakness, goblin deity associations) because the model treated them as "common cultural literacy" exempt from calibration. Fail and Basic tiers now include explicit anti-common-knowledge framing: "even if it feels iconic, even if everyone learns this in childhood, the character's recall has failed."
- **Length control switched from character caps to sentence/paragraph counts.** Character caps were a weak lever — Claude routinely exceeded them by 50-75%. Structural counts like "3-4 sentences" with explicit "Stop after the Nth sentence" rules are far more reliable.
- **Calibration block now ships as five separate `TIER_*` constants** plus a common header/footer. Easier to tune one tier without rewriting everything.
- **No user-facing command changes.** Same `/lore-check` syntax, same outputs, same whisper behavior.

### v1.3.1 — "Recognition, Not Information"
- **`/lore-check` calibration rewrite.** The v1.3.0 tier ladder kept flattening in the middle — Basic rolls produced trained-tier content, Trained rolls produced expert-tier content. This release rebuilds the ladder with clearer design intent per tier.
- **Basic tier reframed.** Was "common tavern-patron knowledge, stay broad." Now "Tassle recognizes the subject but cannot recall anything substantive." A margin-0 roll gets the player "yes, goblins exist, small green things, that's all I've got" — a real consolation prize that creates meaningful incentive to push for higher rolls.
- **Fail tier reframed.** Was "hedge about the subject." Now "perform the attempt to remember and the failure." Claude (and most LLMs) handle theatrical roleplay better than content-withholding.
- **Character-limit hard caps per tier** (350/400/800/900/1400). Sentence counts drift; character limits don't. Paragraph guidance still provided as shape, not enforcement.
- **Example-shape blocks** added to Fail and Basic tiers — explicit sample responses for the model to anchor to.

### v1.3.0 — "The Ink Reaches Further"
- Added Anthropic Claude provider support via the OpenAI-compatible endpoint.
- `_callLLM` now sends `anthropic-dangerous-direct-browser-access: true` on every request. Required for Claude from browser context; silently ignored by other providers.
- `finish_reason` values other than `"stop"` now log a warning to the console — useful for diagnosing silent truncation.
- Default model changed to `claude-haiku-4-5`; default endpoint changed to Anthropic's.
- Default `maxTokens` raised from 600 → 1024 to accommodate reasoning models.
- Settings hints updated to document Anthropic alongside Gemini and Ollama.
- README expanded with per-provider setup, cost math, troubleshooting, and security caveats.

### v1.2.0 — "A Private Consultation"
- Added `/lore-check` GM command: calibrated whispered lore based on skill roll margin.
- Five-tier calibration system (critical fail → expert) driven by a single prompt addendum — no per-topic content authoring required.
- Critical-fail tier intentionally returns confidently-wrong information for unreliable-narrator payoff.
- Non-GM users are blocked from `/lore-check` with a clear notification.
- `/lore-check` shares the `/lore` cooldown to prevent LLM spam.
- `_callLLM` gained an optional `calibration` parameter; existing `/lore` behavior is unchanged.

### v1.1.0 — "The Oracle Goes to the Cloud"
- Added API key / Bearer token support for cloud LLM providers (Gemini, OpenAI).
- Ollama still works — just leave the API key blank.
- Default endpoint switched to Gemini for out-of-box usability.

### v1.0.0 — Initial Release
- `/lore` command with Ollama-only local inference.
- Croaker's Ledger themed chat cards.
- System prompt + player-safe knowledge injection.
- Cooldown to prevent spam.

---

## Credits

Built for the *Echoes of Baphomet's Fall* PF1.5 homebrew campaign. Part of the Croaker's Ledger tooling family alongside [baphomet-utils](https://github.com/Dade512/baphomet-utils).

Tasslequill Stumblebrook is an original NPC. Cayden Cailean, Golarion, and the Pathfinder setting are property of Paizo Inc.
