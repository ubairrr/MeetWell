# MeetingAssist

## What This Is

MeetingAssist is a macOS desktop AI assistant that runs as a persistent **side overlay** during live meetings and turns the conversation into trustworthy, actionable artifacts — automatically. It captures a full meeting transcript, then generates minutes of meeting (MOM), key points, a summary, and extracted schedules / dates / deadlines / action items ready to drop into a calendar. On top of that it offers in-meeting intelligence: a **live assistant** triggered by a keyword or hotkey for on-the-fly questions and research (with a chat that keeps context across the whole meeting), and a **break assist** that summarizes everything that happened while the user stepped away.

It is a new, purpose-built product that treats **Interview Helper as a reference** (the `DNA/` repo) — selectively borrowing the techniques that proved valuable rather than cloning it. Candidate techniques worth mining include real-time dual-channel transcription, provider-agnostic LLM integration, on-demand vision analysis, global hotkeys, and stealth-capable overlay rendering. Each is adopted only where it genuinely fits MeetingAssist; the rest is left behind. The DNA repo lives locally under `DNA/` as reference only — it is git-ignored and never pushed.

> **Current milestone = Discovery & PRD (planning only).** This milestone produces a production-grade, modular **PRD + architecture**, not running code. The intended feature set below is the *subject* of research and specification. Building the application is the **next** milestone.

## Core Value

**A user walks out of any meeting with an accurate, trustworthy record and a ready-to-act set of artifacts — minutes, decisions, action items, dates — without having taken a single note.** Everything else (live assistant, break assist, vision) is a differentiator layered on top of this core transcript→artifacts pipeline. If only one thing works, it must be this.

## Business Context

<!-- Aspires to be a real product; specifics are to be VALIDATED during the research phases. -->

- **Customer**: Professionals who attend many meetings (PMs, managers, consultants, founders, remote/hybrid teams) — to be sharpened in research.
- **Revenue model**: TBD — research to assess (one-time license vs. subscription vs. freemium with paid AI usage).
- **Success metric**: TBD — likely "meetings fully captured + artifacts the user trusts enough to not re-check." Defined during PRD.
- **Strategy notes**: Positioning, pricing, and competitive differentiation are explicit research deliverables this milestone.

## Requirements

> These are the requirements of the **product**. This milestone delivers the PRD that specifies them; it does **not** implement them. The deliverable requirements for *this* milestone live in `.planning/REQUIREMENTS.md`.

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — greenfield. The DNA repo is reference, not this product's shipped code.)

### Active

<!-- Product hypotheses to specify in the PRD. -->

**Starter (table-stakes) capabilities:**
- [ ] Persistent side-overlay UI that stays on during a meeting
- [ ] Full meeting transcription, saved as a complete transcript at meeting end
- [ ] Minutes of Meeting (MOM) generation
- [ ] Important points extraction
- [ ] Meeting summary generation
- [ ] Extraction of schedules / dates / times / deadlines / action items for later calendaring

**Advanced capabilities:**
- [ ] Live assistant activated by trigger keyword or hotkey for in-meeting questions & research
- [ ] Context-preserving chat interface that retains meeting context throughout the session
- [ ] Break assist — on activation, summarizes what happened until the user returns
- [ ] Additional use cases & features to be discovered during research (list is intentionally open)

**Quality bar:**
- [ ] Highly professional, production-grade, modular architecture (specified in the final PRD phase)

### Out of Scope

<!-- For THIS (discovery/PRD) milestone. -->

- Implementing or shipping the actual application — deferred to the next (build) milestone; this milestone ends at a finalized PRD.
- Final lock of the tech stack beyond inherited DNA defaults — ratified/extended in the PRD, not assumed now.
- The interview-assistance / exam use case — MeetingAssist is repositioned to legitimate meeting assistance; interview-cheating is explicitly not the product.

## Context

