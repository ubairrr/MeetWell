# Phase 5: PRD Finalization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 5-PRD Finalization
**Areas discussed:** MVP feature boundary, PRD document structure, Architecture spec depth, Build order strategy

---

## MVP Feature Boundary

### Live assistant (in-meeting Q&A chat)

| Option | Description | Selected |
|--------|-------------|----------|
| v1 — ships with core | Key differentiator; ContextEngine is built anyway | |
| v2 — post-core polish | Ship core first, validate, then add live assistant | ✓ |

**User's choice:** v2 — post-core polish
**Notes:** ContextEngine still gets built in v1 (break assist depends on it). The interactive chat UI is the v2 addition.

---

### Break assist

| Option | Description | Selected |
|--------|-------------|----------|
| v1 — ships with core | Phase 4 fully specified it; cards exist anyway; near-zero extra cost | ✓ |
| v2 — post-core polish | Focus v1 on end-of-meeting artifacts only | |

**User's choice:** v1 — ships with core

---

### Meeting-type-specific templates

| Option | Description | Selected |
|--------|-------------|----------|
| v1 — one universal template | Focus on accuracy; simpler to build | |
| v1 — 2-3 core templates | Top 3 types; differentiates without full taxonomy | |
| v2 — post-launch | Design benefits from real usage data | ✓ |

**User's choice:** v2 — post-launch

---

### Cross-meeting search (sqlite-vec)

| Option | Description | Selected |
|--------|-------------|----------|
| v1 — include it | sqlite-vec infrastructure already designed; strong differentiator | |
| v2 — post-launch | DB schema is v1 infrastructure; search UX ships post-launch | ✓ |

**User's choice:** v2 — post-launch
**Notes:** sqlite-vec schema is designed and will be part of the v1 DB infrastructure, but the search feature (and its UX) ships in v2.

---

## PRD Document Structure

### Format

| Option | Description | Selected |
|--------|-------------|----------|
| One master PRD.md | Single comprehensive doc — easy to read end-to-end | |
| Modular linked docs | Hub PRD.md + separate FEATURE-SPEC, ARCHITECTURE, BUILD-ORDER files | ✓ |
| Hybrid — master + 1-2 annexes | PRD.md narrative + separate ARCHITECTURE.md | |

**User's choice:** Modular linked docs

---

### Audience

| Option | Description | Selected |
|--------|-------------|----------|
| Personal reference + future contractors | Explicit contracts; no implicit knowledge | |
| Personal reference only | Denser, skips obvious things | |
| Investor / stakeholder readable too | Executive summary section + technical spec | ✓ |

**User's choice:** Investor / stakeholder readable too
**Notes:** PRD.md opens with a non-technical executive summary covering product positioning, core value, differentiators, and monetization hypothesis. Technical spec sections follow.

---

## Architecture Spec Depth

### Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Module map + interface contracts | TypeScript interface / IPC contract per boundary; contractor-ready | ✓ |
| Full event/message flow | Sequence diagrams + event flow tables; maximum detail | |
| High-level module map only | Module names + responsibilities; no interface contracts | |

**User's choice:** Module map + interface contracts

---

### UI/IPC layer inclusion

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — include UI/IPC layer | Overlay window setup + contextBridge IPC + React component tree | ✓ |
| No — backend services only | Keep focused on 4 core service components | |

**User's choice:** Yes — include UI/IPC layer
**Notes:** Full-stack ARCHITECTURE.md covering both the service layer and the Electron/React UI layer.

---

## Build Order Strategy

### First shippable unit

| Option | Description | Selected |
|--------|-------------|----------|
| Audio capture + TranscriptStore | Highest technical risk; gates everything else | ✓ |
| Overlay shell + basic UI | Skeleton running early; visible progress | |
| ArtifactPipeline (end-of-meeting batch) | Business-value-dense; testable without live capture | |

**User's choice:** Audio capture + TranscriptStore (initially answered ArtifactPipeline, then changed)
**Notes:** User reconsidered and chose to front-load the hardest technical risk. Dual-channel capture working + persisting to SQLCipher is the foundation everything else builds on.

---

### Build milestone phase count

| Option | Description | Selected |
|--------|-------------|----------|
| 4–6 phases | Fine-grained; each completable in a focused session | ✓ |
| 3 phases (broad) | Backend → Frontend → Polish | |
| You decide | Leave to the build milestone planner | |

**User's choice:** 4–6 phases

---

## Claude's Discretion

- ArtifactPipeline Zod schema structure — left to researcher/planner
- SessionManager FSM state names and transitions — left to architecture spec writer
- PRD executive summary length and tone — left to PRD writer
- Exact build phase naming and boundaries — left to build milestone planner

## Deferred Ideas

- Live assistant (v2) — ContextEngine is built in v1; the chat UI ships post-MVP
- Meeting-type templates (v2) — needs real usage data
- Cross-meeting search UX (v2) — DB schema is v1; search feature is post-launch
- Named speaker attribution (v2) — from Phase 3 decision D-10
- Integrations beyond .ics (Slack, Notion, CRM) — v2 roadmap candidates per RSCH-06
- On-device/privacy mode full spec — deferred to build milestone
