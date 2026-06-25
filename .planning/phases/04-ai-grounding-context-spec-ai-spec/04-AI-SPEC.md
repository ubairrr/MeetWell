---
phase: 04
slug: ai-grounding-context-spec-ai-spec
version: 1.0
status: draft
produced_by: Phase 4 planning
consumed_by: Phase 5 PRD Finalization
requirements_covered: GRND-01, GRND-02, GRND-03
created: 2026-06-26
---

# MeetingAssist AI Grounding & Context Spec (AI-SPEC)

## Executive Summary

This document is the authoritative design contract for how MeetingAssist extracts, grounds, and manages meeting artifacts. It solves the #1 trust-killer in AI meeting tools: fabricated artifacts — action items assigned to people who made no such commitment, deadlines invented from thin air, decisions that were never reached. A single hallucinated action item can undermine every meeting afterward. The spec defines exactly how MeetingAssist prevents this.

Two complementary systems form the trust foundation:

1. **Faithfulness/Grounding Contract (GRND-01):** Every extracted artifact — every action item, every decision, every date — must be traceable to a verbatim transcript passage. No artifact may be generated from the model's parametric memory. Extraction always produces proposals; users confirm before anything is written to external systems.

2. **ContextEngine + Two-Speed Architecture (GRND-02):** The processing pipeline that accumulates the transcript, generates live summary cards, manages context for long meetings via epoch compression, and drives the on-demand Live Assistant and end-of-meeting batch extraction.

This spec is the authority for the ArtifactPipeline and ContextEngine components in Phase 5 PRD finalization. Section 3 defines the adversarial evaluation harness that proves the faithfulness contract holds in production (completed in Plan 02).

## How to Use This Document

| Section | Content | Downstream Consumer |
|---------|---------|---------------------|
| Section 1: Faithfulness Contract | Quote-backed extraction protocol, all Zod schemas, proposed-with-confirm UX, conservative date handling, pitfalls, D-01 through D-04 decisions | Phase 5 ArtifactPipeline spec |
| Section 2: ContextEngine Architecture | Component map, rolling window token budget, epoch compression, Speed 1 passive path, Speed 2 live assistant, Speed 2B end-of-meeting batch, Break Assist digest, D-05 through D-14 decisions | Phase 5 ContextEngine + SessionManager FSM spec |
| Section 3: Adversarial Eval Harness | Faithfulness metric (CGFS, EHR), adversarial corpus design, harness architecture, passing bar | Build milestone testing strategy |

---

## Section 1: Faithfulness/Grounding Contract (GRND-01)

### 1.1 What "Faithfulness" Means for MeetingAssist

A MeetingAssist artifact is faithful if and only if every factual claim in the artifact — every action item, every decision, every date, every assignee, every commitment — can be traced to a verbatim passage in the meeting transcript. Faithfulness failure occurs in two categories:

**Extrinsic hallucination:** The model invents an action item, decision, or date that was never discussed. A participant is assigned a task they never agreed to. A deadline is fabricated. This is the most damaging failure mode — the user acts on false information.

**Intrinsic hallucination:** A real discussion is misrepresented — the wrong speaker is assigned an action item, a date is mangled ("next Tuesday" becomes "next Monday"), a decision is inverted, a condition is dropped ("if we get sign-off" is stated as an unconditional commitment). This is subtler and harder to detect, but equally damaging.

Both categories damage user trust and are the primary reason users reject AI-generated meeting artifacts. The faithfulness contract is the response to both.

Governing decisions: D-01 (citation anchor model), D-02 (citations hidden by default), D-03 (inferred items surfaced with low-confidence flag), D-04 (proposed-with-confirm UX).

### 1.2 Quote-Backed Extraction Protocol (per D-01)

Every extracted artifact item is generated through a mandatory two-stage process. The stages are sequenced: Stage 1 must complete before Stage 2 begins. **The generation prompt receives ONLY the extracted quotes from Stage 1, not the full transcript.**

**Stage 1 — Evidence Extraction (anchor-first):**

Before generating any artifact content, the model is instructed to identify and extract the exact transcript passage(s) that support the claim. The extraction prompt requires the model to output:

- `quote`: verbatim transcript text — exact words from the transcript, not paraphrased or polished
- `speaker`: speaker label from that passage ("You", "Speaker 1", "Speaker 2", etc.)
- `timestamp_start` / `timestamp_end`: seconds from meeting start for the supporting passage

Stage 1 output is a list of `CitationAnchor` objects. These anchors are the only input to Stage 2.

**Stage 2 — Constrained Generation (citation-anchored):**

The artifact content (action item description, decision text, date) is generated ONLY from the anchored quotes produced in Stage 1. The Stage 2 prompt explicitly prohibits using any information not present in the provided quotes. The model does not see the full transcript in Stage 2 — only the quotes it explicitly extracted.

This two-stage approach prevents the model from generating plausible-but-ungrounded claims because the generation step only has access to the quotes it explicitly identified, not its parametric memory.

**Implementation recommendation (Open Question from RESEARCH.md):** Specify as two separate LLM calls in v1. This provides clean separation of concerns — if Stage 2 produces a suspicious claim, Stage 1 output is independently auditable. Collapse to single chain-of-thought call only if latency is a measured problem in the build milestone.

### 1.3 Citation Anchor Schema (per D-01, D-02)

The `CitationAnchorSchema` is the atomic unit of grounding. Every extracted artifact must carry at least one citation anchor.

