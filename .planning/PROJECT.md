# MeetingAssist

## What This Is

MeetingAssist is a macOS desktop AI assistant that runs as a persistent **side overlay** during live meetings and turns the conversation into trustworthy, actionable artifacts — automatically. It captures a full meeting transcript via dual-channel audio (microphone + system audio), then generates minutes of meeting (MOM), key points, a summary, and extracted schedules / action items ready to drop into a calendar. It adds a **live summary board** (5-minute interval cards stacked in the overlay) and a **break assist** that shows what was missed while the user stepped away.

The product is **v1 shipped** — a working, packaged macOS app (140 MB DMG) with a hardened Electron shell, encrypted local DB, adversarial eval harness (CGFS=1.000, EHR=0.000), and the full session flow from consent gate through artifact review.

> **Current state = v2.0 Build milestone complete.** Two milestones shipped: Discovery & PRD (v1.0) and Build (v2.0). Next milestone (v3.0) covers distribution (code signing cert) and v2 features (live assistant chat, named speaker attribution, cross-meeting search).

## Current State: Post v2.0 Build

**Shipped:** 2026-07-01
**Codebase:** ~6,080 LOC TypeScript/TSX across 48 files; 261 git commits
**Stack:** Electron 42.5.0, React 19, Vite 7, SQLCipher (better-sqlite3-multiple-ciphers), sqlite-vec 0.1.9, Deepgram Nova-3, Gemini 2.5 Flash (paid), audiotee 0.0.7, tiktoken, zod

**What works end-to-end:**
- Consent gate → dual-channel capture → Deepgram Nova-3 transcription → encrypted DB persistence
- End-of-meeting two-stage artifact extraction (MOM, summary, key points, action items) → ArtifactReview UI → .ics export
- Live 5-minute SummaryCardTimer → LiveSummaryBoard overlay panel
- ContextEngine with EpochCompressor (rolling 800K-token window, reads `transcript_segments` ONLY)
- Break assist: `OnBreak` FSM state + break digest on resume
- 60-minute meeting Vitest test passes without memory pressure
- Adversarial eval harness: CGFS=1.000, EHR=0.000 (30 live + 30 mock corpus cases)
- 140 MB DMG produced (`dist/meeting-assist-1.0.0.dmg`), app launches from DMG

**Pre-distribution tasks remaining:**
- Code signing + notarization (Apple Developer ID Application cert needed)
- Full live eval harness run (30/60 live; 30 mock — complete before public distribution)

## Core Value

**A user walks out of any meeting with an accurate, trustworthy record and a ready-to-act set of artifacts — minutes, decisions, action items, dates — without having taken a single note.** Everything else (live assistant, break assist, vision) is a differentiator layered on top of this core transcript→artifacts pipeline. If only one thing works, it must be this.

## Business Context

<!-- Validated in PRD milestone; specifics to sharpen with real users post-launch. -->

- **Customer**: Professionals who attend many meetings (PMs, managers, consultants, founders, remote/hybrid teams)
- **Revenue model**: TBD — to be validated post-launch (one-time license vs. subscription vs. freemium with paid AI usage)
- **Success metric**: Meetings fully captured + artifacts the user trusts enough not to re-check
- **Strategy notes**: Positioning, pricing, and competitive differentiation are distribution-milestone deliverables

## Requirements

> Full milestone requirements are archived in `.planning/milestones/v2.0-REQUIREMENTS.md`. This section tracks product-level status.

### Validated (v1.0 + v2.0 complete)

- Discovery & PRD milestone (v1.0) complete — PRD, ARCHITECTURE, FEATURE-SPEC, BUILD-ORDER, AI-SPEC all produced; all decisions locked *(Phases 1–5)*
- **FOUND-01–09** — Electron shell, overlay, SQLCipher DB, contextBridge IPC, SessionManager FSM, consent gate — ✓ v2.0
- **CAPT-01–09** — Dual-channel audio, Deepgram Nova-3, TranscriptStore, capture health — ✓ v2.0
- **ART-01–11** — Two-stage pipeline, CitationValidator, ArtifactReview UI, .ics export, Zod schemas — ✓ v2.0
- **UI-01–06** — Full overlay session flow, SummaryCardTimer, LiveSummaryBoard, AudioWorkletHost, typed IPC — ✓ v2.0
- **CTX-01–06** — ContextEngine, EpochCompressor, BreakAssist, 60-minute test — ✓ v2.0
- **PACK-01–05** — Packaging pipeline, entitlements, asarUnpack, eval harness CGFS/EHR gates — ✓ v2.0

### Active (v3.0 Distribution & v2 Features)

**Distribution (pre-distribution blockers):**
- [ ] Code signing + notarization with Apple Developer ID Application cert
- [ ] Full live eval harness run (all 60 corpus cases)
- [ ] Gatekeeper-approved DMG verified on fresh macOS 14.2+ machine

