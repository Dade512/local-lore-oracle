# Local Lore Oracle — Tasslequill's Desk

A player-facing lore assistant for **Foundry VTT v13** powered by a local LLM via **Ollama**. Players type `/lore` in chat to consult **Tasslequill Stumblebrook**, a kender bard and self-proclaimed Chronicler of the Unwritten.

https://raw.githubusercontent.com/Dade512/local-lore-oracle/main/module.json
---

## How It Works

1. Player types `/lore Tell me about the Hellknights` in Foundry chat
2. A "thinking" card appears while Tassle rummages through his pouches
3. The query is sent to your local Ollama instance (over Tailscale)
4. Tassle responds in character — enthusiastic, tangential, and occasionally unreliable
5. The response replaces the thinking card as a styled chat message

---

## Setup

### 1. Install Ollama on Your PC

Download from [ollama.com](https://ollama.com). On Windows, it auto-detects AMD GPUs via DirectML.

```bash
# Pull the recommended model
ollama pull gemma4:e4b

# Verify it's loaded
ollama list
```

### 2. Connect via Tailscale

Your Foundry server and PC must be on the same Tailscale network. Find your PC's Tailscale IP:
```
Settings → Network → Tailscale → Your IP (100.x.x.x)
```

### 3. Install the Module

Copy the `local-lore-oracle/` folder to your Foundry modules directory:
```
/opt/foundrydata/Data/modules/local-lore-oracle/
```

Activate in **Manage Modules**.

### 4. Configure Settings

In Foundry: **Game Settings → Module Settings → Local Lore Oracle**

- **API Endpoint:** `http://100.x.x.x:11434/v1/chat/completions` (your PC's Tailscale IP)
- **Model:** `gemma4:e4b` (default — needs 6GB VRAM)
- **Temperature:** `0.75` (good balance for Tassle's personality)
- **Max Tokens:** `512` (2–4 paragraph answers)
- **Cooldown:** `15` seconds (prevents spam)

### 5. Load the Knowledge Base

1. Run `Build-Oracle-Context.ps1` to generate the player-safe knowledge file
2. In Foundry: **Module Settings → Open Prompt Editor**
3. Paste the system prompt from `Player_Safe/Oracle_System_Prompt.md` into the top field
4. Paste the generated knowledge context into the bottom field
5. Save

### 6. Start Ollama Before Sessions

On your Windows PC, open a terminal:
```bash
ollama serve
ollama run gemma4:e4b    # loads model into VRAM
/bye                      # exit chat, model stays loaded
```

After the session, close Ollama to free VRAM for gaming.

---

## The Oracle: Tasslequill Stumblebrook

A 74-year-old kender bard and devotee of Cayden Cailean. Bombastic, confident, and utterly convinced that every book he owns was "found." Maintains **The Accidental Ledger** — a chaotic tavern review system he claims was mandated by Cayden himself in a dream.

### Accidental Ledger Ratings

| Rating | Name | Meaning |
|--------|------|---------|
| ★★★★★ | Cayden's Own | Perfection. Maybe three taverns in all of Golarion. |
| ★★★★ | Worth the Walk | Good ale, interesting patrons. |
| ★★★ | Passable Pour | Won't kill you. Probably. |
| ★★ | Watered Down | Disappointing. The bouncer recognized him. |
| ★ | Cayden Wept | An offense to the Lucky Drunk. |
| 🚫 | Banned For Life | All misunderstandings. |

---

## Guardrails

The Oracle is architecturally firewalled to prevent meta-knowledge leaks:

- **Knowledge injection is player-safe only.** The `Build-Oracle-Context.ps1` script reads exclusively from `Player_Safe/` directories. GM-only content never reaches the LLM.
- **System prompt enforces persona guardrails.** Explicit "NEVER" rules prevent stat blocks, trap locations, monster weaknesses, and GM secrets.
- **Character deflection.** When the LLM doesn't know something or shouldn't reveal it, Tassle deflects in character rather than refusing robotically.
- **Hallucination coverage.** If the model confabulates, it reads as Tassle being Tassle — "I MIGHT be confusing this with a different city..."

---

## Hardware Requirements

| Setup | Model | VRAM/RAM | Response Time |
|-------|-------|----------|---------------|
| **Recommended:** Gaming PC (RX 6800 XT) | `gemma4:e4b` | 6GB VRAM | 2–4 seconds |
| Mid-range GPU (8GB+) | `gemma4:e4b` | 6GB VRAM | 2–5 seconds |
| CPU-only (32GB RAM) | `gemma4:e4b` | ~10GB RAM | 8–12 seconds |
| Lightweight / laptop | `gemma3:4b` | ~3GB RAM | 5–15 seconds |
| Minimal | `gemma3:1b` | ~1.5GB RAM | 2–5 seconds |

---

## Files

| File | Purpose |
|------|---------|
| `scripts/main.js` | Chat interception, LLM API, thinking cards, response formatting |
| `scripts/settings.js` | Module settings + prompt editor FormApplication |
| `styles/oracle.css` | Croaker's Ledger themed chat cards |
| `templates/prompt-editor.html` | Textarea form for editing prompt + knowledge |

### Related Files (not in module)

| File | Location |
|------|----------|
| Character bible | `Player_Safe/Known_NPCs/Tasslequill_Stumblebrook.md` |
| System prompt | `Player_Safe/Oracle_System_Prompt.md` |
| Knowledge builder | `LLM_Only_Docs/Powershell_Scripts/Build-Oracle-Context.ps1` |
