# Roadmap: MeetingAssist — Discovery & PRD Milestone

## Overview

This is a **planning milestone**: it ships a production-grade PRD + modular architecture and the de-risking decisions behind it — not running code (the one exception is RSCH-04, an isolated throwaway capture spike). The journey runs decisions-before-design-before-specification: first absorb the Interview Helper DNA as a selective reference and document the dev baseline (Phase 1); then fix the two existential product decisions as ADRs — consent/recording posture and data-handling/privacy (Phase 2); resolve the flagged open questions through deep research, including a hands-on system-audio capture spike (Phase 3); design the AI grounding/faithfulness contract and the ContextEngine/two-speed processing spec (Phase 4); and finally assemble everything into one authoritative, modular PRD with a recommended build order for the next milestone (Phase 5). Each phase's "done" is an artifact that exists — a catalogue, an ADR, a research finding, a spec, a PRD section — not a user-facing feature.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: DNA Deep-Dive & Project Setup** - Mine the DNA as a selective reference and document the dev baseline/conventions (completed 2026-06-25)
- [x] **Phase 2: Foundational Decisions (ADRs)** - Fix the two existential product decisions: consent/recording posture and data-handling/privacy (completed 2026-06-25)
- [ ] **Phase 3: Deep Research** - Resolve the flagged open questions, including a hands-on system-audio capture spike
- [ ] **Phase 4: AI Grounding & Context Spec (AI-SPEC)** - Design the faithfulness contract and the ContextEngine/two-speed processing architecture
- [ ] **Phase 5: PRD Finalization** - Assemble all decisions, research, scope, and architecture into one authoritative PRD

## Phase Details

### Phase 1: DNA Deep-Dive & Project Setup

**Goal**: Build an in-depth understanding of the Interview Helper DNA as a selective reference (what proven techniques to borrow vs. leave behind), and document the project conventions and local dev baseline for the future app. The GitHub repo, auto-push, and `.gitignore` are already wired at init — this phase documents and analyzes, it does not re-do git setup.
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, DNA-01, DNA-02, DNA-03, DNA-04
**Success Criteria** (what must be TRUE):

  1. A written record confirms the SETUP baseline is in place: the private repo + auto-push and the `.gitignore` rules (DNA/, GSD tooling, secrets ignored; `.planning/` tracked) are documented as the operating conventions
  2. A project-conventions / dev-baseline document exists, fixing the toolchain, the Node/Electron line, and the repo layout for the future app
  3. A selective-adoption catalogue exists listing each proven DNA technique (dual-channel STT handling, OpenAI-`baseURL` provider seam, hardened contextBridge IPC, vision round-trip, overlay/stealth window setup) with an explicit verdict to borrow-and-adapt vs. design-reference vs. leave behind — explicitly not a wholesale port
  4. The DNA's real audio-capture approach and its effective minimum macOS version are assessed and written down as input to the RSCH-04 spike and the supported-OS floor

**Plans**: 3/3 plans complete

- [x] 01-01-PLAN.md
- [x] 01-02-PLAN.md
- [x] 01-03-PLAN.md

### Phase 2: Foundational Decisions (ADRs)

**Goal**: Make the two existential product decisions that gate the legitimacy of the entire product and constrain everything downstream (capture, marketing, persistence, stack). Each decision lands as a committed ADR.
**Depends on**: Phase 1
**Requirements**: DEC-01, DEC-02
**Success Criteria** (what must be TRUE):

  1. A Consent & Recording Posture ADR exists fixing the posture: disclosed-not-covert, all-party-consent default, and a consent gate as a hard precondition to capture
  2. That ADR explicitly separates "hide the user's own panel from their own screen-share" (keep) from "conceal the fact of recording" (never ship)
  3. A Data-handling & Privacy ADR exists fixing local-first storage, encryption at rest (SQLCipher + `safeStorage`), retention defaults + per-meeting delete, the transcribe-then-delete-raw-audio stance, and an optional on-device mode
  4. Both ADRs note their open dependencies (e.g. the data-handling ADR flags that final no-training/DPA confirmation comes from RSCH-03)

**Plans**: 2/2 plans complete

Plans:

- [x] 02-01-PLAN.md — Write DEC-01 Consent & Recording Posture ADR (MADR format, decisions D-02 through D-05)
- [x] 02-02-PLAN.md — Write DEC-02 Data-handling & Privacy ADR (MADR format, decisions D-06 through D-09, RSCH-03 dependency flagged)

