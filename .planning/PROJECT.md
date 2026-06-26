# MeetingAssist

## What This Is

MeetingAssist is a macOS desktop AI assistant that runs as a persistent **side overlay** during live meetings and turns the conversation into trustworthy, actionable artifacts — automatically. It captures a full meeting transcript, then generates minutes of meeting (MOM), key points, a summary, and extracted schedules / dates / deadlines / action items ready to drop into a calendar. It adds a **live summary board** (5-minute interval cards stacked in the overlay) and a **break assist** that shows what was missed while the user stepped away.

The product is built fresh — the `DNA/` repo (Interview Helper) is a local reference only, selectively mined for proven techniques (dual-channel transcription, hardened IPC, overlay window) and never cloned wholesale. DNA is git-ignored and never pushed.

> **Current milestone = Build.** The Discovery & PRD milestone is complete. All architectural decisions are locked in the PRD documents. This milestone implements the product per the PRD.

## Current Milestone: v2.0 Build

**Goal:** Implement MeetingAssist v1 — a working, packaged, notarized macOS app with a production-grade, modular codebase that captures dual-channel meeting audio, produces trustworthy artifacts, and shows a live summary board.

**Target features:**
- Production-grade Electron app shell: hardened contextBridge IPC, SQLCipher DB, overlay window, SessionManager FSM
- Dual-channel audio capture (`audiotee` + Deepgram Nova-3) + encrypted transcript persistence
- End-of-meeting artifact pipeline: MOM, summary, key points, action items (two-stage, citation-backed, proposed-with-confirm)
- Overlay UI with live 5-minute summary board (SummaryCardTimer + LiveSummaryBoard)
- ContextEngine + break assist (EpochCompressor, rolling context from `transcript_segments`)
- Signed/notarized DMG + adversarial eval harness (CGFS ≥ 0.85 / EHR ≤ 0.05 shipping gate)

## Core Value

**A user walks out of any meeting with an accurate, trustworthy record and a ready-to-act set of artifacts — minutes, decisions, action items, dates — without having taken a single note.** Everything else (live assistant, break assist, vision) is a differentiator layered on top of this core transcript→artifacts pipeline. If only one thing works, it must be this.

## Business Context

<!-- Aspires to be a real product; specifics are to be VALIDATED during the research phases. -->

- **Customer**: Professionals who attend many meetings (PMs, managers, consultants, founders, remote/hybrid teams) — to be sharpened in research.
- **Revenue model**: TBD — research to assess (one-time license vs. subscription vs. freemium with paid AI usage).
- **Success metric**: TBD — likely "meetings fully captured + artifacts the user trusts enough to not re-check." Defined during PRD.
- **Strategy notes**: Positioning, pricing, and competitive differentiation are explicit research deliverables this milestone.

## Requirements

> Full milestone requirements with REQ-IDs live in `.planning/REQUIREMENTS.md`. This section tracks product-level status.

### Validated

<!-- Shipped and confirmed valuable — moves here after build phases complete. -->

- Discovery & PRD milestone (v1.0) complete — production-grade PRD, ARCHITECTURE, FEATURE-SPEC, BUILD-ORDER, AI-SPEC all produced. All architectural decisions locked. *(Phases 1–5)*

### Active

<!-- Build milestone (v2.0) implementation targets. -->

**Foundation:**
- [ ] Electron app shell with overlay window, hardened contextBridge IPC surface, SessionManager FSM
- [ ] SQLCipher AES-256 DB with all 7 tables; `safeStorage`-backed key; `sqlite-vec` extension loaded
- [ ] Consent gate UI enforced in main-process FSM (not renderer-only)
- [ ] Production-grade codebase: `src/main/<domain>/` module boundaries, single Zod schema source of truth

**Capture + transcript:**
- [ ] Dual-channel audio capture: `audiotee` 0.0.7 (primary) + Chromium loopback (fallback)
- [ ] Deepgram Nova-3 dual-WebSocket: mic + system audio, diarization, `mip_opt_out:true` hardcoded
- [ ] Encrypted transcript persistence in `transcript_segments` table

**Artifacts:**
- [ ] Two-stage artifact extraction (Stage 1: verbatim quotes → Stage 2: structured content from quotes only)
- [ ] MOM, summary, key points, action items — all `status: 'proposed'`, user confirms before export
- [ ] CitationValidator: every artifact item traceable to a verbatim quote
- [ ] .ics calendar export (zero OAuth — universal format)

**Overlay UI + live summary:**
- [ ] Full session flow in overlay: consent → capturing → on-break → artifact review
- [ ] 5-minute SummaryCardTimer → LiveSummaryBoard (stacked cards)
- [ ] ArtifactReview panel: confirm / edit / dismiss each proposed item

**Context engine + break assist:**
- [ ] ContextEngine: EpochCompressor reads from `transcript_segments` ONLY (not summary_cards)
- [ ] BreakAssist: digest of missed content on return from break
- [ ] 60-minute meeting test passes without memory pressure

**Packaging:**
- [ ] Signed + notarized DMG (`hardenedRuntime: true`, `notarytool`)
- [ ] Adversarial eval harness: CGFS ≥ 0.85 + EHR ≤ 0.05 shipping gate

### Out of Scope

<!-- For THIS (build/v2.0) milestone. -->

- Live assistant chat UI (ContextEngine built in Phase 5; chat UI is v2)
- Meeting-type-specific templates (v2 — needs real usage data first)
- Cross-meeting search UX (DB infrastructure built; search UI is v2)
- Named speaker attribution (v2 — v1 uses Speaker 1/2/3 labels)
- Direct Google/Outlook calendar API (v2 — .ics is universal and sufficient for v1)
- The interview-assistance / exam use case — explicitly not the product

