---
phase: 05
document: PRD
version: 1.0
status: final
milestone: Discovery & PRD
requirements_covered: PRD-04
created: 2026-06-26
---

# MeetingAssist — Product Requirements Document

> **This is the authoritative entry point for the MeetingAssist build milestone.** A new engineer joining the team should start here, read the executive summary to understand the product, then navigate to the linked documents for implementation detail.

## Document Map

| Document | Audience | Purpose |
|----------|----------|---------|
| **05-PRD.md** (this file) | All | Hub: executive summary, decisions index, navigation |
| [05-FEATURE-SPEC.md](./05-FEATURE-SPEC.md) | Product + Engineering | Full feature spec with MVP boundary table (10 table-stakes / 5 differentiators / 6 deferred v2+) |
| [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) | Engineering | Module map, TypeScript interfaces, IPC contracts, DB DDL, component tree |
| [05-BUILD-ORDER.md](./05-BUILD-ORDER.md) | Build milestone planner | Dependency-driven 6-phase build sequence with rationale and acceptance criteria |

---

## Section 1: Executive Summary

### 1.1 What Is MeetingAssist?

MeetingAssist is a macOS desktop assistant that sits on the side of your screen during any meeting — in-person, video call, or phone — and automatically produces a complete record: formal minutes, key decisions, action items with deadlines, and a full meeting summary. You walk out of every meeting with a document you can share and deadlines you can act on, without having taken a single note. The assistant is invisible to other meeting participants and works entirely on your own device; nothing you say is stored on a cloud server you do not control.

### 1.2 The Problem

Knowledge workers spend 12–15 hours per week in meetings. Sixty-five percent of those meetings are considered unproductive. The outcomes that matter — decisions made, tasks assigned, follow-up dates agreed — are only as good as whoever took notes, which means they are frequently incomplete, biased toward the note-taker's perspective, and wrong in ways nobody catches until the action item is due and nothing happened.

Existing AI tools that solve this problem send a visible "bot" into the meeting as a new participant. Eighty-four percent of workers change what they say and how they say it when they know AI is visibly present in the room. These bots are increasingly banned by enterprise IT departments, trigger recording-consent objections from participants, and upload all meeting audio to the vendor's servers. MeetingAssist works through your own computer's microphone and speakers, with your own disclosure to participants, with data stored on your device.

### 1.3 Market Signal

The AI meeting assistant market is USD 3.67 billion in 2024 and projected to grow at 34.7% CAGR through 2034. Granola — the closest direct analog — raised USD 43 million in early 2025 on a similar bot-free, macOS-native premise, validating that this segment is both real and fundable. The primary customer is the knowledge worker at a high-meeting-volume team: consulting, investment, legal, product, and engineering. Forty-six to fifty percent of workers cite privacy and security as their top reason to avoid AI meeting tools today — MeetingAssist's local-first approach directly addresses the largest adoption barrier in the category.

*Sources: RSCH-01 — useluminix.com/reports; Granola raise from granola.ai/blog.*

### 1.4 Five Differentiating Pillars

These five characteristics separate MeetingAssist from every current competitor:

1. **No visible bot.** MeetingAssist works through your own computer's microphone and speakers. No bot account joins your call, no new participant appears in the participant list, no IT policy is triggered. Participants remain unaware of automated capture beyond what you disclose to them.

2. **You own your data.** Everything is stored on your device, protected by encryption. You can delete a meeting record at any time. Nothing is uploaded to a cloud storage service — not the audio, not the transcript, not the summary.

3. **Trustworthy records.** Every action item and every decision in the generated minutes is traceable to a direct quote from the conversation. The system shows you the exact words that support each item. You can verify any output before acting on it.

4. **Real-time awareness.** A running summary of what just happened appears on the side of your screen every five minutes during the meeting. If you step away, you get a digest of everything you missed the moment you return — without asking anyone to repeat themselves.

5. **Private by design.** Disclosed recording only — a consent confirmation is required before the assistant starts listening. This is not a toggle or a setting; it is how the product works. The founding privacy commitment is unconditional.

### 1.5 Monetization Hypothesis