**v2 Feature work:**
- [ ] Live assistant interactive chat UI (ADV-01 — ContextEngine built; UI layer remaining)
- [ ] Named speaker attribution "Alice" / "Bob" (ADV-04 — v1 ships Speaker 1/2/3 labels)
- [ ] Cross-meeting semantic search UX (ADV-03 — sqlite-vec infrastructure ready in v1)
- [ ] Meeting-type-specific artifact templates (ADV-02 — needs usage data first)
- [ ] Google Calendar / Outlook direct API (ADV-05 — .ics covers v1; OAuth is v2)

### Out of Scope

- Interview-assistance / exam use case — MeetingAssist is legitimate meeting assistance only; this is explicitly not the product
- Gemini free-tier API — free tier allows training on meeting data (RSCH-03 critical warning, disqualified)
- Auto-writing artifacts to external systems — proposed-with-confirm contract is absolute; user must confirm before any external write
- Stealth recording — `setContentProtection(true)` hides the overlay panel from screen-share; hiding the fact of recording is not acceptable (DEC-01)

## Context

- **Stack:** Electron 42.5.0, React 19.2.7, Vite 7.3.6, `better-sqlite3-multiple-ciphers` 12.11.1, `sqlite-vec` 0.1.9, Deepgram Nova-3 (paid), Gemini 2.5 Flash (paid), `audiotee` 0.0.7, `tiktoken`, `zod` + `zod-to-json-schema`
- **Architecture:** All audio/STT/DB/LLM/session logic in Electron main process; renderer is display-only; typed contextBridge allowlist enforces the boundary
- **Known issues / tech debt:** Code signing pending cert; Chromium loopback health reflects error state (v1 limitation documented in CAPT-03); EmbeddingAdapter infrastructure-only in v1 (live embedding path for v2 live assistant)
- **Eval results:** CGFS=1.000, EHR=0.000 on 30 live corpus cases; all adversarial faithfulness gates passed

## Constraints

- **Platform**: macOS 14.2+ required — `audiotee` Core Audio Taps primary capture path requires macOS 14.2+; Chromium loopback fallback requires 15.0+.
- **Tech stack**: Locked for v2.0. Electron 41 LTS, React 19, Vite 7, `audiotee` 0.0.7, Deepgram Nova-3, Gemini 2.5 Flash (paid), `better-sqlite3-multiple-ciphers` + `sqlite-vec` 0.1.9, `zod` + `zod-to-json-schema`, `tiktoken`. No architectural decisions without updating PRD docs.
- **Architecture**: Production-grade, modular — `src/main/<domain>/` boundaries, typed IPC allowlist, single Zod schema source. All conventions from 05-ARCHITECTURE.md enforced throughout build.
- **Process / version control**: Every change committed and pushed to `ubairrr/MeetingAssist`; `DNA/` and `.claude/` git-ignored; `.planning/` tracked.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|------------|
| Use Interview Helper as a **reference**; selectively adopt its proven techniques | Hard engineering (dual-channel STT, hardened IPC, overlay window) is proven — MeetingAssist is a fresh codebase | ✓ Good — selective-adoption catalogue in Phase 1 |
| Discovery/PRD milestone first; build is the next milestone | De-risk by researching and specifying before writing product code | ✓ Good — PRD complete, all decisions locked |
| Private GitHub repo + auto-push; ignore `DNA/` and `.claude/` tooling | Full pushed version-control trail; DNA holds live secrets never to be pushed | ✓ Good |
| Reposition from interview assistance to legitimate meeting assistance | Different, defensible product; meeting documentation is a broad, above-board need | ✓ Resolved |
| Stealth / screen-share: use `setContentProtection(true)` — hides overlay from screen-share, not from transcript disclosure | Recording-consent ethics require disclosed recording; hiding the overlay panel from screen-share is acceptable; hiding the fact of recording is not | ✓ Good — DEC-01 |
| `audiotee` 0.0.7 (Core Audio Taps) as primary audio capture | RSCH-04 spike validated; pre-mixer quality; no purple indicator; supersedes `electron-audio-loopback` | ✓ Good — RSCH-04 |
| Gemini paid plan only; free tier disqualified | Free tier allows training on submitted meeting data (RSCH-03 critical warning) | ✓ Good — DEC-02 |
| `mip_opt_out:true` hardcoded in Deepgram SDK — never a user setting | Product-level privacy commitment (DEC-02) | ✓ Good — DEC-02 |
| Two-stage artifact extraction (verbatim quotes → structured content) | Prevents hallucination; every output traceable to a transcript quote | ✓ Good — 04-AI-SPEC |
| All artifacts `status: 'proposed'`; user confirms before any external write | Proposed-with-confirm contract is absolute — auto-writing to calendars is never allowed | ✓ Good — 04-AI-SPEC |
| EpochCompressor reads from `transcript_segments` ONLY | AI-SPEC §2.2 Pitfall 4 — summary_cards must never be a compression input | ✓ Enforced — Phase 10 |
| EmbeddingAdapter infrastructure-only in v1 | No live embedding in production; v2 live assistant will activate this path | ✓ Expected tech debt |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Business Context check — customer, revenue model, success metric still accurate?
4. Audit Out of Scope — reasons still valid?
5. Update Context with current state

---
*Last updated: 2026-07-01 after v2.0 Build milestone — v1 shipped, 46/46 requirements complete, DMG produced*
