# Requirements: MeetingAssist — Discovery & PRD Milestone

**Defined:** 2026-06-25
**Core Value:** A user walks out of any meeting with an accurate, trustworthy record and a ready-to-act set of artifacts (minutes, decisions, action items, dates) — without having taken a single note.

> **What these requirements are.** This is the **Discovery & PRD milestone**. Its deliverable is a production-grade PRD + modular architecture and the decisions that de-risk the build — **not** the running application. So the v1 requirements below are **discovery deliverables** ("done" = a decision is made, research is complete, a spec is written), not product features. The *product* features (transcription, MOM, summary, live assistant, break assist, etc.) are the **subject** of this work and are specified *inside* the PRD this milestone produces; they become the v1 requirements of the **next (build) milestone**. The product vision lives in `PROJECT.md`.

## v1 Requirements

Requirements for this milestone's "done." Each maps to a roadmap phase (see Traceability).

### Setup (SETUP)

- [x] **SETUP-01**: Private GitHub repo `ubairrr/MeetingAssist` connected; every change auto-committed and pushed (Stop-hook auto-push)
- [x] **SETUP-02**: `.gitignore` excludes `DNA/`, GSD tooling, and secrets; `.planning/` is tracked
- [x] **SETUP-03**: Project conventions and local dev baseline documented (toolchain, Node/Electron line, repo layout for the future app)

### DNA Deep-Dive — Selective Reference Mining (DNA)