- **DNA — Interview Helper (`DNA/`, git-ignored).** Production-grade macOS Electron app, v1.1.0. Proven, reusable building blocks:
  - **Stealth-capable overlay rendering** — `NSWindowSharingNone` + `LSUIElement` + screen-saver-level window layering (invisible to Zoom/Meet/Teams, Dock, Cmd+Tab). *Whether MeetingAssist keeps stealth is an open ethics/legality question for research.*
  - **Real-time dual-channel transcription** — parallel Deepgram Nova-2 WebSockets for mic ("You") and system audio ("Interviewer"), with a speech-fragment accumulation state machine keyed on `speech_final`.
  - **Provider-agnostic LLM layer** — adapter over the OpenAI SDK `baseURL`; 7+ providers (Gemini, OpenAI, Groq, NVIDIA NIM, Ollama, LM Studio, OpenRouter) with no code changes.
  - **Vision assist** — screenshot → `sharp` in-process downscale → multimodal vision model round-trip.
  - **Hardened Electron** — `contextBridge` allowlist, context-isolated IPC, zero Node surface in renderer; 8 global hotkeys.
  - **Stack**: Electron 40, React 19 (hooks-only), Vite 7, `electron-store`, `@deepgram/sdk`, `openai`.
- **Reference thesis**: The transcript+LLM+overlay+hotkey machinery from "answer interview questions" maps well onto "assist and document a meeting," so the DNA is a rich source of proven solutions to borrow. But MeetingAssist is built fresh — each DNA technique is adopted only where it is genuinely the right fit, not inherited by default. The hard, non-obvious engineering (audio DSP pipelines, stealth layering, multimodal round-trips) is *solved* in the DNA and worth learning from, even when reimplemented cleanly.
- **Open questions for research** (non-exhaustive): consent/recording legality and ethics; whether to retain stealth or be visibly present; on-device vs. cloud transcription & privacy; speaker diarization & multi-participant attribution; calendar/integration targets (Google/Outlook/ICS); data retention & storage model; offline capability; cross-platform (macOS-only vs. Windows/Linux).

## Constraints

- **Platform**: macOS-first — DNA depends on macOS-only APIs (`NSWindowSharingNone`, `LSUIElement`, system-audio loopback). Cross-platform is a research/PRD question, not an assumption.
- **Tech foundation**: Electron + React 19 + Vite + provider-agnostic OpenAI-compatible LLM layer + Deepgram STT, inherited from DNA — Why: reuse proven, non-trivial engineering instead of rebuilding; final stack ratified in the PRD.
- **Architecture**: Must be production-grade and modular — Why: explicit user requirement; sets up a clean, maintainable build milestone.
- **Milestone scope**: Discovery/PRD only — no application implementation this milestone — Why: user wants thorough planning (DNA understanding → research → PRD) before any code.
- **Process / version control**: Every change is committed *and pushed* to the private GitHub repo `ubairrr/MeetingAssist` (auto-push Stop hook); `DNA/` and GSD tooling are git-ignored; `.planning/` is tracked — Why: user requires a complete, pushed history and the DNA's `.env` secrets must never leave the machine.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use Interview Helper as a **reference**; selectively adopt its proven techniques (not a wholesale port) | The hard engineering (dual-channel real-time STT, multimodal pipelines, provider-agnostic LLM, hardened IPC) is proven and worth borrowing where it fits — but MeetingAssist is a fresh, purpose-built codebase | — Pending (selective-adoption catalogue is a Phase 1 deliverable) |
| This milestone delivers a PRD + modular architecture only; build is the next milestone | De-risk by understanding the DNA and researching the space before writing product code | — Pending |
| Private GitHub repo `ubairrr/MeetingAssist` + auto-push every change; ignore `DNA/` and GSD tooling | User wants a full, pushed version-control trail; DNA holds live secrets that must never be pushed | ✓ Good (done at init) |
| Reposition from interview assistance to legitimate meeting assistance | Different, defensible product; meeting documentation is a broad, above-board need | — Pending |
| Stealth / screen-share invisibility: carry over from DNA or not? | Recording-consent ethics & legality differ from the product framing; needs deliberate decision | — Pending (resolve in research) |

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
*Last updated: 2026-06-25 — Phase 2 complete: DEC-01 and DEC-02 ADRs committed, consent and data-handling postures locked*
