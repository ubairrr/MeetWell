---
phase: 01-dna-deep-dive-project-setup
plan: 02
subsystem: analysis
tags: [electron, deepgram, openai, ipc, contextbridge, overlay, stealth, dna-analysis]

# Dependency graph
requires: []
provides:
  - Selective-adoption catalogue with D-04 5-field entries and D-03 verdicts for 5 DNA techniques
  - Deep code-level file:line evidence for all borrow-and-adapt techniques
  - Four Doc-vs-Code reconciliations (adapters/ myth, sharp myth, NSWindowSharingNone, LSUIElement)
  - Explicit leave-behind list with 6 items
  - Stealth/overlay technique documented; ethics deferred to Phase 2 DEC-01
affects: [phase-02-product-requirements, phase-05-prd-architecture, phase-03-rsch-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Selective adoption over wholesale port: each technique gets an explicit borrow-and-adapt / design-reference / leave-behind verdict"
    - "D-04 5-field structure per technique: what DNA does / why valuable / what to change / risk-effort / verdict"
    - "Doc-vs-Code correction callouts: code reality stated alongside README claims"

key-files:
  created:
    - .planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md
  modified: []

key-decisions:
  - "Dual-channel STT + speech_final state machine: borrow-and-adapt — the two-channel-separate-sockets design is exactly the You vs Others pattern MeetingAssist needs; adapt Nova-2→Nova-3, generalize Interviewer→N speakers"
  - "OpenAI-baseURL provider seam: borrow-and-adapt — proven, trivially provider-agnostic; add Structured Outputs + Zod (DNA lacks them); move keys to safeStorage"
  - "Hardened contextBridge IPC allowlist: borrow-and-adapt — reuse the allowlist pattern, redefine channel set for MeetingAssist's domains"
  - "Vision screenshot→downscale→model: design-reference — re-implement clean; replace nativeImage.resize() with sharp; meeting-domain prompts"
  - "Overlay/stealth window setup: borrow-and-adapt for the mechanism; setContentProtection + always-on-top + ignore-mouse-events are core overlay primitives; ethics/consent posture deferred to Phase 2 DEC-01"

patterns-established:
  - "Cite DNA/src/... paths only — never root main.js, never src/audio.js, never adapters/"
  - "Four Doc-vs-Code corrections are canonical; downstream plans must not repeat the README myths as fact"

requirements-completed: [DNA-01, DNA-02, DNA-03]

coverage:
  - id: D1
    description: "Selective-adoption catalogue (01-DNA-CATALOGUE.md) with 5 D-04 5-field technique entries, D-03 verdicts, deep file:line evidence for borrow-and-adapt techniques"
    requirement: DNA-01
    verification:
      - kind: manual_procedural
        ref: "grep -c 'src/main.js:' .planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md >= 3"
        status: pass
      - kind: manual_procedural
        ref: "grep -q 'speech_final' 01-DNA-CATALOGUE.md && grep -q 'src/main.js:22-26' 01-DNA-CATALOGUE.md && grep -q 'borrow-and-adapt' 01-DNA-CATALOGUE.md && grep -q 'design-reference' 01-DNA-CATALOGUE.md"
        status: pass
    human_judgment: false
  - id: D2
    description: "Leave-behind list with 6 items including legacy src/audio.js, root main.js duplicate, interview-specific prompts, plaintext electron-store keys, Nova-2 literal, adapters/"
    requirement: DNA-02
    verification:
      - kind: manual_procedural
        ref: "grep -q 'leave-behind' 01-DNA-CATALOGUE.md (leave-behind list section present)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Four Doc-vs-Code reconciliation corrections present verbatim: adapters/ myth, sharp myth, NSWindowSharingNone mapping, LSUIElement documented-but-not-implemented"
    requirement: DNA-03
    verification:
      - kind: manual_procedural
        ref: "grep -q 'DEC-01' 01-DNA-CATALOGUE.md (stealth ethics deferred) && reconciliation table present"
        status: pass
    human_judgment: true
    rationale: "Correctness of the four reconciliations requires a human to verify they accurately reflect the DNA code reality vs the README claims"

# Metrics
duration: 15min
completed: 2026-06-25
status: complete
---

# Phase 1 Plan 02: Selective-Adoption Catalogue Summary

**Code-backed selective-adoption catalogue for 5 Interview Helper DNA techniques — 4 `borrow-and-adapt`, 1 `design-reference`, with deep `DNA/src/...` file:line evidence and 4 Doc-vs-Code corrections that prevent the build milestone from copying DNA myths**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-25T16:08:00Z
- **Completed:** 2026-06-25T16:23:36Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `01-DNA-CATALOGUE.md` with 5 D-04 5-field technique entries and D-03 verdicts, satisfying requirements DNA-01, DNA-02, DNA-03
- All 4 `borrow-and-adapt` techniques carry deep code-level `DNA/src/...` file:line evidence — verified against live source during analysis
- 4 Doc-vs-Code reconciliations included verbatim from RESEARCH: the `adapters/` myth (seam is in `src/main.js:22-26` not `adapters/`), the `sharp` myth (DNA uses native `nativeImage.resize()`, not `sharp`), the `NSWindowSharingNone` indirection (set via `setContentProtection(true)`, constant never named), and the `LSUIElement` gap (documented in README, not present in shipped `Info.plist`)
- Overlay/stealth technique documented mechanism-only; keep-vs-drop ethics call explicitly deferred to Phase 2 DEC-01 per D-05
- Explicit 6-item leave-behind list included (legacy `src/audio.js`, root `main.js` duplicate, interview prompts, plaintext `electron-store` keys, Nova-2 literal, `adapters/` GSD tooling)

## Task Commits

1. **Task 1: Write the selective-adoption catalogue** - `754cb26` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md` — Selective-adoption catalogue: 5 techniques, D-04 5-field entries, D-03 verdicts, deep file:line evidence, Doc-vs-Code corrections, leave-behind list

## Decisions Made

- **Dual-channel STT + `speech_final`:** `borrow-and-adapt` — the separate-channels + `speech_final` accumulation pattern is directly applicable to MeetingAssist's "You vs Others" need; adapt trigger (interview-answer → artifact pipeline), generalize label (Interviewer → N speakers via diarization), upgrade Nova-2 → Nova-3
- **OpenAI-`baseURL` provider seam:** `borrow-and-adapt` — battle-tested, provider-agnostic; additions needed: Structured Outputs + Zod (DNA lacks these), keys to `safeStorage`/Keychain (DEC-02), seam extracted to `src/main/llm/` service module
- **Hardened `contextBridge` IPC:** `borrow-and-adapt` — allowlist pattern is the correct Electron security baseline; lift the mechanism, redefine channel names for MeetingAssist's IPC surface
- **Vision round-trip:** `design-reference` — re-implement clean with `sharp` (not `nativeImage.resize()`); meeting-domain prompts; short flow not worth direct code port
- **Overlay/stealth:** `borrow-and-adapt` for overlay primitives; ethics/consent posture is Phase 2 DEC-01 work, not a Phase 1 verdict

## Deviations from Plan

None — plan executed exactly as written. All code-level citations verified directly against the `DNA/src/...` live source tree before writing.

## Issues Encountered

None. All `file:line` citations from `01-RESEARCH.md` and `01-PATTERNS.md` resolved correctly against the live DNA source during verification reads.

## User Setup Required

None — documentation-only deliverable; no external service configuration required.

## Next Phase Readiness

- `01-DNA-CATALOGUE.md` is ready as the selective-adoption reference for Phase 5 PRD architecture
- The four Doc-vs-Code corrections are recorded so the build milestone cannot copy DNA myths
- Phase 2 DEC-01 can proceed with the stealth/overlay mechanism documented and the ethics question explicitly scoped
- Phase 3 RSCH-04 can proceed — the catalogue confirms the DNA's hand-rolled ScreenCaptureKit loopback approach vs `electron-audio-loopback`
- Plan 03 (DNA audio assessment) is the next parallel deliverable in this phase

## Self-Check: PASSED

- FOUND: `.planning/phases/01-dna-deep-dive-project-setup/01-DNA-CATALOGUE.md`
- FOUND: `.planning/phases/01-dna-deep-dive-project-setup/01-02-SUMMARY.md`
- FOUND commit: `754cb26` (feat(01-02): create selective-adoption catalogue for DNA techniques)

---
*Phase: 01-dna-deep-dive-project-setup*
*Completed: 2026-06-25*
