# Phase 4: AI Grounding & Context Spec (AI-SPEC) - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase produces the AI design contract that must exist before any artifact extraction or meeting processing is implemented. Three deliverables:

1. **GRND-01** — Faithfulness/grounding contract: how extracted artifacts are anchored to the transcript (citation model, low-confidence handling, "proposed-with-confirm" UX)
2. **GRND-02** — ContextEngine + two-speed processing architecture spec: the passive pipeline (transcript accumulation, live summary board, epoch compression) and the on-demand pipeline (live assistant, break assist)
3. **GRND-03** — Adversarial evaluation harness and faithfulness metric: how grounding will be tested before shipping

No product code is written in this phase. The output is a spec (AI-SPEC.md) consumed by Phase 5 PRD finalization.

</domain>

<decisions>
## Implementation Decisions

### Citation Format & Grounding (GRND-01)

- **D-01:** Citation anchor model: **hybrid** — short inline quote (~first 10 words of the supporting transcript passage) with a "Verify" expand-to-context link that jumps to the full transcript segment in the transcript viewer.
- **D-02:** Citations are **hidden by default** behind a "Verify" toggle (default off). Artifacts render cleanly; the trust signal is available on demand. No citation clutter on first read.
- **D-03:** Low-confidence extractions (no direct verbatim quote exists — e.g., an implicit agreement or inferred deadline): **surface with a low-confidence flag** ("Inferred — no direct quote") and lower visual weight. The item is shown but uncertainty is explicit. Do not silently suppress inferred items.
- **D-04:** "Proposed-with-confirm" UX: all extracted artifacts (action items, dates, decisions) are presented as proposals. User confirms before any calendar write or export. Nothing is auto-committed.

### Live Summary Board (GRND-02 — display layer)

- **D-05:** The overlay shows a **live summary board** during the meeting — a stacked card feed where each card covers a fixed time interval of the meeting, labeled with its time range (e.g., "10:00–10:05").
- **D-06:** Each card summarizes **only that interval's transcript** (not cumulative). Cards stack downward as the meeting progresses. A new card begins generating as the previous interval closes.
- **D-07:** Summary interval: **5 minutes** (default). This is the product decision for v1; configurability (3/5/10 min) is a future settings knob, not a v1 requirement.
- **D-08:** Summary cards are **persisted in the SQLCipher DB** as part of the meeting record. They feed the Break Assist feature directly (user sees the cards they missed) and are included as additional structured context for the Live Assistant.
- **D-09:** The live summary board is **architecturally separate from the ContextEngine epoch system**. Summary cards are time-triggered display artifacts; context epochs are token-threshold-triggered context management. They serve different purposes and must not be conflated.

### ContextEngine & Two-Speed Processing Architecture (GRND-02 — context layer)

- **D-10:** **Passive path (always on, no LLM during the meeting):**
  - Deepgram Nova-3 dual-channel transcription streams fragments into the TranscriptStore (SQLCipher DB) in real time
  - ContextEngine maintains an in-memory **rolling window** — a token-counted view of the full transcript (ceiling: ~800K tokens, leaving headroom in the 1M-token LLM context)
  - Every 5 minutes: one LLM call generates the next summary card (small chunk, cheap — Gemini 2.5 Flash)
  - Rolling window token monitor runs passively; for meetings ≤ ~40 hours it never overflows

- **D-11:** **Context epoch system (overflow path — fires for pathological meeting lengths only):**
  - Token math: a 2-hour meeting ≈ 24,000 tokens — roughly 2.4% of the 1M-token ceiling. Epochs will not fire for any realistic meeting.
  - When the rolling window DOES approach the ceiling (40h+ of dense speech): the oldest transcript chunk is summarized into a structured epoch summary and evicted. The epoch summary is embedded and indexed into sqlite-vec in the same SQLCipher DB.
  - Epoch summary content: decisions + action items + key points + speaker attribution (full structured summary, not a narrative paragraph).
  - For meetings where epochs exist, the Live Assistant retrieves the top-N relevant epoch summaries via sqlite-vec semantic search and appends them to the rolling window context.
  - **The summary board cards are NOT used as context epochs.** They are display artifacts only; the epoch system compresses raw transcript, not the display cards.