```typescript
import { z } from 'zod';

// Source: Locked decision D-01 (04-CONTEXT.md)
const CitationAnchorSchema = z.object({
  quote_preview: z.string().describe("First 10 words of the verbatim transcript passage"),
  quote_full: z.string().describe("Complete verbatim quote from transcript"),
  speaker_label: z.string().describe("Speaker label: 'You', 'Speaker 1', 'Speaker 2', etc."),
  timestamp_start: z.number().describe("Seconds from meeting start"),
  timestamp_end: z.number().describe("Seconds from meeting start"),
  confidence: z.enum(['direct', 'inferred']).describe(
    "'direct' = verbatim quote exists; 'inferred' = no direct quote, inferred from context"
  ),
});
```

**Confidence levels (per D-03):**

- `'direct'`: A verbatim quote exists in the transcript that directly states the claim. Display: normal visual weight. UI renders a "Verify" toggle (default collapsed per D-02) — one click shows the inline `quote_preview` and an expand link to the full transcript segment.

- `'inferred'`: No verbatim quote exists — the artifact was inferred from context (e.g., an implicit agreement, a deadline inferred from "by end of quarter"). Display: reduced visual weight + "Inferred — no direct quote" badge. The item is always shown — do not suppress inferred items (D-03). The uncertainty is explicit.

**D-03 contract (non-negotiable):** Items with `confidence: 'inferred'` are NEVER silently suppressed. Hiding uncertainty is more dangerous than surfacing it. The reduced visual weight communicates uncertainty; the item's presence preserves completeness.

**D-02 contract:** Citation details (quote text, timestamp) are hidden by default behind the "Verify" toggle. The artifact UI renders cleanly on first view; the trust mechanism is one click away, always reachable.

### 1.4 Conservative Date Handling

Dates extracted from meeting transcripts carry high hallucination risk:

- Relative dates ("next Tuesday", "by end of month", "in two weeks") require accurate resolution against the meeting date
- LLMs frequently confuse "relative to the meeting date" with "relative to today" or "relative to training cutoff"
- Participants speak ambiguously ("let's do this soon" — no concrete date exists)

**The four conservative date handling rules:**

1. **ISO 8601 only in structured output.** The `due_date` field is always a date string in ISO 8601 format (e.g., `"2026-07-15"`) or `null`. Relative expressions are resolved at extraction time using the meeting's `started_at` timestamp. No relative strings in `due_date`.

2. **Unresolvable relative dates → `null`.** If a deadline cannot be resolved to a specific calendar date ("soon", "eventually", "when we get a chance"), the `due_date` field is set to `null`. The raw expression is preserved in `raw_deadline_text`. The user resolves the ambiguity during the confirm step.

3. **Inferred deadlines → `confidence: 'inferred'`.** If a deadline is implied rather than stated (e.g., "we need this before the launch"), the citation anchor carries `confidence: 'inferred'` so the UI displays the "Inferred — no direct quote" badge.

4. **Meeting date injection in every extraction prompt.** Every extraction prompt includes the meeting's `started_at` date in ISO 8601 format. Prompt instruction: "Resolve all relative dates relative to the meeting date provided in `meeting_date`, not today's date and not your training cutoff date."

> **WARNING — Pitfall 5: Implicit Date Resolution Bug**
>
> **What goes wrong:** The extraction prompt receives "by next Friday" and the model resolves it relative to its training cutoff (August 2025) or relative to the deployment date, not the meeting date.
>
> **Why it happens:** The model's concept of "now" is ambiguous in extraction prompts without explicit meeting date injection.
>
> **How to avoid:** Always inject `meeting_date: "2026-06-26"` (ISO 8601 `started_at`) in the system context. Include explicit instruction: "Resolve all relative dates relative to `meeting_date`, not today's date."
>
> **Warning signs:** Due dates in the past when the meeting discussed near-term commitments; far-future due dates for "next week" commitments.

### 1.5 Proposed-with-Confirm UX Contract (per D-04)

All extracted artifacts are proposals. This contract is absolute — no exception exists in v1.

**Contract rules:**

- **Nothing auto-writes to calendar or any external system.** The extraction pipeline NEVER triggers any external write without a user confirmation event. This is enforced at the architecture level, not just the UI level.

- **Every artifact starts in `status: 'proposed'`.** The `status: z.literal('proposed')` constraint in the Zod schema ensures the model output always produces proposals. Status can only be promoted to `'confirmed'` via a user action — not by the pipeline.

- **The UI renders proposals in a distinct visual state.** Proposed artifacts carry a visual indicator (dotted border, "Pending your review" label, or equivalent) that distinguishes them from confirmed items.

- **User actions are exactly three: Confirm, Edit-then-Confirm, or Dismiss.**
  - Confirm: accepts the proposal as-is, transitions to `status: 'confirmed'`
  - Edit-then-Confirm: user edits the description, due date, or assignee, then confirms
  - Dismiss: removes the proposal from the current session (soft delete — recoverable from meeting record)

- **Calendar export / `.ics` generation is only available for `status: 'confirmed'` items.** The export function checks status before processing and silently skips or errors on `'proposed'` items.

- **The extraction pipeline has no write path to any external system.** Write paths to calendar (Google Calendar, Outlook, `.ics`) are gated behind the confirm event. The pipeline only writes to the local SQLCipher DB.

### 1.6 Canonical Extraction Schemas

