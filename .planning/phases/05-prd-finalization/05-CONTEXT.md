# Phase 5: PRD Finalization - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase synthesizes all prior decisions, research, and specs into the milestone deliverable: a consolidated, production-grade, modular PRD with an explicit MVP boundary and a recommended dependency-driven build order for the next (build) milestone.

Four required outputs (PRD-01 through PRD-04):
1. **PRD-01** — Feature spec with explicit MVP boundary (table stakes / differentiators / deferred v2+)
2. **PRD-02** — Production-grade modular architecture spec: `main/<domain>/` service layer, port/adapter contracts, core components + UI/IPC layer
3. **PRD-03** — Recommended dependency-driven build order / phasing for the next milestone (4–6 phases)
4. **PRD-04** — Single consolidated PRD document (modular: hub doc + linked files) readable by investors and technical builders

No new decisions are made in this phase — it assembles and synthesizes decisions already locked in Phases 1–4.

</domain>

<decisions>
## Implementation Decisions

### MVP Feature Boundary (PRD-01)

**Table-stakes v1 (must ship):**
- **D-01:** Persistent side-overlay UI — stays on during the meeting
- **D-02:** Full meeting transcription — saved as a complete transcript at meeting end
- **D-03:** Minutes of Meeting (MOM) generation
- **D-04:** Key points extraction
- **D-05:** Meeting summary generation
- **D-06:** Action items / dates / deadlines extraction with .ics export
- **D-07:** Break assist — manual "I'm back" trigger; shows interval summary cards missed + a dedicated "While you were away" digest (Phase 4 fully specified this)
- **D-08:** Live summary board — 5-minute interval cards stack during the meeting (the ContextEngine generates these as a side-effect of the passive path; near-zero extra cost)
- **D-09:** Consent gate — hard precondition to capture (DEC-01, Phase 2)
- **D-10:** Dual-channel audio capture (mic + system audio) — `electron-audio-loopback` as default, AudioTee.js as premium macOS 14.2+ path

**Deferred to v2+ (explicitly not in v1):**
- **D-11:** Live assistant — hotkey/keyword-triggered in-meeting Q&A chat is **v2**. The ContextEngine architecture is built in v1 (it powers break assist and the summary board), but the interactive chat UI is post-MVP.
- **D-12:** Meeting-type-specific artifact templates (standup, sales call, 1:1, design review) — **v2**. v1 ships one universal template. Template design benefits from real usage data.
- **D-13:** Cross-meeting search (sqlite-vec semantic search over past meetings) — **v2**. The sqlite-vec schema is designed (RSCH-05) and the DB is wired, but the search UX is post-launch.
- **D-14:** Named speaker attribution ("Alice" / "Bob") — **v2**. v1 ships Speaker 1/2/3 labels (Phase 3 decision D-10).

### PRD Document Structure (PRD-04)

- **D-15:** **Modular linked docs** — PRD.md is the hub document; separate files for FEATURE-SPEC.md, ARCHITECTURE.md, and BUILD-ORDER.md. Each file is self-contained and cross-linked. PRD.md is the entry point.
- **D-16:** **Dual audience** — PRD.md includes an **executive summary section** that is non-technical and positions the product (readable by investors and stakeholders). The technical spec sections follow for builders. Both audiences are served in the same document set.

### Architecture Spec Depth (PRD-02)

- **D-17:** **Module map + interface contracts** — name every service/module in `main/<domain>/`, define the TypeScript interface or IPC contract for each port/adapter boundary. Prescriptive enough that a contractor can scaffold the codebase without design decisions.
- **D-18:** **Full-stack scope** — the architecture spec includes both the backend service layer (TranscriptStore, SessionManager FSM, ContextEngine, ArtifactPipeline) AND the UI/IPC layer: overlay window setup (NSWindowSharingNone, LSUIElement), contextBridge IPC surface (channels + payload shapes), top-level React component tree.

### Build Order Strategy (PRD-03)

