# agent-native-clinic

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org)
[![Agent-Native](https://img.shields.io/badge/built%20on-Agent--Native-7c3aed.svg)](https://github.com/BuilderIO/agent-native)

The first medical reference app on [Builder.io's Agent-Native](https://github.com/BuilderIO/agent-native) framework: a clinic front desk (appointment booking) plus a patient triage flow, running on **one shared action layer** — the agent chat, the visual UI, the HTTP API, the CLI, MCP and A2A all call the same `defineAction` definitions against the same SQL state.

## Quickstart

```bash
pnpm install
pnpm dev          # visual UI at the printed URL; /clinic is the front-desk page
```

Try the same actions from three surfaces:

```bash
# 1. CLI surface (no browser, no LLM key needed)
pnpm action find-doctor --specialty Cardiology
pnpm action book-appointment --doctor "Dr. Ayesha Khan" --day Mon --time 10:00 \
  --patient_name "Ali Raza" --phone "+92-300-1234567"
pnpm action triage-assess --patient_name "Ali Raza" \
  --symptoms '["chest pain", "shortness of breath"]'

# 2. HTTP surface (while pnpm dev runs)
curl "http://localhost:8080/api/actions/clinic-dashboard"

# 3. Visual surface: open /clinic in the browser
# 4. Agent surface: ask in /chat — "book Ali Raza with Dr. Ayesha Khan on Monday at 10"
```

Run the tests:

```bash
DATABASE_URL="pglite:memory" pnpm test
```

## Measured results

All numbers below are measured on this repo's vitest suite (`tests/clinic.test.ts`), run on an isolated in-memory PGlite database with the production migrations applied. No placeholders.

| Check | Result |
|---|---|
| Test cases passing | 25 / 25 |
| Roster seed (doctors) | 6 |
| Migration re-apply idempotency | no duplicate rows |
| Double-booking same slot | rejected (`slot_taken`) |
| Booking on doctor's off day | rejected (`doctor_unavailable_day`) |
| Reschedule into taken slot | rejected (`slot_taken`) |
| Cancel frees slot for rebooking | verified |
| Triage: "chest pain" | `emergency` |
| Triage: "high fever" | `urgent` |
| Triage: "mild cold" | `self_care` |
| Triage: unrecognized symptom | `routine` (defaults to human review, never silently downgraded) |
| Triage: worst band wins | verified |
| Surfaces exercised against one action layer | CLI, HTTP, visual UI, agent chat (chat needs an LLM key) |

## How it works

```
actions/*.ts          one defineAction per file (find-doctor, book-appointment,
                      reschedule-appointment, cancel-appointment,
                      list-appointments, triage-assess, clinic-dashboard)
        |                       |
        +---- agent chat (tool)  +---- /clinic page (useActionQuery/useActionMutation)
        +---- CLI (agent-native action) +---- HTTP API (GET for reads)
        +---- MCP / A2A
        |
server/db/            Drizzle schema + named migrations (PGlite locally,
                      any Postgres in production); roster seeded once
server/lib/triage-rules.ts   deterministic, LLM-free urgency rules —
                      decision support, not diagnosis; every band carries reasons
```

The medical logic mirrors the `clinic.pack` front-desk skill pack (doctor search, booking, rescheduling) from the author's packc project; Agent-Native is the surface layer only.

Triage is deliberately rule-based: a small transparent keyword ruleset maps symptoms to `emergency | urgent | routine | self_care`. Anything unrecognized defaults to `routine` (human review). No LLM, no hidden weights, fully auditable — the right default for a reference implementation.

## Limits

- Reference implementation: the roster, slots and triage ruleset are illustrative, not clinical guidance.
- The agent-chat surface needs an LLM provider key (Anthropic/OpenAI/Gemini/OpenRouter/Ollama); actions, CLI, HTTP and UI work without one.
- PGlite persistence lives in `./data` locally; production needs a hosted Postgres `DATABASE_URL`.

## Citation

```bibtex
@software{rehman2026agentnativeclinic,
  author  = {Habib Ur Rehman},
  title   = {agent-native-clinic: the first medical reference app on Builder.io's Agent-Native framework},
  year    = {2026},
  url     = {https://github.com/habib-analyst/agent-native-clinic}
}
```

---
Built by [Habib Ur Rehman](https://github.com/habib-analyst) · ML/AI Engineer & healthcare-AI researcher ·
[LinkedIn](https://www.linkedin.com/in/hur-dev) · [habib.top](https://habib.top)