The following Zod schemas are the single source of truth for all artifact extraction in MeetingAssist. They are defined once and translated to provider-specific formats at runtime (see §1.8).

```typescript
import { z } from 'zod';

// ── Citation anchor (repeated from §1.3 for completeness) ──────────────
const CitationAnchorSchema = z.object({
  quote_preview: z.string().describe("First 10 words of the verbatim transcript passage"),
  quote_full: z.string().describe("Complete verbatim quote from transcript"),
  speaker_label: z.string().describe("Speaker label: 'You', 'Speaker 1', etc."),
  timestamp_start: z.number().describe("Seconds from meeting start"),
  timestamp_end: z.number().describe("Seconds from meeting start"),
  confidence: z.enum(['direct', 'inferred']).describe(
    "'direct' = verbatim quote exists; 'inferred' = no direct quote, inferred from context"
  ),
});

// ── Action item ────────────────────────────────────────────────────────
const ActionItemSchema = z.object({
  id: z.string().uuid(),
  description: z.string().describe("What must be done — derived ONLY from anchored quotes"),
  assignee_label: z.string().nullable().describe("Speaker label of assignee, or null if unattributed"),
  due_date: z.string().nullable().describe("ISO 8601 date string, or null if unresolvable"),
  raw_deadline_text: z.string().nullable().describe("Raw expression if due_date is null"),
  status: z.literal('proposed'),
  citations: z.array(CitationAnchorSchema).min(1),
});

// ── Decision ───────────────────────────────────────────────────────────
const DecisionSchema = z.object({
  id: z.string().uuid(),
  description: z.string().describe("The decision made — derived ONLY from anchored quotes"),
  decision_maker_label: z.string().nullable(),
  status: z.literal('proposed'),
  citations: z.array(CitationAnchorSchema).min(1),
});

// ── Extracted date / event ─────────────────────────────────────────────
const ExtractedDateSchema = z.object({
  id: z.string().uuid(),
  description: z.string().describe("What the date is for"),
  date: z.string().nullable().describe("ISO 8601 date, or null if unresolvable"),
  raw_date_text: z.string().describe("Raw expression from transcript"),
  status: z.literal('proposed'),
  citations: z.array(CitationAnchorSchema).min(1),
});

// ── Key point ─────────────────────────────────────────────────────────
const KeyPointSchema = z.object({
  text: z.string().describe("A single key point — must be grounded in transcript"),
  speaker_label: z.string().nullable(),
  citations: z.array(CitationAnchorSchema).min(1),
});

// ── Full meeting artifacts (end-of-meeting batch output) ───────────────
const MeetingArtifactsSchema = z.object({
  meeting_id: z.string().uuid(),
  summary: z.string().describe("2-3 sentence meeting summary"),
  key_points: z.array(KeyPointSchema),
  action_items: z.array(ActionItemSchema),
  decisions: z.array(DecisionSchema),
  dates: z.array(ExtractedDateSchema),
  minutes_of_meeting: z.string().describe("Full MOM in markdown format"),
  model_used: z.string().describe("Model identifier used for extraction"),
  extraction_timestamp: z.string().describe("ISO 8601 timestamp of extraction"),
});

export type MeetingArtifacts = z.infer<typeof MeetingArtifactsSchema>;
```

**Key contract rules enforced by these schemas:**

- `citations: z.array(CitationAnchorSchema).min(1)` — every extracted item MUST have at least one citation. The `.min(1)` constraint enforces this at schema validation time; the model cannot output an uncited item without a schema validation failure.
- `status: z.literal('proposed')` — extraction always produces proposals. Status can only change via user action, not model output. The literal type prevents the model from producing any other status.
- `due_date: z.string().nullable()` — forces null for unresolvable dates rather than fabricated ones. The model must choose either a valid ISO 8601 date or null.
- `raw_deadline_text: z.string().nullable()` — preserves the original expression for ambiguous dates so the user can resolve during the confirm step.
- `assignee_label: z.string().nullable()` — forces explicit null when assignee is unclear, rather than guessing.

**5-Minute Summary Card Schema:**

```typescript
// Source: Designed per locked decisions D-05 through D-09
const SummaryCardSchema = z.object({
  meeting_id: z.string().uuid(),
  card_index: z.number().int().nonnegative().describe("Sequential card number, 0-indexed"),
  interval_start_seconds: z.number().describe("Seconds from meeting start"),
  interval_end_seconds: z.number().describe("Seconds from meeting start"),
  wall_time_label: z.string().describe("Human label, e.g., '10:00–10:05'"),

  // Structured content — feeds Break Assist and Live Assistant context
  topic_headline: z.string().describe("One-line topic/theme of this interval"),
  key_points: z.array(z.string()).describe("3-5 bullet key points from this interval only"),
  action_items_mentioned: z.array(z.string()).describe(
    "Tentative action items mentioned (not yet citations-validated — flagged for end-of-meeting extraction)"
  ),
  speaker_contributions: z.record(z.string(), z.string()).describe(
    "speaker_label → brief summary of their contribution this interval"
  ),

  // Metadata
  generated_at: z.string().describe("ISO 8601 timestamp"),
  model_used: z.string(),
});
```

**Key contract rules for SummaryCardSchema:**