- **Free trial first:** A 14–30 day trial with full features and no meeting-length cap removes the activation barrier and lets the product prove its value before asking for payment. Trial-first approaches outperform permanent free tiers for tools with a strong "aha moment" on first use.
- **Paid tier:** $12–15 per user per month (individual). Positioned below Fireflies.ai ($19) and Otter.ai (~$20), at parity with Granola ($14) and Fathom ($15). An annual subscription at ~40% discount matches the market standard.
- **No usage caps:** Minute limits are the top user complaint across competitor tools. MeetingAssist charges for access, not for usage.
- **Success metric hypothesis:** Free trial to paid conversion rate of 25% or higher. This is the standard B2C SaaS benchmark for tools with a clear free-to-paid value unlock.

*Source: RSCH-01 — pricing benchmarks from competitor analysis; conversion rate from SaaS industry data.*

---

## Section 2: Product Vision and Core Value

**Core value (from PROJECT.md):**

> A user walks out of any meeting with an accurate, trustworthy record and a ready-to-act set of artifacts — minutes, decisions, action items, dates — without having taken a single note.

Everything else — live summary board, break assist, citation-backed extraction — is a differentiator layered on top of this core. If only one thing works in v1, it must be the transcript → artifacts pipeline.

**Milestone framing:**

This document represents the completion of the **Discovery & PRD milestone**. Its deliverable is this authoritative product requirements document plus the three linked specification documents (FEATURE-SPEC.md, ARCHITECTURE.md, BUILD-ORDER.md). The next milestone — the **build milestone** — implements the product. The build milestone planner reads this PRD, derives phases from BUILD-ORDER.md, and creates implementation plans from ARCHITECTURE.md's module interfaces.

---

## Section 3: Foundational Decisions

All decisions in this section are locked from Phases 1–4. No new decisions are introduced here.

### 3.1 Consent & Recording Posture (DEC-01)

**Summary:** MeetingAssist is a disclosed, consent-first recorder. A per-meeting consent gate is a hard precondition to capture — the app does not start recording until the user has actively confirmed a disclosure checkbox. The disclosed-not-covert posture is unconditional: there is no setting or mode that enables silent recording. Hiding the overlay panel from the user's own screen-share is technically acceptable (it conceals the panel, not the fact of recording); concealing the fact of recording from meeting participants is never acceptable.

**Link:** [02-DEC-01-consent-recording-posture.md](../02-foundational-decisions-adrs/02-DEC-01-consent-recording-posture.md)

### 3.2 Data Handling & Privacy (DEC-02)

**Summary:** Local-first storage with full-database encryption (AES-256) and a macOS Keychain-backed encryption key. Raw audio is deleted immediately after transcription — only the text transcript is retained. Transcripts are stored indefinitely until the user explicitly deletes them. No cloud storage — meeting data does not leave the user's machine. An on-device offline mode (local transcription, no external services) is designed into the architecture for users who require zero cloud contact. All API keys are stored in the macOS Keychain via the system's secure storage API — never in plaintext configuration files.

**Link:** [02-DEC-02-data-handling-privacy.md](../02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md)

### 3.3 AI Faithfulness Contract (04-AI-SPEC)

**Summary:** Every extracted artifact — every action item, every decision, every date — is generated through a mandatory two-stage protocol. Stage 1 extracts verbatim quotes from the meeting transcript. Stage 2 generates artifact content constrained to those quotes only. All artifacts are proposals pending user confirmation; no artifact is ever automatically written to any external system (calendar, task manager, CRM). Users can reveal the exact transcript quote supporting any item via a "Verify" toggle.

**Link:** [04-AI-SPEC.md](../04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md)

### 3.4 Technology Stack Decisions

| Decision Area | Choice | Rationale |
|---------------|--------|-----------|
| System audio capture | `audiotee` (Core Audio Taps, macOS 14.2+) primary; native Chromium loopback flags fallback | RSCH-04 spike validated; pre-mixer audio quality; no persistent purple screen-recording indicator |
| Speech-to-text | Deepgram Nova-3 with diarization; `mip_opt_out=true` hardcoded | 61.5% meeting-domain accuracy improvement over Nova-2; built-in multi-speaker diarization |
| AI model | Gemini 2.5 Flash (paid tier only) via provider-agnostic adapter | 1-million-token context window fits full meetings; paid tier required — free tier allows training on submitted data (RSCH-03 critical warning) |
| Local data storage | SQLCipher AES-256 full-database encryption + macOS Keychain-backed key | DEC-02 requirement; replaces simpler storage for all sensitive meeting data |
| Schema validation | Zod schemas + zod-to-json-schema | Single Zod schema generates both OpenAI and Gemini structured output formats; locked as single source of truth |

