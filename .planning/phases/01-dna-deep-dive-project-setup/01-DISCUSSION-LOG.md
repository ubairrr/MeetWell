# Phase 1: DNA Deep-Dive & Project Setup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 1-DNA Deep-Dive & Project Setup
**Areas discussed:** Deliverable structure, Catalogue format & verdicts, DNA read evidence depth, Baseline locking posture

---

## Flow note

Four gray areas were presented via multiSelect. The user first chose "Other → explain these options"; each option was explained in plain text with its trade-off and Claude's default. The user then replied **"go with your defaults"**, delegating all four decisions to Claude's recommended defaults. Selections below reflect those defaults.

---

## Deliverable structure

| Option | Description | Selected |
|--------|-------------|----------|
| Consolidated single doc | One Phase-1 file covering all outputs — easy linear read, but long and mixes concerns | |
| Separate focused docs | Setup-baseline, dev-baseline/conventions, catalogue, audio assessment as distinct files — independently citable downstream | ✓ |
| Location: phase folder vs. top-level docs/ | Keep in `.planning/phases/01.../` (GSD-native) vs. promote durable ones to tracked `docs/` | Phase folder ✓ |

**User's choice:** Default — separate docs inside the phase folder; conventions + catalogue are the durable pair.
**Notes:** Chosen so RSCH-04 can cite the audio assessment and the PRD can cite the catalogue/conventions independently.

---

## Catalogue format & verdicts

| Option | Description | Selected |
|--------|-------------|----------|
| 3-verdict taxonomy | borrow-and-adapt / design-reference / leave-behind (roadmap's set) | ✓ |
| Add 4th verdict | e.g. adopt-as-is or defer/undecided | `defer/undecided` only if needed |
| Per-technique fields | 5 fields: what DNA does · why valuable · what to change · risk/effort · verdict | ✓ |

**User's choice:** Default — 3 verdicts (+ defer/undecided only when unavoidable), 5-field structure.
**Notes:** Stealth entry must defer the keep/drop ethics call to Phase 2 (DEC-01).

---

## DNA read evidence depth

| Option | Description | Selected |
|--------|-------------|----------|
| Code-level for all | `file:line` + mechanism writeups for every technique | |
| Conceptual for all | Higher-level summaries, no line anchoring | |
| Mixed (code-level for borrow, conceptual for leave-behind) | Deep evidence where we'll reuse; light where we won't | ✓ |

**User's choice:** Default — code-level evidence for `borrow-and-adapt` techniques, conceptual for `leave-behind`.
**Notes:** Avoids over-investing in techniques we won't take.

---

## Baseline locking posture

| Option | Description | Selected |
|--------|-------------|----------|
| Pin now | Exact versions + fixed `main/<domain>/` layout fixed this phase | |
| Record direction | Node/Electron line, toolchain, proposed layout; final-pin deferred to PRD/build | ✓ |

**User's choice:** Default — record direction + rationale; mark exact-version pinning and final layout as PRD (Phase 5)/build-time decisions.
**Notes:** Respects ROADMAP ("final stack ratified in the PRD") and REQUIREMENTS Out-of-Scope ("Final tech-stack version pinning").

---

## Claude's Discretion

- All four gray areas were delegated to Claude's defaults ("go with your defaults").
- Latitude retained on exact doc filenames, section ordering, and table-vs-prose formatting within each deliverable.

## Deferred Ideas

None — discussion stayed within phase scope. (Stack ratification → Phase 5; consent/stealth posture → Phase 2 DEC-01; capture spike → Phase 3 RSCH-04 — all roadmap-scheduled.)
