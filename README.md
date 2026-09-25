# PitPal
PitPal AI helps car owners find the right garage by simply describing what is wrong with their car in normal language. K2 Horizon interprets the request, identifies urgency and required garage capabilities, and n8n orchestrates the matching workflow to return suitable garage options.
# PitPal 🚗🔧

**AI-powered garage matching for the UAE.** Describe your car problem in plain English — PitPal understands it and matches you to the right garage.

Built for the n8n Dubai Hackathon with **n8n** (orchestration) + **K2 Horizon** (reasoning).

## The Problem

Finding the right garage in the UAE is guesswork. Drivers don't know if their issue is urgent, what kind of specialist they need, or which garage to trust. They describe problems in everyday language — *"my A/C isn't cooling"*, *"brakes feel soft and I'm driving to Abu Dhabi tonight"* — not in mechanic terms.

## The Solution

The driver describes the problem naturally. **K2 Horizon is the reasoning brain** — it interprets the request, assesses urgency and safety, and ranks the best-fit garages. **n8n is pure orchestration** — it moves data between the input, the AI, and the response. No hardcoded matching logic; the intelligence lives in K2.

## How It Works

Driver input → n8n → K2 Horizon (interpret) → n8n → K2 Horizon (match & rank) → Result


1. **Interpret** — K2 reads the free-text problem and extracts structured info: car make/model/year, issue category, urgency, a safety flag, location, and price/quality priority. If the input is too vague, K2 asks a clarifying question instead of guessing.
2. **Match & rank** — K2 takes the structured request plus the garage list and returns the best matches with reasons and trade-offs, ordered by real suitability — not just proximity. If no garage fits, it says so with a cautious safety note instead of forcing a bad match.

Everything in between — forms, HTTP calls, parsing, branching, formatting — is n8n.

## Why K2 Is Essential

Remove K2 and PitPal stops working. There's no keyword matching or lookup table — swap the entire garage list and it still works, because the reasoning is in the model, not the plumbing. **K2 reasons, n8n orchestrates.**

## Two Interfaces

| Interface | Endpoint |
|-----------|----------|
| **Web form** (no code) | `https://azilsalam.app.n8n.cloud/form/ac48ab87-07da-463e-bcb7-bc841d1375b7` |
| **JSON API** | `POST https://azilsalam.app.n8n.cloud/webhook/pitpal` |

**API request**
```json
{ "car_problem": "My 2019 Corolla needs an oil change, I'm in Deira, affordable, today" }
API response

{
  "match_status": "matched",
  "customer_summary": "...",
  "safety_note": "...",
  "matches": [ { "garage_name": "...", "reason": "...", "fit": "strong", "tradeoff": "..." } ],
  "clarification_question": null
}
Demo Scenarios
Routine — "2019 Corolla, oil change, Deira, affordable, today" → budget general garage
A/C — "2015 Corolla, A/C not cooling, Karama, budget" → A/C specialist
SUV — "2022 Land Cruiser, suspension warning light, highway vibration" → 4x4/Toyota specialist
Safety-critical — "Patrol, brake pedal feels soft, driving to Abu Dhabi tonight" → high urgency + safety caution
Tech Stack
n8n — form/webhook triggers, HTTP calls, parsing, branching
K2 Horizon (IFM/K2-Horizon-375B-A23B) — the reasoning layer
