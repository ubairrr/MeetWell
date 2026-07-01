---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Advanced Assistant Features
status: planning
last_updated: "2026-07-01T20:30:00.000Z"
last_activity: 2026-07-01
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-01)

**Core value:** A user walks out of any meeting with an accurate, trustworthy record and a ready-to-act set of artifacts — without having taken a single note.
**Current focus:** v3.0 Advanced Assistant Features — roadmap created, ready to plan Phase 12 (Named Speaker Attribution)

> **Milestone framing:** ROADMAP.md now covers Phases 12–15 for v3.0 — Named Speaker Attribution, Meeting-Type Artifact Templates, Cross-Meeting Semantic Search, and Live Assistant Interactive Chat. Distribution work (code signing/notarization, direct calendar APIs) remains deferred to a later milestone.

## Current Position

Phase: 12 of 15 (Named Speaker Attribution)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-07-01 — ROADMAP.md and REQUIREMENTS.md traceability created for v3.0 (Phases 12–15, 20/20 requirements mapped)

Progress: [░░░░░░░░░░] 0% (v3.0 milestone)

## Shipped Milestones

| Milestone | Name | Phases | Plans | Shipped |
|-----------|------|--------|-------|---------|
| v1.0 | Discovery & PRD | 1–5 | 17 | 2026-06-26 |
| v2.0 | Build | 6–11 | 42 | 2026-07-01 |

## Performance Metrics

**Velocity:**
- Total plans completed: 59 (v1.0 + v2.0)
- Average duration: see milestone retrospectives
- Total execution time: see `.planning/RETROSPECTIVE.md`

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 12–15 (v3.0) | 0 | - | - |

**Recent Trend:**
- v3.0 not yet started — no plan durations recorded

*Updated after each plan completion*

## Accumulated Context

### Active Decisions

All architectural decisions are locked — see PRD documents before coding any feature.

- [DEC-01]: Disclosed-not-covert recording posture; consent gate is a hard precondition to any capture
- [DEC-02]: Local-first, AES-256 encrypted storage; `mip_opt_out: true` hardcoded in Deepgram SDK — never a user setting
- [RSCH-04]: `audiotee` 0.0.7 (Core Audio Taps) is primary audio capture; Chromium loopback is fallback
- [RSCH-03]: Gemini paid plan only — free tier disqualified (allows training on meeting data)
- [04-AI-SPEC]: Two-stage extraction (verbatim quotes → structured content); proposed-with-confirm is absolute
- [ARCH]: All audio/STT/DB/LLM/session logic in Electron main process; renderer is display-only
- [v3.0 roadmap]: Speaker labels resolved at read time via a new `speaker_aliases` table scoped by `(meeting_id, original_label)` — `transcript_segments.speaker_label` is never mutated
- [v3.0 roadmap]: Meeting-type variance lives in `content_json` + a new `meetings.meeting_type` column — never a new `artifact_type` CHECK-constraint value
- [v3.0 roadmap]: `vec_chunks` schema needs `chunk_type`/`model_id` columns — confirm `sqlite-vec` 0.1.9 `ALTER TABLE` support before Phase 14 implementation; drop-and-recreate if unsupported
- [v3.0 roadmap]: SPKR-04 (renamed speakers in cross-meeting search results) is mapped to Phase 14, not Phase 12, since it isn't observable/verifiable until the search panel exists

### Critical Anti-Patterns to Enforce

- EpochCompressor must read from `transcript_segments` ONLY — never from `summary_cards` (AI-SPEC §2.2 Pitfall 4)
- No raw `ipcRenderer` exposed in renderer — typed contextBridge allowlist only
- `mip_opt_out: true` hardcoded at Deepgram SDK client init — verify before any Deepgram testing
- All artifact items created with `status: 'proposed'` — auto-writing to external systems is never allowed
- `asarUnpack` must include both `better-sqlite3-multiple-ciphers` `.node` and `audiotee` Swift binary
- (v3.0) Speaker relabeling must never mutate `speaker_label` in `transcript_segments` — resolve at read/export/search time only
- (v3.0) Stage 1 verbatim-quote extraction must stay template-agnostic — only Stage 2 varies by `meeting_type`
- (v3.0) Chat must reuse the two-stage evidence-extraction → constrained-generation pattern — never answer directly from raw context

### Pending Todos

None.

### Blockers/Concerns

- Pre-distribution (deferred, not blocking v3.0): Apple Developer ID Application cert needed before public Gatekeeper-approved distribution; full live eval harness run (30/60 live cases run, 30 mock) still pending
- (v3.0, flagged by research) `sqlite-vec` 0.1.9's `ALTER TABLE ADD COLUMN` support on `vec0` virtual tables is unverified — resolve as the first sub-step of Phase 14
- (v3.0, flagged by research) `LLMAdapter.stream()`'s usage-accounting path (`finalChatCompletion()`) is unexercised in production — verify early in Phase 15
- (v3.0, flagged by research) Concurrent LLM calls from chat (Phase 15) and the existing `SummaryCardTimer` need a request queue/serialization strategy — no existing test coverage

## Deferred Items

Items carried forward from v2.0 Build milestone:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| distribution | Code signing / notarization (Apple Developer ID cert) | Needs cert | v2.0 archive |
| distribution | Full live eval harness run (30/60 live; 30 mock) | Pre-distribution | v2.0 archive |
| distribution | Google/Outlook direct API (ADV-05) | Out of scope for v3.0 | v2.0 archive |
| tech debt | Chromium loopback health reflects error state (CAPT-03 v1 limitation) | Document for v2 | v2.0 archive |

## Session Continuity

Last session: 2026-07-01 20:30
Stopped at: ROADMAP.md (Phases 12–15) and REQUIREMENTS.md traceability written for v3.0; awaiting user approval before `/gsd-plan-phase 12`
Resume file: None
