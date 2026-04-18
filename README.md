# Local Lore Oracle — Tasslequill's Desk

A player-facing lore assistant for **Foundry VTT v13** powered by an OpenAI-compatible LLM endpoint. Players type `/lore` in chat to consult **Tasslequill Stumblebrook**, a kender bard and self-proclaimed Chronicler of the Unwritten. GMs use `/lore-check` to deliver calibrated, roll-gated knowledge to specific players as private whispers.

**Current version:** 1.2.0
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

| Provider | Endpoint | Auth |
|---|---|---|
| **Google Gemini** (recommended) | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` | API key (Bearer) |
| **Ollama** (local) | `http://<tailscale-ip>:11434/v1/chat/completions` | None — leave key blank |
| **OpenAI** | `https://api.openai.com/v1/chat/completions` | API key (Bearer) |

Authentication is conditional: if the API key field is populated, the module sends `Authorization: Bearer <key>`. If blank, no auth header is sent, which is what Ollama wants.

---

## Setup — Gemini (Recommended)

### 1. Get a Gemini API Key

Generate one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). A single key works for all Gemini models — model selection happens in the request body, not the key.

### 2. Configure in Foundry

**Game Settings → Module Settings → Local Lore Oracle:**

| Setting | Value |
|---|---|
| API Endpoint | `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` |
| API Key | Your Google AI Studio key |
| Model | `gemini-2.5-flash` (default) — or `gemini-3-flash` for better instruction-following |
| Temperature | `0.80` |
| Max Tokens | `600` |
| Cooldown | `15` (seconds between queries) |

### 3. Load the Knowledge Base

1. Run `Build-Oracle-Context.ps1` to produce the player-safe knowledge file
2. **Module Settings → Open Prompt Editor**
3. Paste the system prompt from `Player_Safe/Oracle_System_Prompt.md` into the top field
4. Paste the generated knowledge context into the bottom field
5. Save

Tassle is ready. Players type `/lore <question>` to consult him.

### Model Notes

- **Gemini 2.5 Flash** — current default. Stable, no announced deprecation.
- **Gemini 3 Flash** — current-gen Flash. Better instruction adherence; recommended upgrade target.
- **Gemini 3.1 Flash-Lite** — cheapest option, may sacrifice some persona consistency.
- **Gemini 2.0 Flash** — deprecates June 1, 2026. Do not use.

Changing models is a single config string change — no code edits.

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
| API Endpoint | `http://<your-pc-ip>:11434/v1/chat/completions` |
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

#### Calibration Tiers

| Margin | Result | Tassle's Response |
|---|---|---|
| **−5 or worse** | Critical Fail | Confidently wrong. Plausible-sounding misinformation delivered with full enthusiasm — the unreliable narrator at full sail. |
| **−4 to −1** | Fail | Hedges and deflects. "I've heard of that… I think… no, wait, that was a different one…" |
| **0 to +4** | Basic | Common tavern knowledge. One paragraph, broad strokes only. |
| **+5 to +9** | Trained | Solid working knowledge across two paragraphs. Invites the player to press their GM for **one** follow-up detail. |
| **+10 or better** | Expert | Thorough expert knowledge across three paragraphs. Invites the player to press their GM for **two** follow-up details. |

Because the response is whispered, each player only sees their own roll's result — so one player can walk away with the truth while another is confidently repeating a lie, and the table has to sort it out in character. That's the design.

#### Notes on Misinformation Design

The critical-fail tier is intentional. Tassle is an unreliable narrator by character design — his flaws are features, not bugs. If your table prefers a softer outcome, change the critical-fail instruction in the `LORE_CHECK_CALIBRATION` constant at the bottom of `scripts/main.js`.

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

## Hardware Requirements

Cloud providers (Gemini, OpenAI) have no local requirements — any machine can run Foundry and consult the Oracle.

For Ollama:

| Setup | Model | VRAM/RAM | Response Time |
|---|---|---|---|
| **Recommended:** RX 6800 XT or better | `gemma4:e4b` | 6 GB VRAM | 2–4 seconds |
| Mid-range GPU (8 GB+) | `gemma4:e4b` | 6 GB VRAM | 2–5 seconds |
| CPU-only (32 GB RAM) | `gemma4:e4b` | ~10 GB RAM | 8–12 seconds |
| Lightweight / laptop | `gemma3:4b` | ~3 GB RAM | 5–15 seconds |
| Minimal | `gemma3:1b` | ~1.5 GB RAM | 2–5 seconds |

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