> The DNA is a **reference, not a base to clone.** The goal is to identify the *working, valuable* pieces worth borrowing (adapted to MeetingAssist's needs) and to consciously leave the rest behind. MeetingAssist is a fresh, purpose-built codebase — not a fork of Interview Helper.

- [x] **DNA-01**: Relevant DNA source modules read and understood (`main.js`, `preload.js`, `audio.js`, renderer `App.jsx`, IPC surface, build/packaging) — enough to judge what is worth borrowing
- [x] **DNA-02**: Catalogue of the **proven techniques/patterns worth adopting** from the DNA (e.g. dual-channel STT handling, the OpenAI-`baseURL` provider seam, hardened contextBridge IPC, the vision round-trip, overlay/stealth window setup) — with an explicit list of what to **leave behind**
- [x] **DNA-03**: Selective-adoption plan — for each candidate piece, whether it is lifted-and-adapted or merely a design reference; explicitly **not** a wholesale port of the DNA
- [x] **DNA-04**: DNA's real audio-capture approach and effective minimum macOS version assessed (input to the RSCH-04 capture spike and the supported-OS floor)

### Foundational Decisions — ADRs (DEC)

- [ ] **DEC-01**: **Consent & Recording Posture** ADR — disclosed-not-covert; all-party-consent default; separates "hide own panel from own screen-share" (keep) from "conceal the fact of recording" (never ship); consent gate as a hard precondition to capture
- [ ] **DEC-02**: **Data-handling & Privacy** ADR — local-first storage, encryption at rest (SQLCipher + `safeStorage`), retention defaults + per-meeting delete, transcribe-then-delete-raw-audio stance, optional on-device mode

### Deep Research (RSCH)

- [ ] **RSCH-01**: Persona, positioning, and monetization model defined (resolves PROJECT.md TBDs: customer, revenue model, success metric)
- [ ] **RSCH-02**: Speaker-diarization approach decided ("You vs Others" reliable baseline; whether/when to attempt 3+ speaker naming, and the trust bar)
- [ ] **RSCH-03**: Vendor DPA / no-training terms confirmed for Deepgram and the chosen LLM provider(s) (gates DEC-02)
- [ ] **RSCH-04**: System-audio capture validated via a **hands-on throwaway spike** — `electron-audio-loopback` vs `AudioTee.js` across the supported macOS range; declared supported-OS floor; capture-health/silent-audio detection approach (highest technical risk; isolated experimental code, not product code)
- [ ] **RSCH-05**: Cross-meeting memory data model designed (`sqlite-vec`), even though the feature ships in a later milestone
- [ ] **RSCH-06**: Expanded use-case & feature discovery beyond the starter list, consolidated for PRD scoping (the feature list is intentionally open)

### AI Grounding & Context Spec (GRND)

- [ ] **GRND-01**: AI-artifact grounding/faithfulness design contract — quote-backed extraction, per-artifact transcript citations, "proposed-with-confirm" UX (never auto-write to calendar), conservative date handling
- [ ] **GRND-02**: ContextEngine + two-speed processing architecture spec (rolling window + RAG + epoch summaries; real-time hot path vs end-of-meeting batch map-reduce) for long meetings
- [ ] **GRND-03**: Adversarial-transcript evaluation harness + faithfulness metric defined (how grounding will be tested)

### PRD Finalization (PRD)

- [ ] **PRD-01**: Feature spec with explicit MVP boundary — table stakes vs differentiators vs deferred (v2+)
- [ ] **PRD-02**: Production-grade modular architecture — `main/<domain>/` service layer, port/adapter contracts, and the core components (TranscriptStore, SessionManager FSM, ContextEngine, ArtifactPipeline)
- [ ] **PRD-03**: Recommended dependency-driven build order / phasing for the next (build) milestone
- [ ] **PRD-04**: Consolidated, production-grade PRD assembling all decisions, research, scope, and architecture into one authoritative document

## v2 Requirements

Deferred to the **next (build) milestone** — tracked, not in this roadmap.

### Build the Product (BUILD)

- **BUILD-01**: Implement the application per the finalized PRD and modular architecture
- **BUILD-02**: Ship the v1 product feature set (transcription → MOM/summary/key-points/action-items/dates, `.ics` export, consent gate, live assistant, context chat, break assist) as specified in the PRD
- **BUILD-03**: Productionize — packaging, signing, notarization, and the capture-failure/permission-onboarding UX

## Out of Scope

Explicitly excluded from this milestone.

| Feature | Reason |
|---------|--------|
| Building or shipping the application | This milestone ends at a finalized PRD; implementation is the next milestone |
| Final tech-stack version pinning | Re-verify and pin at build time — versions/pricing move fast |
| Legal sign-off on consent posture | Research is directional, not legal advice; PRD adopts the strictest posture and recommends external counsel before GA |
| "Undetectable" recording / concealing the fact of recording | Existential legal liability; the product is a disclosed, consent-first recorder |
| Auto-joining meeting bots | Wrong architectural camp; MeetingAssist is local-capture, no-bot |

## Traceability

Which phase covers which requirement. Finalized during roadmap creation (2026-06-25) — confirmed against ROADMAP.md: 5 phases, 22/22 v1 requirements mapped, no orphans.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Complete |
| SETUP-02 | Phase 1 | Complete |
| SETUP-03 | Phase 1 | Complete |
| DNA-01 | Phase 1 | Complete |
| DNA-02 | Phase 1 | Complete |
| DNA-03 | Phase 1 | Complete |
| DNA-04 | Phase 1 | Complete |
| DEC-01 | Phase 2 | Pending |
| DEC-02 | Phase 2 | Pending |
| RSCH-01 | Phase 3 | Pending |
| RSCH-02 | Phase 3 | Pending |
| RSCH-03 | Phase 3 | Pending |
| RSCH-04 | Phase 3 | Pending |
| RSCH-05 | Phase 3 | Pending |
| RSCH-06 | Phase 3 | Pending |
| GRND-01 | Phase 4 | Pending |
| GRND-02 | Phase 4 | Pending |
| GRND-03 | Phase 4 | Pending |
| PRD-01 | Phase 5 | Pending |
| PRD-02 | Phase 5 | Pending |
| PRD-03 | Phase 5 | Pending |
| PRD-04 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-25*
*Last updated: 2026-06-25 after roadmap creation (traceability confirmed against ROADMAP.md)*