- **D-19:** **First shippable unit: Audio capture + TranscriptStore** — start with the highest technical risk (dual-channel audio capture working and persisting transcripts to SQLCipher). Everything else depends on capture working; validate the hard part first.
- **D-20:** **4–6 phases** for the build milestone. Fine-grained enough that each phase is completable in a focused session. The PRD should suggest a dependency-driven sequence, likely: Foundation/scaffold → Capture + TranscriptStore → ArtifactPipeline (batch) → Overlay UI + IPC → ContextEngine + summary board → Break Assist + packaging. Exact phase names and boundaries are for the build milestone planner to finalize.

### Claude's Discretion

- **ArtifactPipeline Zod schemas** — the exact structure of the Zod schemas for MOM, action items, key points, summary, and dates/events is left to the researcher/planner. Must be compatible with Gemini `responseSchema` / OpenAI `response_format` (strict structured outputs per CLAUDE.md).
- **SessionManager FSM states** — the exact state names and transitions (e.g., Idle → Capturing → Processing → Complete) are left to the architecture spec writer. Must accommodate the consent gate (DEC-01) as a hard transition precondition.
- **PRD executive summary length and tone** — the researcher/writer determines what level of detail suits the investor/stakeholder section. Product vision, core value, differentiators, monetization hypothesis (from RSCH-01) should be covered.
- **Build phase naming** — the 4–6 phase names for the build milestone are left to the build milestone planner. PRD-03 just documents the dependency constraints and recommended sequence.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 5: PRD Finalization" — phase goal, success criteria (4 items), PRD-01 through PRD-04 definitions
- `.planning/REQUIREMENTS.md` §"PRD Finalization (PRD)" — full PRD-01 through PRD-04 definitions with acceptance criteria
- `.planning/PROJECT.md` — product vision, core value, business context (persona/revenue model/success metric resolved by RSCH-01)

### Foundational decisions (locked — must be reflected in the PRD)
- `.planning/phases/02-foundational-decisions-adrs/02-CONTEXT.md` — DEC-01 (consent posture) and DEC-02 (data-handling/privacy) locked decisions
- `.planning/phases/02-foundational-decisions-adrs/` — ADR files for DEC-01 and DEC-02; PRD must summarize and cross-link both

### Research findings (feed into PRD feature spec + architecture)
- `.planning/phases/03-deep-research/03-RSCH-01-REPORT.md` — persona, positioning, monetization model (resolves PROJECT.md TBDs; feeds PRD executive summary)
- `.planning/phases/03-deep-research/03-RSCH-02-REPORT.md` — diarization approach (Speaker 1/2/3, up to 8 speakers, v1 cap rationale)
- `.planning/phases/03-deep-research/03-RSCH-03-VENDOR-TERMS.md` — Deepgram + LLM provider DPA/no-training confirmation (gates DEC-02 finalization)
- `.planning/phases/03-deep-research/03-RSCH-04-SPIKE-REPORT.md` — capture spike results; declared supported-OS floor; both capture paths validated
- `.planning/phases/03-deep-research/03-RSCH-05-DATA-MODEL.md` — cross-meeting memory data model (sqlite-vec schema; v2 feature but DB schema is v1 infrastructure)
- `.planning/phases/03-deep-research/03-RSCH-06-USE-CASES.md` — expanded feature discovery, meeting-type taxonomy, competitive gap analysis; feeds PRD-01 MVP boundary

### AI grounding & context spec (constrain ArtifactPipeline and ContextEngine specs)
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` — full faithfulness contract, ContextEngine two-speed architecture, adversarial eval harness; ARCHITECTURE.md must be compatible
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-CONTEXT.md` — Phase 4 decisions (D-01 through D-14): citation model, live summary board, epoch compression, break assist, on-demand path specs

