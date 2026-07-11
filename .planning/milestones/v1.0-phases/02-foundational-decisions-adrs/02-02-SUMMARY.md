---
phase: "02-foundational-decisions-adrs"
plan: 02
subsystem: planning
tags: [adr, data-handling, privacy, encryption, retention, sqlite, safeStorage]
dependency_graph:
  requires:
    - 02-01 (DEC-01 Consent & Recording Posture ADR — established cross-referenced ADR format)
  provides:
    - DEC-02 Data-handling & Privacy ADR — locks data posture for Phase 3 RSCH-03 and Phase 5 PRD
  affects:
    - .planning/REQUIREMENTS.md (DEC-02 requirement)
    - Phase 3 RSCH-03 (vendor DPA / no-training confirmation)
    - Phase 5 PRD (storage spec, data model, settings surface)
tech_stack:
  added: []
  patterns:
    - MADR format (7-section) established for project ADRs (both DEC-01 and DEC-02 now follow same format)
    - Three-table options structure for multi-domain data decisions
key_files:
  created:
    - .planning/phases/02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md
  modified: []
decisions:
  - "DEC-02: Local-first SQLCipher (better-sqlite3-multiple-ciphers) + Electron safeStorage encryption locked as data-handling posture"
  - "DEC-06: Raw audio deleted by default after transcription (transcribe-then-delete-raw-audio); keep toggle is opt-in"
  - "DEC-07: Transcripts/MOM/summaries/action items retained indefinitely until user-initiated delete"
  - "DEC-08: Data persists after uninstall; app must surface prominent Delete All Meeting Data action"
  - "DEC-09: On-device mode flagged as planned future capability; no scope commitment in this ADR"
metrics:
  duration: "1m 45s"
  completed: "2026-06-25"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
status: complete
---

# Phase 02 Plan 02: Data-handling & Privacy ADR (DEC-02) Summary

**One-liner:** MADR-format DEC-02 ADR locking local-first SQLCipher + safeStorage encryption, transcribe-then-delete-raw-audio default, indefinite retention, and on-device mode as future capability — with explicit RSCH-03 open dependency.

---

## What Was Built

Created `.planning/phases/02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md` — the Data-handling & Privacy ADR that encodes four locked decisions (D-06 through D-09) from Phase 2 CONTEXT.md using the MADR format established in PATTERNS.md.

The ADR:
- Opens with a one-sentence declarative locked verdict per the PATTERNS.md posture statement convention
- Contains all 7 required MADR sections in order (Status, Context, Decision Drivers, Options Considered, Decision Outcome, Consequences, Open Dependencies)
- Presents three separate options tables for raw audio retention, transcript/artifact retention, and encryption at rest
- Ratifies the persistence stack table from CLAUDE.md as the authoritative data-handling decision
- Explicitly documents the RSCH-03 open dependency with the verbatim note from PATTERNS.md
- Cross-references DEC-01 via relative link `./02-DEC-01-consent-recording-posture.md`
- Satisfies ROADMAP Phase 2 success criteria 3 (data-handling ADR) and 4 (open dependency documented)

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write 02-DEC-02-data-handling-privacy.md — Data-handling & Privacy ADR | c3ce33a | `.planning/phases/02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md` (created) |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Known Stubs

None. This plan produces a documentation artifact only; no code stubs exist.

---

## Threat Flags

No new threat surface introduced. This plan produces a planning document only; no network endpoints, auth paths, file access patterns, or schema changes are introduced.

Note: Threat model T-02-05 (vendor training assumption / Information Disclosure) is explicitly addressed — the ADR Status header flags "pending RSCH-03 vendor confirmation" and the Open Dependencies section names RSCH-03 as an unresolved dependency. Downstream phases cannot miss the caveat.

---

## Self-Check: PASSED

- [x] `02-DEC-02-data-handling-privacy.md` exists at `.planning/phases/02-foundational-decisions-adrs/`
- [x] Commit `c3ce33a` exists and references the correct file
- [x] All 11 acceptance criteria verified via grep checks
- [x] No STATE.md or ROADMAP.md modifications made (orchestrator owns those)