- **D-12:** **On-demand path (live assistant — fires only on user trigger):**
  - Activated by hotkey or wake word — no passive LLM loop between triggers
  - Context composition: **rolling window (full raw transcript) + the 5-min summary cards generated so far**. For normal meetings this is the entire transcript + the structured card history; for overflow meetings this is rolling window + top-N epoch summaries via RAG.
  - Response streamed in the chat panel. Chat history accumulates and is included in subsequent assistant calls within the same session.

- **D-13:** **Break Assist (on-demand — fires on explicit user trigger):**
  - Activation: **manual** — user presses an "I'm back" button or hotkey. No automatic detection (avoids false positives from muting or background noise).
  - On activation: the app knows the exact timestamp the user left (recorded when they triggered "going on break") and when they returned.
  - Output: **both** — (a) the 5-min summary cards generated during the break (zero extra LLM cost — already exist), and (b) a single dedicated "While you were away" digest generated at return time covering the exact break window. The digest sits above the interval cards as a TL;DR.

- **D-14:** **End-of-meeting batch (fires when user ends the meeting):**
  - Input: full transcript from TranscriptStore + all 5-min summary cards as structured context
  - One or more structured LLM calls (Zod-validated JSON, strict Structured Outputs via Gemini responseSchema / OpenAI response_format)
  - Outputs: MOM, key points, meeting summary, action items with owners and deadlines, dates/events
  - All outputs include citation anchors (D-01 through D-03); all are presented as proposals (D-04)

### Claude's Discretion

- **GRND-03 eval harness design:** The spec should define the adversarial transcript evaluation harness and faithfulness metric — corpus composition (synthetic adversarial transcripts vs. real samples), the specific metric (RAGAS-style faithfulness score, precision/recall, or human eval threshold), and the passing bar. These details were not discussed and are left to the researcher's judgment, informed by the faithfulness contract decisions above.
- **5-min summary card content:** The exact structure of each summary card (narrative paragraph vs. structured key-point bullets vs. hybrid) is left to the researcher/planner. It should be consistent with the end-of-meeting artifact format to avoid a jarring transition at meeting end.
- **Token ceiling value:** The exact rolling window ceiling (~800K of 1M) is a conservative default. The researcher can refine based on provider-specific context window limits and the chosen default model.
- **Embedding model for epoch RAG:** Not specified — researcher selects (OpenAI text-embedding-3-small is a reasonable default; local Ollama model for privacy mode).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 4: AI Grounding & Context Spec (AI-SPEC)" — phase goal, success criteria (3 items), GRND-01 through GRND-03 requirements
- `.planning/REQUIREMENTS.md` §"AI Grounding & Context Spec (GRND)" — full GRND-01, GRND-02, GRND-03 definitions with acceptance criteria

### Foundational decisions (locked — constrain this phase)
- `.planning/phases/02-foundational-decisions-adrs/02-CONTEXT.md` — DEC-01 (consent posture) and DEC-02 (data-handling/privacy) locked decisions; all specs must be compatible
- `.planning/phases/02-foundational-decisions-adrs/` — DEC-01 and DEC-02 ADR files; faithfulness spec and eval harness must respect local-first, SQLCipher, and no-training stances