### Phase 3: Deep Research

**Goal**: Resolve the flagged open questions that the PRD depends on — persona/positioning/monetization, diarization approach, vendor terms, the highest-risk system-audio capture validation, the cross-meeting memory data model, and expanded use-case discovery. This phase warrants deeper per-question research when planned; RSCH-04 is a hands-on throwaway spike (isolated experimental code, not product code).
**Depends on**: Phase 2
**Requirements**: RSCH-01, RSCH-02, RSCH-03, RSCH-04, RSCH-05, RSCH-06
**Success Criteria** (what must be TRUE):

  1. Persona, positioning, and monetization model are defined, resolving the PROJECT.md TBDs (customer, revenue model, success metric)
  2. A speaker-diarization approach is decided — a reliable "You vs Others" baseline, plus whether/when to attempt 3+ speaker naming and the trust bar it must clear
  3. Deepgram and the chosen LLM provider(s) no-training / DPA terms are confirmed in writing, unblocking the data-handling ADR (DEC-02)
  4. A capture-spike report exists comparing `electron-audio-loopback` vs `AudioTee.js` across the supported macOS range, declaring a supported-macOS floor and a silent-audio / capture-health detection approach
  5. A cross-meeting memory data model (`sqlite-vec`) is designed, and expanded use cases beyond the starter list are discovered and consolidated for PRD scoping

**Plans**: 6 plans

- [ ] 03-01-PLAN.md — RSCH-01: Write Persona, Positioning & Monetization Report
- [ ] 03-02-PLAN.md — RSCH-02: Write Speaker Diarization Approach Report
- [ ] 03-03-PLAN.md — RSCH-03: Confirm Vendor Terms & Update DEC-02 ADR
- [ ] 03-04-PLAN.md — RSCH-05: Write Cross-Meeting Memory Data Model Design
- [ ] 03-05-PLAN.md — RSCH-06: Write Use-Case & Feature Discovery Report
- [ ] 03-06-PLAN.md — RSCH-04: System-Audio Capture Spike (autonomous: false)

### Phase 4: AI Grounding & Context Spec (AI-SPEC)

**Goal**: Produce the design contract that prevents the #1 trust-killer (fabricated artifacts) and keeps long meetings within budget. This is an AI-SPEC contract that must exist before any extraction is specified in the PRD.
**Depends on**: Phase 3
**Requirements**: GRND-01, GRND-02, GRND-03
**Success Criteria** (what must be TRUE):

  1. An AI-SPEC grounding/faithfulness contract exists requiring quote-backed extraction, per-artifact transcript citations, a "proposed-with-confirm" UX (never auto-write to calendar), and conservative date handling
  2. A ContextEngine + two-speed processing architecture spec exists (rolling window + RAG + epoch summaries; real-time hot path vs. end-of-meeting batch map-reduce) addressing long-meeting cost/context overflow
  3. An adversarial-transcript evaluation harness and a faithfulness metric are defined, specifying how grounding will be tested

**Plans**: TBD

### Phase 5: PRD Finalization

**Goal**: Synthesize all prior decisions, research, and the grounding spec into the milestone deliverable: a consolidated, production-grade, modular PRD with an explicit MVP boundary and a recommended build order for the next (build) milestone.
**Depends on**: Phase 4
**Requirements**: PRD-01, PRD-02, PRD-03, PRD-04
**Success Criteria** (what must be TRUE):

  1. A feature spec exists with an explicit MVP boundary — table stakes vs. differentiators vs. deferred (v2+)
  2. A production-grade modular architecture is specified: the `main/<domain>/` service layer, port/adapter contracts, and the core components (TranscriptStore, SessionManager FSM, ContextEngine, ArtifactPipeline)
  3. A recommended dependency-driven build order / phasing for the next (build) milestone is documented
  4. A single consolidated, authoritative PRD document assembles all decisions, research, scope, and architecture in one place

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. DNA Deep-Dive & Project Setup | 3/3 | Complete    | 2026-06-25 |
| 2. Foundational Decisions (ADRs) | 2/2 | Complete    | 2026-06-25 |
| 3. Deep Research | 0/6 | Planned     | - |
| 4. AI Grounding & Context Spec | 0/TBD | Not started | - |
| 5. PRD Finalization | 0/TBD | Not started | - |
