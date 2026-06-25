# Phase 3: Deep Research - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 3-deep-research
**Areas discussed:** Capture spike scope, Persona & monetization focus, Diarization minimum bar, Use-case discovery breadth

---

## Capture Spike Scope (RSCH-04)

### Which capture paths to test?

| Option | Description | Selected |
|--------|-------------|----------|
| Both paths side-by-side | Compare electron-audio-loopback vs AudioTee.js directly for an informed PRD architecture decision | ✓ |
| electron-audio-loopback only | Simpler default path, no native binary; treat AudioTee as future option | |
| AudioTee.js only | For users who already prefer the cleaner permissions UX | |

**User's choice:** Both paths side-by-side

---

### Which macOS versions to test?

| Option | Description | Selected |
|--------|-------------|----------|
| Current machine only | Run on whatever macOS is available; multi-version testing is a build milestone QA concern | ✓ |
| macOS 13 + macOS 14 minimum | Test both library floors for real evidence on supported-OS decision | |
| macOS 15 (latest) only | Validate on latest; derive floor from library constraints | |

**User's choice:** Current machine only

---

### What is the spike's success signal?

| Option | Description | Selected |
|--------|-------------|----------|
| Audio reaches the WebSocket — Deepgram returns a real transcript | Play audio → capture → stream to Deepgram Nova-3 → verify coherent transcript. Highest-confidence end-to-end proof | ✓ |
| PCM data flows — check waveform visually | Capture PCM, visualize as waveform or log RMS values; proves capture without Deepgram credits | |
| You decide | Leave success signal to researcher | |

**User's choice:** End-to-end transcript round-trip via Deepgram

---

### Test mic channel as well as system audio?

| Option | Description | Selected |
|--------|-------------|----------|
| Both channels — mic + system audio | Validate dual-channel simultaneously (production scenario for MeetingAssist) | ✓ |
| System audio only | Focus on the unknown; mic capture is proven in DNA | |
| You decide | Leave to researcher based on what's practical | |

**User's choice:** Both channels simultaneously

---

## Persona & Monetization Focus (RSCH-01)

### Primary customer type?

| Option | Description | Selected |
|--------|-------------|----------|
| Knowledge workers in general | PMs, managers, consultants, founders, remote teams — broad; let research validate the strongest pull segment | ✓ |
| Managers & team leads specifically | Accountable for decisions and action items; tighter ICP | |
| Consultants & freelancers | External-facing professionals; heavy meeting-note users | |

**User's choice:** Knowledge workers in general — evidence-first persona definition

---

### Monetization hypothesis?

| Option | Description | Selected |
|--------|-------------|----------|
| Subscription (monthly/annual) | Recurring revenue; aligns with ongoing API costs; research validates price point | ✓ |
| One-time license + user brings own API keys | Single payment; no ongoing API cost to carry; strong privacy story | |
| Freemium — free tier with usage cap | Free to drive adoption; paid for heavy users; requires managing free-tier API cost | |

**User's choice:** Subscription hypothesis — research to validate and pressure-test

---

### Include competitive landscape scan?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — focused competitive scan | Identify feature gaps vs Otter.ai, Fireflies, Granola, Notion AI; articulate differentiation story | ✓ |
| No — persona and monetization only | Keep RSCH-01 tight; let RSCH-06 handle competitive | |
| Lightweight — list competitors, don't deep-dive | Name main players + positioning angle in 1-2 lines | |

**User's choice:** Focused competitive scan included in RSCH-01

---

## Diarization Minimum Bar (RSCH-02)

### MVP speaker attribution level?

| Option | Description | Selected |
|--------|-------------|----------|
| Speaker labels without names (Speaker 1, 2, 3) | Upgrade over binary "You vs Others"; attribution without name-matching complexity | ✓ |
| "You vs Others" — two roles only | Free from dual-channel architecture; no diarization AI needed | |
| Named speakers (Alice, Bob) | Richer but requires name-matching mechanism; more UX complexity | |

**User's choice:** Speaker labels without names — Speaker 1, 2, 3 for MVP

---

### Named attribution in v1 or v2?

| Option | Description | Selected |
|--------|-------------|----------|
| v2 — post-MVP | Labels ship in v1; names deferred to post-meeting confirmation flow in v2 | ✓ |
| v1 — required if feasible | If Deepgram can diarize and user can confirm names post-meeting, ship it | |
| You decide | Leave to research based on what Nova-3 realistically enables | |

**User's choice:** Named attribution is v2

---

### Maximum speakers for v1?

| Option | Description | Selected |
|--------|-------------|----------|
| Up to 8 speakers | Covers larger team meetings, all-hands, panels; Nova-3 supports up to 12 | ✓ |
| 2–4 speakers | Covers 1:1s and small team meetings; the dominant use case | |
| You decide | Let research evaluate Nova-3 accuracy at count and recommend a cap | |

**User's choice:** Up to 8 speakers — research to evaluate accuracy cliff

---

## Use-Case Discovery Breadth (RSCH-06)

### Primary research lens?

| Option | Description | Selected |
|--------|-------------|----------|
| Both — competitive + meeting-type lens | Competitive surfaces feature gaps; meeting-type surfaces artifact/format differences | ✓ |
| Competitive research only | Feature-focused; what do other tools support that we miss? | |
| Meeting type discovery only | Which meeting types need different artifact formats? | |

**User's choice:** Both lenses — comprehensive coverage

---

### Any specific use cases to validate?

| Option | Description | Selected |
|--------|-------------|----------|
| No specific ones — fully open discovery | Let research surface whatever the market points to | ✓ |
| Yes — specific ones in mind | Pre-specified use cases to validate as hypotheses | |

**User's choice:** Fully open discovery — no pre-specified use cases

---

### Scope integrations beyond calendar?

| Option | Description | Selected |
|--------|-------------|----------|
| Note as potential v2 — don't scope for v1 | Surface what competitors consider table-stakes; mark as v2 candidates for PRD | ✓ |
| Yes — evaluate which are table-stakes for v1 | If Slack/Notion posting is expected, assess as v1 candidate | |
| You decide | Leave integration scoping to researcher based on competitive landscape | |

**User's choice:** Note as v2 candidates — MVP boundary decision in Phase 5

---

## Claude's Discretion

- **RSCH-03 vendor scope:** Researcher determines which LLM providers need DPA confirmation — Deepgram required; LLM providers determined by Phase 4 evaluation (minimum: Gemini as the default artifact model)
- **RSCH-05 data model:** Schema design, chunk granularity, and embedding strategy left to researcher's judgment within DEC-02 constraints
- **Spike report format:** Researcher chooses the format that best communicates the capture-path comparison

## Deferred Ideas

- Named speaker attribution (Speaker 1 → "Alice") — deferred to v2
- Integrations beyond calendar (Slack, Notion, CRM) — v2 candidates, surfaced by RSCH-06
- On-device mode full specification — carried forward from Phase 2; not in Phase 3 scope
- Multi-version macOS testing for capture — deferred to build milestone QA