### 3.5 Feature Scope Decisions

| Decision | Resolution | Detail |
|----------|------------|--------|
| D-01 to D-10 | 10 table-stakes features ship in v1 | [Full MVP boundary table](./05-FEATURE-SPEC.md) |
| D-11 to D-14 | 4 features deferred to v2+ | Live assistant chat UI, meeting templates, cross-meeting search UX, named speaker attribution |
| D-15 | Modular PRD structure | Hub document (this file) + 3 linked specification files |
| D-16 | Dual audience | Executive summary first (non-technical); technical sections for builders |
| D-17 | Module map + interface contracts | Named TypeScript interfaces for all 10 service modules | [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) |
| D-18 | Full-stack architecture scope | Backend services + Electron overlay + IPC surface + React component tree | [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) |
| D-19 | First shippable unit | Dual-channel audio capture + TranscriptStore (highest technical risk, gates all other features) | [05-BUILD-ORDER.md](./05-BUILD-ORDER.md) |
| D-20 | 6 build phases | Foundation → Capture → ArtifactPipeline → Overlay UI → ContextEngine + Break Assist → Packaging + Eval | [05-BUILD-ORDER.md](./05-BUILD-ORDER.md) |

---

## Section 4: Feature Scope Summary

**What ships in v1:** MeetingAssist v1 ships a complete, trust-worthy meeting record pipeline. When a user finishes a meeting, they have: a full transcript attributed to each speaker, a formal minutes of meeting document, a bullet-point summary, extracted action items with owners and due dates, and a set of key decisions — all backed by verbatim transcript citations. An always-on side panel shows a running 5-minute summary during the meeting. A break assist feature shows a digest of what was missed when the user steps away. All meeting data is encrypted and stored locally. Confirmed action items can be exported to any calendar via the universal `.ics` format.

**Key differentiators:** No bot visible to other participants. System audio captured pre-mixer via a device-level API — no persistent recording indicator, no post-mixer degradation. Faithfulness enforced through a two-stage citation protocol: every item is anchored to a verbatim quote. Encrypted local-first storage addresses the #1 adoption barrier in the category (46–50% of workers cite privacy as a top concern).

**What is not in v1:** The interactive live assistant chat interface (the ContextEngine architecture that powers break assist is built in v1; the chat UI ships as v2). Meeting-type-specific templates (one universal template in v1; templates need real usage data). Cross-meeting search (the database infrastructure is wired; the search UX ships as v2). Named speaker attribution — v1 uses Speaker 1/2/3 labels; name assignment is v2.

Full feature specification with the complete MVP boundary table: [05-FEATURE-SPEC.md](./05-FEATURE-SPEC.md)

---

## Section 5: Architecture Summary

**Service layer:** The core of MeetingAssist runs in the Electron main process: a `CaptureService` that manages dual-channel audio capture, a `STTAdapter` that routes both channels through real-time speech-to-text with speaker diarization, a `ContextEngine` that maintains a rolling meeting context for the live summary board, and an `ArtifactPipeline` that runs batch extraction at meeting end. A `SessionManager` finite state machine governs the entire meeting lifecycle, from the consent gate through capture, break handling, artifact processing, and session close. The consent gate is enforced at the FSM level in the main process — it cannot be bypassed from the UI layer.

**UI and communication layer:** The side-panel overlay is a React application rendered in the Electron renderer process. All communication between the main process and the overlay is typed and allowlisted — no direct access to Node.js from the renderer. The overlay shows: a consent gate before capture starts, a stacked summary board during the meeting, break assist controls, and an artifact review panel at meeting end where the user confirms, edits, or dismisses each proposal.

Full architecture specification with TypeScript interfaces, IPC contracts, database DDL, and component tree: [05-ARCHITECTURE.md](./05-ARCHITECTURE.md)

---

## Section 6: Build Order Summary