### Research findings (inform this phase)
- `.planning/phases/03-deep-research/03-RSCH-04-SPIKE-REPORT.md` — capture spike results; both capture paths validated; findings affect the real-time audio pipeline the ContextEngine sits on top of
- `.planning/phases/03-deep-research/03-RSCH-05-DATA-MODEL.md` — cross-meeting memory data model (sqlite-vec schema, chunk granularity, embedding strategy); ContextEngine epoch RAG must be compatible
- `.planning/phases/03-deep-research/03-RSCH-06-USE-CASES.md` — expanded use-case and feature discovery; the live summary board and break assist are first-class use cases confirmed here
- `.planning/phases/03-deep-research/03-RSCH-02-REPORT.md` — diarization approach (Speaker 1/2/3 labels for v1, up to 8 speakers); citation model must accommodate speaker attribution per extracted item

### Stack decisions (constrain implementation spec)
- `.claude/CLAUDE.md` §"LLM Layer (MOM / summary / action items / in-meeting chat)" — Gemini 2.5 Flash as default artifact model, Strict Structured Outputs (Zod + OpenAI response_format / Gemini responseSchema), rolling context approach
- `.claude/CLAUDE.md` §"Local Persistence & Encryption" — SQLCipher (better-sqlite3-multiple-ciphers) + safeStorage; all DB writes in this spec must be compatible
- `.claude/CLAUDE.md` §"Meeting Memory / Context Store" — sqlite-vec as the local vector search extension; epoch RAG uses this

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- This is a **planning-only repo** — no product code exists yet. The AI-SPEC produced by this phase is consumed by Phase 5 PRD finalization, not by existing product code.

### Established Patterns
- Planning artifacts follow the `${padded_phase}-<DESCRIPTOR>.md` naming convention (e.g., `04-AI-SPEC.md`, `04-GRND-01-FAITHFULNESS-CONTRACT.md`).
- Structured outputs use Zod schema definitions shared across providers (locked in CLAUDE.md). Any extraction schema defined in this phase's spec should be expressed as a Zod schema.
- Auto-push Stop hook commits + pushes every artifact as it is written.

### Integration Points
- **GRND-01 → ArtifactPipeline** (Phase 5): the faithfulness contract defines the extraction schema and citation model that the ArtifactPipeline must implement.
- **GRND-02 → ContextEngine + SessionManager FSM** (Phase 5): the two-speed architecture spec defines the components and state machine that Phase 5 architects in the modular PRD.
- **GRND-03 → Evaluation harness** (Phase 5 + build milestone): the eval spec feeds into the build milestone's testing strategy.

</code_context>

<specifics>
## Specific Ideas

- The live summary board's card-per-interval design was explicitly requested: each card covers only its own interval (not cumulative), labeled with its time range (e.g., "10:00–10:05"), stacking downward as the meeting progresses.
- The summary board and the ContextEngine epoch system are intentionally decoupled — the user specifically called this out. Summary cards are display-layer artifacts; epoch compression is a context-management safety net for pathological meeting lengths (~40h+). Don't merge them.
- Break Assist output is both the interval cards missed AND a dedicated "While you were away" digest — the digest is the TL;DR at the top, cards provide detail below.
- The live assistant draws on both the raw rolling window AND the summary cards as context — not just one or the other.
- Citations default to hidden (Verify toggle) for a clean artifact UX, but the trust signal must always be reachable in one click.

</specifics>

<deferred>
## Deferred Ideas

- **Configurable summary interval** (3/5/10 min user setting) — the 5-minute default is fixed for v1. A settings knob is a natural v2 quality-of-life addition.
- **Named speaker attribution in citations** ("Alice said…" vs. "Speaker 1 said…") — deferred to v2 per Phase 3 decision D-10. v1 citations use Speaker 1/2/3 labels.
- **Automatic break detection** (mic silence → auto break assist) — deferred; manual trigger is v1. Auto-detection is a v2 enhancement once the manual flow is validated.
- **Faithfulness eval corpus (real recordings)** — synthetic adversarial transcripts are the v1 eval baseline. Real recorded samples with known ground truth are a richer eval signal for post-launch iteration.

</deferred>

---

*Phase: 4-AI Grounding & Context Spec (AI-SPEC)*
*Context gathered: 2026-06-26*