- `interval_start_seconds` / `interval_end_seconds` — each card covers only its interval (D-06 contract).
- `wall_time_label` — the human-readable label ("10:00–10:05") displayed in the overlay (D-05 contract).
- `key_points` covers only the current interval's transcript, not cumulative (D-06 enforced at generation time via prompt).
- `action_items_mentioned` are tentative, not citation-validated — they pre-seed the end-of-meeting extraction but do not bypass the faithfulness contract.
- `speaker_contributions` enables per-speaker Break Assist context without named attribution (v1 uses "Speaker 1/2/3" labels per deferred decision).

**Content structure rationale (Claude's Discretion area):** The hybrid format (topic headline + key-point bullets + speaker contributions) is chosen over a pure narrative paragraph because: (a) bullets are faster to scan for the Break Assist use case, (b) `action_items_mentioned` pre-seeds the end-of-meeting extraction, and (c) `speaker_contributions` is compatible with the citation model's speaker attribution requirement. This format is consistent with the end-of-meeting MOM structure — a standup-style card that looks like a section of the MOM.

### 1.7 Common Pitfalls (Faithfulness)

> **WARNING — Pitfall 1: Generating Artifact Content Before Extracting Quotes**
>
> **What goes wrong:** The model is prompted to "summarize action items with citations." It generates the action item description first (using parametric memory), then attaches a plausible-looking but fabricated quote. The quote may look real but does not appear verbatim in the transcript.
>
> **Why it happens:** Standard summarization prompts generate content freely, then justify after the fact. When Stage 1 and Stage 2 are in the same prompt without explicit stage separation, models default to this justify-after pattern.
>
> **How to avoid:** Two-stage extraction protocol — the evidence extraction stage MUST run before the content generation stage. The Stage 2 generation prompt receives ONLY the extracted quotes, not the full transcript. Stage separation must be enforced in code, not just in the prompt.
>
> **Warning signs:** `quote_full` fields that are paraphrases rather than verbatim text; quotes longer than the cited transcript passage; quotes that are grammatically polished versions of messy real speech; quotes containing words not present in the corresponding transcript segment.

> **WARNING — Pitfall 5: Implicit Date Resolution Bug**
>
> (See §1.4 above — reproduced here for pitfall collection completeness.)
>
> **What goes wrong:** "by next Friday" resolves to a date relative to the model's training cutoff or today's date, not the meeting date.
>
> **Why it happens:** Ambiguous "now" in extraction prompts.
>
> **How to avoid:** Every extraction prompt MUST inject `meeting_date` in ISO 8601 format. Include explicit instruction: "Resolve all relative dates relative to `meeting_date`, not today's date."
>
> **Warning signs:** Due dates in the past when the meeting discussed near-term commitments.

### 1.8 Provider-Agnostic Schema Delivery

MeetingAssist uses the OpenAI SDK `baseURL` adapter pattern (locked in CLAUDE.md), which means the same schema must work with OpenAI's Structured Outputs and Gemini's `responseJsonSchema`. The solution is one Zod schema as the single source of truth, translated to provider-specific format at runtime.

**The one-schema-two-providers pattern:**

```typescript
import zodToJsonSchema from 'zod-to-json-schema';
import { MeetingArtifactsSchema } from './schemas';

// ── OpenAI Structured Outputs ──────────────────────────────────────────
const openaiRequestConfig = {
  response_format: {
    type: 'json_schema' as const,
    json_schema: {
      strict: true,
      name: 'MeetingArtifacts',
      schema: zodToJsonSchema(MeetingArtifactsSchema),
    },
  },
};

// ── Gemini responseJsonSchema ──────────────────────────────────────────
const geminiRequestConfig = {
  generationConfig: {
    responseJsonSchema: zodToJsonSchema(MeetingArtifactsSchema),
    responseMimeType: 'application/json',
  },
};
```

**Contract:** Both paths use `zodToJsonSchema(MeetingArtifactsSchema)`. The schema definition lives once, in the Zod declaration. Provider-specific configuration is derived at call time, never hand-authored separately.

> **WARNING — Pitfall 6: Provider-Specific Schema Drift**
>
> **What goes wrong:** The Zod schema is updated (a new field added to `ActionItemSchema`), but the Gemini `responseJsonSchema` is updated separately and manually. They drift apart. Gemini returns different fields than OpenAI.
>
> **Why it happens:** Two code paths maintain the same logical schema independently.
>
> **How to avoid:** Single source of truth — the Zod schema. Both OpenAI and Gemini paths use `zodToJsonSchema(ActionItemSchema)`. Schema-to-provider conversion happens at runtime.
>
> **Warning signs:** TypeScript type errors on Gemini responses; fields present in OpenAI responses missing from Gemini responses.

**Why `strict: true` matters for OpenAI path:** Without `strict: true`, OpenAI's JSON mode guarantees valid JSON but does NOT guarantee schema adherence — keys may be missing, enums may be violated. With `strict: true`, the model is constrained to only produce output matching the schema. This is the difference between "probably right" and "guaranteed right."

**Gemini constraint note:** Gemini 2.5 Flash's `responseJsonSchema` now supports full JSON Schema (not just a subset). Using `zodToJsonSchema` output is safe. If using an older Gemini model that only supports a simplified schema subset, verify compatibility before deploying.

### Decision Coverage (GRND-01)

| Decision | Description | Implementing Subsection |
|----------|-------------|------------------------|
| D-01 | Citation anchor model: hybrid inline quote + "Verify" expand-to-context link | §1.3 CitationAnchorSchema, §1.2 Quote-Backed Extraction Protocol |
| D-02 | Citations hidden by default behind "Verify" toggle; no citation clutter on first read | §1.3 Confidence levels — `'direct'` display spec |
| D-03 | Low-confidence extractions surfaced with "Inferred — no direct quote" flag; never suppress | §1.3 Confidence levels — `'inferred'` display spec, D-03 contract |
| D-04 | Proposed-with-confirm UX: nothing auto-commits; all artifacts start as proposals | §1.5 Proposed-with-Confirm UX Contract, §1.6 `status: z.literal('proposed')` |

---

## Section 2: ContextEngine + Two-Speed Processing Architecture (GRND-02)

### 2.1 Architecture Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Faithfulness citation model | AI/Extraction Layer | UI/Renderer | Extraction contracts require grounded quotes; UI renders and toggles citation visibility |
| TranscriptStore (raw segments) | Database (SQLCipher) | Main process | Persistent storage of diarized segments from Deepgram; owned by database tier |
| Rolling window / token monitor | ContextEngine (main process) | — | Token-counted in-memory view; lives in main process to avoid renderer memory pressure |
| 5-min summary card generation | AI/Extraction Layer (main process) | Database | LLM call triggered by timer; result persisted to SQLCipher; triggered from main process |
| Epoch compression | ContextEngine (main process) | sqlite-vec | Fires when rolling window reaches ceiling; structured summaries embedded into vec DB |
| Live assistant context composition | ContextEngine (main process) | IPC | Assembles rolling window + cards (+ epoch RAG if overflow); sends to LLM; streams result via IPC |
| Break assist digest generation | AI/Extraction Layer (main process) | Database | On-demand LLM call at "I'm back" trigger; covers exact break window timestamps |
| End-of-meeting batch extraction | AI/Extraction Layer (main process) | Database | Map-reduce batch: chunks → parallel LLM calls → reduce to final artifacts |
| Artifact proposal UX | UI/Renderer | IPC | Renders proposals, collects confirm/reject from user; never auto-writes |
| Evaluation harness | Test/Eval layer | — | Separate tooling for adversarial transcript testing; not a production component |

### 2.2 Live Summary Board (per D-05 through D-09)

The live summary board is the overlay's primary real-time display during a meeting. It is a stacked card feed where each card covers a fixed time interval labeled with its time range (e.g., "10:00–10:05"). Cards stack downward as the meeting progresses.

**Display specification:**

- **(D-05) Stacked card feed with time range labels.** Each card's header displays the wall-clock interval it covers. Cards accumulate downward in the overlay.
- **(D-06) Per-interval content only.** Each card summarizes only the transcript from its own interval. Cards do NOT accumulate content from previous intervals. A new card begins generating as the previous interval closes.
- **(D-07) Five-minute default interval (v1 fixed).** The 5-minute interval is the product decision for v1. Configurability (3/5/10 min user setting) is a v2 settings knob — it is NOT a v1 requirement and must not be implemented as a setting in the first release.
- **(D-08) Cards persisted to SQLCipher DB.** Summary cards are written to the `summary_cards` table in the SQLCipher DB as part of the meeting record. They feed the Break Assist feature directly and are included as structured context for the Live Assistant.

**The decoupling mandate (D-09):**

The live summary board is **architecturally separate** from the ContextEngine epoch system. These two systems must not be conflated:

| System | Trigger | Purpose | Data source |
|--------|---------|---------|-------------|
| Summary cards | Time-based (every 5 minutes) | Display artifacts for the live overlay | Current interval's transcript |
| Context epochs | Token-threshold-based (70% of 800K ceiling) | Context management for overflow meetings | Oldest N raw transcript segments |

> **WARNING — Pitfall 4: Summary Card Leaking Into Epoch System**
>
> **What goes wrong:** The ContextEngine uses summary cards as the input to epoch compression instead of raw transcript segments. Cards are display artifacts — they already discard information. Compressing compressed data creates garbage epoch summaries.
>
> **Why it happens:** D-09 separation (cards vs epochs) is violated during implementation. The two concepts look similar (both are per-interval summaries).
>
> **How to avoid:** Epoch compression MUST read from `transcript_segments` in the TranscriptStore, NOT from `summary_cards`. These are separate tables; the code path must be explicitly different and the source table explicitly verified in code review.
>
> **Warning signs:** Epoch summaries shorter than expected; epoch summaries missing specific details that were in the transcript.

### 2.3 ContextEngine Component Overview

The ContextEngine is the central coordination component that manages all transcript context throughout a meeting session. It lives in the **Electron main process** — not the renderer — because it must coordinate DB writes, timer-triggered LLM calls, and IPC to the renderer.

```
TranscriptStore (SQLCipher DB)
     ↑ writes (speech_final segments)
     |
Deepgram WebSocket streams
(dual-channel: mic + system audio)
     |
     ↓
ContextEngine (main process, in-memory)
     |
     ├── RollingWindow  ← token-counted in-memory view of full transcript
     |     └── TokenMonitor  ← watches for 70-80% ceiling approach
     |
     ├── SummaryCardTimer  ← fires every 5 minutes
     |     └── CardLLMCaller  ← one cheap LLM call per interval (Gemini 2.5 Flash)
     |
     ├── EpochCompressor  ← fires only when TokenMonitor hits threshold
     |     └── EpochEmbedder  ← embeds epoch summaries into sqlite-vec
     |
     └── ContextComposer  ← assembles context for on-demand calls
           ├── For Live Assistant: rolling window + cards [+ epoch RAG if overflow]
           └── For Break Assist digest: transcript slice for break window
```

**Data flow summary:** Deepgram WebSocket pushes `speech_final` segments. TranscriptStore writes each segment to SQLCipher. ContextEngine reads from TranscriptStore to maintain the RollingWindow. SummaryCardTimer fires every 5 minutes; CardLLMCaller generates a `SummaryCardSchema` output, persists it to SQLCipher, and pushes it to the renderer via IPC. TokenMonitor runs passively; if the rolling window approaches 70% of the 800K ceiling, EpochCompressor fires.

### 2.4 Rolling Window Token Budget (per D-10)

The rolling window is a token-counted in-memory view of the full transcript. Its ceiling is **800,000 tokens** — leaving a 200K headroom buffer in Gemini 2.5 Flash's 1M context window for the system prompt, extraction instructions, and output buffer.

**Token budget by meeting length:**

| Meeting Length | Estimated Tokens (dual-channel, diarized) | Within 800K Ceiling? |
|---------------|------------------------------------------|--------------------|
| 30 min | ~15,000–25,000 tokens | Yes |
| 1 hour | ~30,000–50,000 tokens | Yes |
| 2 hours | ~60,000–100,000 tokens | Yes |
| 4 hours | ~120,000–200,000 tokens | Yes |
| 8 hours (all-day) | ~240,000–400,000 tokens | Yes |
| 20 hours | ~600,000–1,000,000 tokens | Borderline |
| 40+ hours | >1,000,000 tokens | Overflow — epoch fires |

For virtually all real-world meetings (including marathon all-day sessions), the epoch overflow system never fires. It is a correctness safeguard, not a common-case path.

**Epoch compression trigger:** Fire epoch compression when the rolling window reaches **70% of the ceiling = 560,000 tokens**. This gives the compressor headroom to summarize the oldest segments before the window is actually full. Do not wait until 100% — at 100% the next incoming transcript segment has no buffer to be added.

**Token counting implementation:** Use `tiktoken` (OpenAI's open-source tokenizer, npm package) with `cl100k_base` encoding. Do not use character-based approximation.

> **WARNING — Pitfall 2: Token Counter Drift in Rolling Window**
>
> **What goes wrong:** The token counter uses a character-based approximation (e.g., `Math.ceil(text.length / 4)`). Over a 2-hour meeting, drift accumulates to ~15-20%. The rolling window appears safe at 750K tokens but is actually 850-900K — triggering silent context overflow.
>
> **Why it happens:** Character-to-token ratios vary with content type. Meeting transcripts with names, acronyms, and domain jargon tokenize denser than plain English prose.
>
> **How to avoid:** Use `tiktoken` (npm package) with `cl100k_base` encoding. Never use character-based approximations in production.
>
> **Warning signs:** LLM API errors for "context too long" when the window monitor shows below 100% capacity.

**Why `cl100k_base`:** This encoding is compatible with GPT-4o and is a reasonable approximation for Gemini. For maximum accuracy with Gemini, a Gemini-specific tokenizer is preferable — but `cl100k_base` drift at meeting-transcript token densities is acceptable for a conservative trigger threshold. If Gemini exposes a tokenizer API in the build milestone, prefer it.

### 2.5 Epoch Compression Protocol (per D-11)

Epoch compression fires only when the rolling window exceeds the 70% trigger (560,000 tokens). It is an overflow safeguard, not a common-case path.

**Trigger condition:** `rolling_window.token_count > 560_000`

**What gets compressed:** The oldest N transcript segments (lowest timestamp first) — enough to bring the rolling window back below 50% capacity after eviction. The exact N is determined by the TokenMonitor at compression time.

**Compression output — EpochSummarySchema:**

```typescript
// Source: Designed for this spec; consistent with D-11 decisions
const EpochSummarySchema = z.object({
  epoch_id: z.string().uuid(),
  meeting_id: z.string().uuid(),
  covered_interval_start: z.number().describe("Seconds from meeting start"),
  covered_interval_end: z.number().describe("Seconds from meeting start"),
  decisions: z.array(z.string()).describe("Decisions made in this epoch — bullet list"),
  action_items: z.array(z.string()).describe("Action items committed in this epoch"),
  key_points: z.array(z.string()).describe("Key points from this epoch"),
  speaker_attributions: z.record(z.string(), z.string()).describe(
    "speaker_label → summary of their main contributions in this epoch"
  ),
  raw_segment_count: z.number().int().describe("Number of transcript segments compressed"),
  token_count_compressed: z.number().int().describe("Tokens freed by this compression"),
  created_at: z.string().describe("ISO 8601 timestamp of compression"),
});
```

**Why structured (not narrative):** The epoch summary is used for semantic retrieval by the Live Assistant (via sqlite-vec). Structured fields (decisions, action items, key points) give the embedding more discriminative signal than a narrative paragraph, improving retrieval precision. Separate fields embed separately and can be weighted differently in retrieval.

**Epoch embedding:** Each epoch summary is embedded as a single vector (concatenation of its fields as text) and stored in `vec_chunks` (the RSCH-05 sqlite-vec schema). The `text_preview` field in `vec_chunks` stores the epoch's `key_points` bullets for display without an additional fetch.

**Embedding model (default):** `text-embedding-3-small` (OpenAI)

| Property | Value |
|----------|-------|
| Dimensions | 1536 (matches RSCH-05 `vec_chunks` schema — no schema change needed) |
| Cost | $0.02/1M tokens |
| Provider constraint | Requires paid OpenAI API key |
| Privacy mode alternative | Local Ollama embedding model (e.g., `nomic-embed-text`) via same `baseURL` adapter |

The embedding provider follows the same `baseURL` adapter pattern as the LLM provider — configurable, not hardcoded. Privacy mode substitutes the Ollama model without code changes.

> **WARNING — Pitfall 3: Epoch Compression Destroying Recent Context**
>
> **What goes wrong:** Epoch compression fires and compresses the MOST recent transcript segments (the "top" of the array), losing the user's last 10 minutes of discussion that they expect the Live Assistant to know about.
>
> **Why it happens:** Array ordering confusion — oldest segments are at the lowest index, but implementation compresses from the wrong end.
>
> **How to avoid:** The epoch compressor MUST compress the OLDEST segments (lowest timestamp) first. Assert in tests that `epoch.covered_interval_end < rolling_window.oldest_remaining_segment.timestamp_start` after every compression event.
>
> **Warning signs:** Live Assistant says "I don't have information about what was just discussed" about a recent topic.

### 2.6 Speed 1: Real-Time Passive Path

The passive path is always on during a meeting. It has no user-visible LLM latency — the 5-minute card generation runs in the background, transparent to the user.

```
[Deepgram Nova-3 WebSocket]
    ↓ speech_final segments (streaming)
[TranscriptStore]
    ↓ writes to SQLCipher DB (diarized segments)
[RollingWindow]
    ↓ in-memory token-counted view updated per segment
[TokenMonitor]
    ↓ if token_count > 560,000: trigger EpochCompressor (rare)
[SummaryCardTimer] (every 5 min)
    ↓ trigger CardLLMCaller
    ↓ LLM call: SummaryCardSchema (Zod structured output, Gemini 2.5 Flash)
    ↓ write SummaryCard to SQLCipher DB (summary_cards table)
    ↓ push card to renderer via IPC (overlay display update)
```

**Key properties:**
- Transcript accumulation is instantaneous (Deepgram WebSocket push).
- The only LLM cost in the passive path is one card generation per 5-minute interval. Estimated cost per card: ~$0.0001–$0.0003 at Gemini 2.5 Flash pricing (~$0.30/$2.50 per M tokens, ~300-500 tokens in and ~200 tokens out per card).
- TokenMonitor runs passively with no LLM calls. Epoch compression fires only in pathological cases (40+ hour meetings).

### 2.7 Speed 2: On-Demand Path — Live Assistant (per D-12)

The Live Assistant fires only on explicit user trigger (hotkey or wake word). There is no passive LLM loop.

```
[User triggers hotkey or wake word]
    ↓
[ContextComposer]
    ↓ assemble context (priority stack — see below)
    ↓
[LLM call: Live Assistant]  — streaming response (Gemini 2.5 Flash)
    ↓
[Renderer IPC] — stream tokens to chat panel
    ↓
[ChatHistory] — append turn to session history for subsequent calls
```

**Context composition order (priority stack):**

| Priority | Context Component | Source | Notes |
|----------|------------------|--------|-------|
| 1 | System prompt | Hardcoded | Role, constraints, meeting metadata (meeting_date, participants) |
| 2 | All summary cards generated so far | `summary_cards` table (SQLCipher) | Structured context for the full meeting history |
| 3 | Rolling window content | In-memory RollingWindow | Verbatim recent transcript up to 800K ceiling |
| 4 | Epoch summaries (top-N via sqlite-vec RAG) | `vec_chunks` table (SQLCipher) | Only for overflow meetings where epochs exist |
| 5 | Chat history from this session | In-memory ChatHistory | All prior turns in the current meeting session |
| 6 | User's current question | IPC from renderer | The live question being asked |

**Chat history accumulation:** Chat history accumulates throughout the meeting session and is included in every subsequent assistant call. This enables context-preserving multi-turn conversation where the assistant remembers earlier questions from the same meeting.

### 2.8 Speed 2B: End-of-Meeting Batch — ArtifactPipeline (per D-14)

The ArtifactPipeline fires when the user explicitly ends the meeting. It uses a map-reduce pattern for parallelism and citation accuracy.

```
[User ends meeting]
    ↓
[ArtifactPipeline]
    ↓
[MAP phase — parallel LLM calls]
    ├── Chunk 1 (transcript 0–5 min) → LLM → partial extraction (ActionItems, Decisions, Dates)
    ├── Chunk 2 (transcript 5–10 min) → LLM → partial extraction
    ├── ...
    └── Chunk N (transcript last interval, partial if meeting ends mid-interval) → LLM → partial extraction
    ↓ (await all parallel calls)
[REDUCE phase — single LLM call]
    ↓ input: all partial extractions + all summary cards
    ↓ output: MeetingArtifactsSchema (Zod-validated, strict structured output)
    ↓
[CitationValidator]
    ↓ verify each citation's quote_full against transcript_segments DB
    ↓ flag citations with <90% token overlap as suspicious (do not suppress — display with warning)
    ↓
[DB write] — artifacts to SQLCipher (meeting_artifacts table)
    ↓
[Renderer IPC] — render proposals to user (proposed-with-confirm UI)
```

**Why map-reduce:**
- Parallelism reduces total batch wall time — all chunk extractions run concurrently.
- Each map chunk is small (5-minute interval) so citation accuracy is high within the chunk — no cross-chunk confusion about which quote belongs to which action item.
- The reduce step deduplicates action items mentioned multiple times across intervals.
- Summary cards serve as pre-extracted structured context for the reduce step, reducing the reduce LLM's hallucination risk.

**Chunk boundary strategy:** Use the existing 5-minute summary card intervals as natural map chunk boundaries. Each map chunk corresponds exactly to one 5-minute interval. This avoids re-chunking the transcript and aligns map output with the card structure.

**Mid-interval meeting end (Open Question resolution):** If a meeting ends mid-interval (e.g., 43 minutes — the last interval is 3 minutes, not 5), process the final partial interval as a full map chunk. The reduce step handles deduplication of any content that spans the partial interval.

**CitationValidator step:** After the reduce phase, the CitationValidator cross-checks each citation's `quote_full` against the `transcript_segments` table using fuzzy matching (90% token overlap threshold). Citations that fail validation are flagged — not suppressed. The user sees a warning indicator on flagged citations. This is the final faithfulness gate before proposals are shown to the user.

**All output items carry:**
- `citations: z.array(CitationAnchorSchema).min(1)` — enforced by the Zod schema
- `status: z.literal('proposed')` — enforced by the Zod schema
- No write to any external system until user confirmation (D-04 contract)

### 2.9 Break Assist Digest (per D-13)

Break Assist fires on explicit user trigger only — no automatic detection in v1.

```
[User triggers "I'm back" button or hotkey]
    ↓ (app has recorded break_start_timestamp when user triggered "going on break")
[ContextComposer]
    ↓ query transcript_segments WHERE timestamp >= break_start_timestamp AND timestamp <= now
    ↓ plus: summary_cards WHERE interval_start_seconds >= break_start_ts AND interval_end_seconds <= now_ts
    ↓
[LLM call: Break Assist digest]
    ↓ output: "While you were away" narrative digest covering the exact break window
    ↓
[Renderer IPC]
    ↓ render digest ABOVE the interval cards (digest = TL;DR; cards = detail)
```

**Output structure:** The user sees two layers:
1. **"While you were away" digest** (top) — a single LLM-generated narrative covering the entire break window.
2. **Interval cards from the break window** (below) — the `SummaryCard` objects already generated during the break, zero additional LLM cost.

**Manual-only activation (v1):** Automatic detection (mic silence → auto break assist) is deferred to v2. The manual trigger avoids false positives from muting or background noise. The app records `break_start_timestamp` when the user presses "going on break," enabling precise window coverage at return.

### 2.10 Common Pitfalls (Architecture)

> **WARNING — Pitfall 2: Token Counter Drift in Rolling Window**
>
> Use `tiktoken` with `cl100k_base`. Never use character-based approximations. (Full description in §2.4.)

> **WARNING — Pitfall 3: Epoch Compression Destroying Recent Context**
>
> Compress OLDEST segments (lowest timestamp) first. Assert `epoch.covered_interval_end < rolling_window.oldest_remaining_segment.timestamp_start` after every compression. (Full description in §2.5.)

> **WARNING — Pitfall 4: Summary Card Leaking Into Epoch System**
>
> Epoch compression reads from `transcript_segments`, NOT from `summary_cards`. These are separate tables with separate code paths. (Full description in §2.2.)

**Additional architecture guard — LLM model for epoch compression vs. summary cards (Open Question resolution):**

| Operation | Recommended Model | Rationale |
|-----------|------------------|-----------|
| Summary card generation (user-facing) | Gemini 2.5 Flash | User-facing display; quality matters |
| Epoch compression (internal infrastructure) | Gemini 2.5 Flash Lite | Internal; cost-optimized; not shown to user directly |
| End-of-meeting batch (map phase, user-facing) | Gemini 2.5 Flash | Citation quality is critical for user trust |
| End-of-meeting batch (reduce phase, user-facing) | Gemini 2.5 Flash | Deduplication + final MOM generation |

### 2.11 Decision Coverage (GRND-02)

| Decision | Description | Implementing Subsection |
|----------|-------------|------------------------|
| D-05 | Stacked card feed labeled with time range "10:00–10:05" format | §2.2 Live Summary Board |
| D-06 | Each card summarizes only its interval's transcript, not cumulative | §2.2 Display spec, §1.6 SummaryCardSchema `interval_start_seconds` / `interval_end_seconds` |
| D-07 | 5-minute default interval; configurability is v2 only | §2.2 Display spec — D-07 |
| D-08 | Summary cards persisted to SQLCipher DB; feed Break Assist + Live Assistant context | §2.2 Display spec — D-08, §2.7 Speed 2 context composition |
| D-09 | Live summary board architecturally separate from ContextEngine epoch system | §2.2 Decoupling mandate + Pitfall 4 warning |
| D-10 | Passive path: rolling window 800K ceiling; 5-min cards; no LLM except card generation | §2.4 Rolling Window Token Budget, §2.6 Speed 1 |
| D-11 | Context epoch system: 70% trigger, oldest-first compression, sqlite-vec embedding | §2.5 Epoch Compression Protocol |
| D-12 | Live Assistant: hotkey/wake word activation; rolling window + cards + epoch RAG context | §2.7 Speed 2 Live Assistant |
| D-13 | Break Assist: manual activation; summary cards (zero LLM cost) + dedicated digest | §2.9 Break Assist Digest |
| D-14 | End-of-meeting batch: map-reduce, Zod-validated, cited proposals, CitationValidator gate | §2.8 Speed 2B ArtifactPipeline |