The build milestone implements MeetingAssist in 6 phases in a dependency-first order. Phase 1 establishes the application shell — the Electron overlay, the encrypted database, the typed communication surface, and the consent gate. Phase 2 implements dual-channel audio capture and transcript persistence, which is deliberately first because it is the highest technical risk: everything else in the system depends on a working transcript stream, and validating it early eliminates the largest uncertainty in the build milestone.

Phases 3 through 5 build the feature stack in dependency order — artifact extraction, then the live overlay and summary board, then the full context engine and break assist. Phase 6 packages and notarizes the app and runs the adversarial evaluation harness (faithfulness gates: CGFS ≥ 0.85, hallucination error rate ≤ 0.05) before v1 is declared shippable.

The non-obvious sequencing constraint: Phase 3 (end-of-meeting artifact extraction) is built before Phase 4 (live summary board). Both phases use the same pattern of calling an AI model, validating the output against a schema, and pushing the result to the overlay via a typed event. Building the batch pipeline first establishes and tests this pattern; Phase 4 then reuses it cleanly for the live summary cards.

Full build order with dependency rationale and per-phase acceptance criteria: [05-BUILD-ORDER.md](./05-BUILD-ORDER.md)

---

## Section 7: Milestone Completion Declaration

The Discovery & PRD milestone required the following deliverables. All are now complete:

- [x] **Phase 1: DNA Deep-Dive** — Selective-adoption catalogue, development baseline, and git/CI setup. Identified 5 reusable techniques from the Interview Helper DNA and documented leave-behind decisions.
- [x] **Phase 2: Foundational ADRs** — DEC-01 (consent and recording posture) and DEC-02 (data handling and privacy) are locked and cross-referenced throughout the PRD.
- [x] **Phase 3: Deep Research** — RSCH-01 through RSCH-06 complete: persona and monetization (RSCH-01), diarization approach (RSCH-02), vendor terms and DPA confirmation (RSCH-03), audio capture spike (RSCH-04), data model (RSCH-05), use cases and competitive analysis (RSCH-06).
- [x] **Phase 4: AI Grounding & Context Spec** — `04-AI-SPEC.md` complete: faithfulness contract, two-stage extraction protocol, ContextEngine two-speed architecture, adversarial eval harness with CGFS and EHR shipping gates.
- [x] **Phase 5: PRD Finalization** — All four PRD documents complete: `05-FEATURE-SPEC.md` (PRD-01), `05-ARCHITECTURE.md` (PRD-02), `05-BUILD-ORDER.md` (PRD-03), and this document, `05-PRD.md` (PRD-04).
- [ ] **Next: Build milestone** — Implement the product per this PRD. Start by reading `05-BUILD-ORDER.md` for the build phase sequence.

---

## Section 8: Document Navigation

| I want to… | Read… |
|------------|-------|
| Understand the product and market opportunity | Section 1 of this document (above) |
| Know what features ship in v1 vs. v2 | [05-FEATURE-SPEC.md](./05-FEATURE-SPEC.md) §2 (MVP Boundary Table) |
| Scaffold the codebase with correct module structure | [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) §3 (Directory Structure) |
| Implement the SessionManager FSM | [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) §5 |
| Implement the IPC layer | [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) §7 |
| Set up the database | [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) §8 |
| Understand the Electron overlay window setup | [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) §9 |
| Know the React component structure | [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) §10 |
| Find the Zod schema definitions | [05-ARCHITECTURE.md](./05-ARCHITECTURE.md) §11 |
| Plan the build milestone phases | [05-BUILD-ORDER.md](./05-BUILD-ORDER.md) |
| Understand why phases are sequenced the way they are | [05-BUILD-ORDER.md](./05-BUILD-ORDER.md) §5 (Dependency Chain) |
| Understand the faithfulness and grounding contract | [04-AI-SPEC.md](../04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md) |
| Check consent posture constraints | [02-DEC-01-consent-recording-posture.md](../02-foundational-decisions-adrs/02-DEC-01-consent-recording-posture.md) |
| Check data-handling constraints | [02-DEC-02-data-handling-privacy.md](../02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md) |
| Check vendor terms and DPA status | [03-RSCH-03-VENDOR-TERMS.md](../03-deep-research/03-RSCH-03-VENDOR-TERMS.md) |