### Stack decisions (constrain architecture spec)
- `.claude/CLAUDE.md` §"Recommended Stack" — full technology table; all architecture decisions must use this stack
- `.claude/CLAUDE.md` §"macOS System-Audio Capture (the hard part)" — two capture paths, macOS floors, entitlements
- `.claude/CLAUDE.md` §"LLM Layer" — Gemini 2.5 Flash default, Strict Structured Outputs + Zod, rolling context
- `.claude/CLAUDE.md` §"Local Persistence & Encryption" — SQLCipher (better-sqlite3-multiple-ciphers) + safeStorage
- `.claude/CLAUDE.md` §"Development & Packaging Tools" — electron-builder, @electron/notarize (notarytool), hardened runtime entitlements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- This is a **planning-only repo** — no product code exists yet. The PRD produced by this phase is the primary input to the next (build) milestone.

### Established Patterns
- Planning artifacts follow the `${padded_phase}-<DESCRIPTOR>.md` naming convention (e.g., `05-PRD.md`, `05-FEATURE-SPEC.md`, `05-ARCHITECTURE.md`, `05-BUILD-ORDER.md`).
- Zod schema definitions are the locked pattern for structured outputs (CLAUDE.md). The ArtifactPipeline schemas defined in the PRD must use Zod.
- Auto-push Stop hook commits + pushes every artifact as it is written.

### Integration Points
- **PRD-01 → FEATURE-SPEC.md** feeds directly into the build milestone's phase planning (PRD-03 build order determines phase sequence).
- **PRD-02 → ARCHITECTURE.md** defines the module structure and IPC contracts that the build milestone executor scaffolds.
- **PRD-03 → BUILD-ORDER.md** becomes the de facto roadmap for the build milestone — the build milestone planner reads this and creates phases from it.
- **04-AI-SPEC.md → ARCHITECTURE.md** — the ContextEngine and ArtifactPipeline interface contracts in ARCHITECTURE.md must extend (not contradict) the AI-SPEC.

</code_context>

<specifics>
## Specific Ideas

- **Modular PRD with hub doc:** PRD.md links out to FEATURE-SPEC.md, ARCHITECTURE.md, and BUILD-ORDER.md. The hub doc contains the executive summary + decisions index. Deep-dives live in the linked files.
- **Executive summary first:** The PRD.md opens with the investor/stakeholder-readable section — product positioning, core value, differentiators, monetization hypothesis — before any technical content.
- **Build order starts with capture:** First build milestone phase = dual-channel audio capture + TranscriptStore. Rationale is explicit in BUILD-ORDER.md: it's the highest technical risk and gates everything else.
- **4–6 build phases:** Suggested sequence hint: Foundation/scaffold → Capture + TranscriptStore → ArtifactPipeline → Overlay UI + IPC → ContextEngine + summary board → Break Assist + packaging. Exact names/boundaries for the build milestone planner.
- **Architecture is full-stack:** ARCHITECTURE.md covers both service layer AND the Electron overlay window + contextBridge IPC surface + top-level React component tree.

</specifics>

<deferred>
## Deferred Ideas

- **Live assistant (in-meeting Q&A chat)** — v2. ContextEngine is built in v1 (break assist depends on it), but the interactive chat UI ships after the core pipeline is validated.
- **Meeting-type-specific templates** (standup, sales call, 1:1, design review) — v2. One universal template in v1; template variety needs real usage data to design well.
- **Cross-meeting search UX** (sqlite-vec semantic Q&A over past meetings) — v2. DB schema is v1 infrastructure; the search feature is post-launch.
- **Named speaker attribution** ("Alice" / "Bob") — v2 per Phase 3 decision. v1 ships Speaker 1/2/3 labels; name confirmation UX ships after MVP validation.
- **Integrations beyond .ics** (Slack, Notion, CRM) — surfaced by RSCH-06 as competitive table-stakes for some tools. Deferred post-launch; PRD may note as v2 roadmap items.
- **On-device / privacy mode full spec** — whisper.cpp + local Ollama path exists in CLAUDE.md but full specification deferred to build milestone when it's actually implemented.

</deferred>

---

*Phase: 5-PRD Finalization*
*Context gathered: 2026-06-26*