## Context

- **DNA — Interview Helper (`DNA/`, git-ignored).** Production-grade macOS Electron app, v1.1.0. Proven, reusable building blocks:
  - **Stealth-capable overlay rendering** — `NSWindowSharingNone` + `LSUIElement` + screen-saver-level window layering (invisible to Zoom/Meet/Teams, Dock, Cmd+Tab). *Whether MeetingAssist keeps stealth is an open ethics/legality question for research.*
  - **Real-time dual-channel transcription** — parallel Deepgram Nova-2 WebSockets for mic ("You") and system audio ("Interviewer"), with a speech-fragment accumulation state machine keyed on `speech_final`.
  - **Provider-agnostic LLM layer** — adapter over the OpenAI SDK `baseURL`; 7+ providers (Gemini, OpenAI, Groq, NVIDIA NIM, Ollama, LM Studio, OpenRouter) with no code changes.
  - **Vision assist** — screenshot → `sharp` in-process downscale → multimodal vision model round-trip.
  - **Hardened Electron** — `contextBridge` allowlist, context-isolated IPC, zero Node surface in renderer; 8 global hotkeys.
  - **Stack**: Electron 40, React 19 (hooks-only), Vite 7, `electron-store`, `@deepgram/sdk`, `openai`.
- **Reference thesis**: The transcript+LLM+overlay+hotkey machinery from "answer interview questions" maps well onto "assist and document a meeting," so the DNA is a rich source of proven solutions to borrow. But MeetingAssist is built fresh — each DNA technique is adopted only where it is genuinely the right fit, not inherited by default. The hard, non-obvious engineering (audio DSP pipelines, stealth layering, multimodal round-trips) is *solved* in the DNA and worth learning from, even when reimplemented cleanly.
- **Open questions resolved in PRD:** consent/recording posture (DEC-01 — disclosed-only, consent gate is mandatory), data handling (DEC-02 — local-first, AES-256, no cloud upload), audio capture (RSCH-04 — `audiotee` primary / Chromium loopback fallback), STT vendor (RSCH-03 — Deepgram paid plan, `mip_opt_out:true`), LLM (RSCH-03 — Gemini paid plan only, free tier disqualified). Stealth resolved: `setContentProtection(true)` hides overlay from screen-share; disclosed recording posture is unconditional.

## Constraints

- **Platform**: macOS 14.2+ required — `audiotee` Core Audio Taps primary capture path requires macOS 14.2+; Chromium loopback fallback requires 15.0+.
- **Tech stack**: Locked. Electron 41 LTS, React 19, Vite 7, `audiotee` 0.0.7, Deepgram Nova-3, Gemini 2.5 Flash (paid), `better-sqlite3-multiple-ciphers` + `sqlite-vec` 0.1.9, `zod` + `zod-to-json-schema`, `tiktoken`. No architectural decisions without updating PRD docs.
- **Architecture**: Production-grade, modular — `src/main/<domain>/` boundaries, typed IPC allowlist, single Zod schema source. All conventions from 05-ARCHITECTURE.md enforced throughout build.
- **Milestone scope**: Build only — implement the product per the PRD. No new features outside FEATURE-SPEC.md D-01–D-10 without a PRD update.
- **Process / version control**: Every change committed and pushed to `ubairrr/MeetingAssist`; `DNA/` and `.claude/` git-ignored; `.planning/` tracked.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use Interview Helper as a **reference**; selectively adopt its proven techniques | Hard engineering (dual-channel STT, hardened IPC, overlay window) is proven and worth borrowing — but MeetingAssist is a fresh codebase | ✓ Resolved — selective-adoption catalogue in Phase 1 |
| Discovery/PRD milestone first; build is the next milestone | De-risk by researching and specifying before writing product code | ✓ Done — PRD complete, all decisions locked |
| Private GitHub repo + auto-push; ignore `DNA/` and `.claude/` tooling | Full pushed version-control trail; DNA holds live secrets never to be pushed | ✓ Good (done at init) |
| Reposition from interview assistance to legitimate meeting assistance | Different, defensible product; meeting documentation is a broad, above-board need | ✓ Resolved |
| Stealth / screen-share: use `setContentProtection(true)` — hides overlay from screen-share, not from transcript disclosure | Recording-consent ethics require disclosed recording; hiding the overlay panel from screen-share is acceptable; hiding the fact of recording is not | ✓ Resolved — DEC-01 |
| `audiotee` 0.0.7 (Core Audio Taps) as primary audio capture | RSCH-04 spike validated; pre-mixer quality; no purple indicator; supersedes `electron-audio-loopback` | ✓ Resolved — RSCH-04 |
| Gemini paid plan only; free tier disqualified | Free tier allows training on submitted meeting data (RSCH-03 critical warning) | ✓ Resolved — DEC-02 / RSCH-03 |
| `mip_opt_out:true` hardcoded in Deepgram SDK — never a user setting | Product-level privacy commitment (DEC-02) | ✓ Resolved — DEC-02 |
| Two-stage artifact extraction (verbatim quotes → structured content) | Prevents hallucination; every output traceable to a transcript quote | ✓ Resolved — 04-AI-SPEC |
| All artifacts `status: 'proposed'`; user confirms before any external write | Proposed-with-confirm contract is absolute — auto-writing to calendars is never allowed | ✓ Resolved — 04-AI-SPEC |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Business Context check — customer, revenue model, success metric still accurate?
4. Audit Out of Scope — reasons still valid?
5. Update Context with current state

---
*Last updated: 2026-06-26 — Build milestone (v2.0) started: Discovery & PRD complete, all decisions locked, codebase cleaned for implementation*
