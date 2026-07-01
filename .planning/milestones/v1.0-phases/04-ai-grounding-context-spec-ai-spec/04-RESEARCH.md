# Phase 4: AI Grounding & Context Spec (AI-SPEC) - Research

**Researched:** 2026-06-26
**Domain:** LLM faithfulness/grounding, context management for long transcripts, adversarial evaluation harness design
**Confidence:** MEDIUM (spec/design phase; findings drawn from prior-phase planning artifacts + web research)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Citation Format & Grounding (GRND-01)**

- **D-01:** Citation anchor model: **hybrid** — short inline quote (~first 10 words of the supporting transcript passage) with a "Verify" expand-to-context link that jumps to the full transcript segment in the transcript viewer.
- **D-02:** Citations are **hidden by default** behind a "Verify" toggle (default off). Artifacts render cleanly; the trust signal is available on demand. No citation clutter on first read.
- **D-03:** Low-confidence extractions (no direct verbatim quote exists — e.g., an implicit agreement or inferred deadline): **surface with a low-confidence flag** ("Inferred — no direct quote") and lower visual weight. The item is shown but uncertainty is explicit. Do not silently suppress inferred items.
- **D-04:** "Proposed-with-confirm" UX: all extracted artifacts (action items, dates, decisions) are presented as proposals. User confirms before any calendar write or export. Nothing is auto-committed.

**Live Summary Board (GRND-02 — display layer)**

- **D-05:** The overlay shows a **live summary board** during the meeting — a stacked card feed where each card covers a fixed time interval, labeled with its time range (e.g., "10:00–10:05").
- **D-06:** Each card summarizes **only that interval's transcript** (not cumulative). Cards stack downward.
- **D-07:** Summary interval: **5 minutes** (default). Configurability (3/5/10 min) is a v2 settings knob, not v1.
- **D-08:** Summary cards are **persisted in the SQLCipher DB** and feed Break Assist + Live Assistant context directly.
- **D-09:** The live summary board is **architecturally separate from the ContextEngine epoch system**. Summary cards are time-triggered display artifacts; context epochs are token-threshold-triggered context management. They must not be conflated.

**ContextEngine & Two-Speed Processing Architecture (GRND-02 — context layer)**

- **D-10:** **Passive path:** Deepgram Nova-3 dual-channel transcription streams fragments into TranscriptStore (SQLCipher) in real time. ContextEngine maintains an in-memory rolling window (ceiling: ~800K tokens). Every 5 minutes: one LLM call generates the next summary card. No LLM in the passive path except the 5-min card generation.
- **D-11:** **Context epoch system (overflow path):** When rolling window approaches token ceiling, the oldest chunk is summarized into a structured epoch summary and evicted. Epoch summary is embedded and indexed into sqlite-vec. Epoch content: decisions + action items + key points + speaker attribution. Live Assistant retrieves top-N relevant epoch summaries via sqlite-vec semantic search for overflow meetings.
- **D-12:** **On-demand path (Live Assistant):** Activated by hotkey or wake word. Context: rolling window (full raw transcript) + 5-min summary cards generated so far. For overflow meetings: rolling window + top-N epoch summaries via RAG. Response streamed in chat panel. Chat history accumulates within session.
- **D-13:** **Break Assist:** Manual activation only ("I'm back" button/hotkey). Output: (a) 5-min summary cards generated during the break (zero extra LLM cost), and (b) a dedicated "While you were away" digest covering the exact break window. Digest sits above interval cards as TL;DR.
- **D-14:** **End-of-meeting batch:** Input: full transcript + all 5-min summary cards as structured context. One or more Zod-validated JSON LLM calls. Outputs: MOM, key points, meeting summary, action items with owners and deadlines, dates/events. All include citation anchors (D-01 through D-03); all presented as proposals (D-04).

### Claude's Discretion

- **GRND-03 eval harness design:** Corpus composition, specific metric, and passing bar are researcher's judgment, informed by faithfulness contract decisions above.
- **5-min summary card content:** Exact structure (narrative vs. structured bullets vs. hybrid) — must be consistent with end-of-meeting artifact format.
- **Token ceiling value:** ~800K of 1M is conservative default; researcher refines based on provider limits and default model.
- **Embedding model for epoch RAG:** Researcher selects (OpenAI text-embedding-3-small is a reasonable default; local Ollama model for privacy mode).

### Deferred Ideas (OUT OF SCOPE)

- Configurable summary interval (3/5/10 min) — v2 only
- Named speaker attribution in citations ("Alice said…" vs "Speaker 1 said…") — v2 per Phase 3 D-10
- Automatic break detection (mic silence → auto break assist) — v2, manual trigger is v1
- Faithfulness eval corpus (real recordings) — v1 uses synthetic adversarial transcripts only
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRND-01 | AI-artifact grounding/faithfulness design contract — quote-backed extraction, per-artifact transcript citations, "proposed-with-confirm" UX (never auto-write to calendar), conservative date handling | §Faithfulness Contract Design, §Citation Model, §Zod Schema Examples |
| GRND-02 | ContextEngine + two-speed processing architecture spec (rolling window + RAG + epoch summaries; real-time hot path vs end-of-meeting batch map-reduce) for long meetings | §ContextEngine Architecture, §Two-Speed Processing, §Token Budget Analysis |
| GRND-03 | Adversarial-transcript evaluation harness + faithfulness metric defined (how grounding will be tested) | §Adversarial Evaluation Harness, §Faithfulness Metric Definition, §Test Corpus Design |
</phase_requirements>

---

## Summary

Phase 4 produces the AI-SPEC design contract for MeetingAssist — the faithfulness/grounding contract, the ContextEngine architecture, and the adversarial evaluation harness. This is a pure planning output (no code). All user decisions are locked in CONTEXT.md D-01 through D-14; the researcher's discretion covers the eval harness specifics, token ceiling calibration, summary card structure, and embedding model selection.

The core trust problem this phase solves: users must be able to verify that any extracted action item, decision, or date actually came from the transcript — not from the model's parametric memory or a confabulation. Quote-backed citations with expand-to-context verification is the accepted solution (D-01). The "proposed-with-confirm" UX (D-04) ensures users are never surprised by auto-written artifacts.

The ContextEngine architecture is a two-speed system: a passive no-LLM path for real-time transcript accumulation and display, plus an on-demand LLM path for live assistant queries and a batch path for end-of-meeting artifact generation. The epoch overflow system fires only for pathologically long meetings and keeps costs bounded by compressing and evicting old transcript segments into dense structured summaries.

**Primary recommendation:** Write 04-AI-SPEC.md as a single consolidated design contract document containing three sections: (1) the faithfulness/grounding contract, (2) the ContextEngine two-speed architecture, and (3) the adversarial evaluation harness. This is consumed by Phase 5 PRD finalization.

---

## Architectural Responsibility Map

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

---

## Faithfulness Contract Design

### What "Faithfulness" Means for MeetingAssist

[ASSUMED] A MeetingAssist artifact is faithful if and only if every factual claim in the artifact — every action item, every decision, every date, every assignee, every commitment — can be traced to a verbatim passage in the meeting transcript. Faithfulness failure occurs in two categories:

1. **Extrinsic hallucination:** The model invents an action item, decision, or date that was never discussed. A participant is assigned a task they never agreed to. A deadline is fabricated. [ASSUMED — from hallucination taxonomy research]

2. **Intrinsic hallucination:** A real discussion is misrepresented — the wrong speaker is assigned an action item, a date is mangled (next Tuesday → next Monday), a decision is inverted, a condition is dropped (e.g., "if we get sign-off" → stated as unconditional commitment). [ASSUMED — from hallucination taxonomy research]

Both categories damage user trust and are the #1 reason users would reject AI-generated meeting artifacts.

### Quote-Backed Extraction Protocol (GRND-01)

Every extracted artifact item is generated through a two-stage process:

**Stage 1 — Evidence Extraction (anchor-first):** Before generating the artifact content, the model is instructed to identify and quote the exact transcript passage(s) that support the claim. The extraction prompt requires:
- `quote`: verbatim transcript text (exact words from the transcript, not paraphrased)
- `speaker`: speaker label from that passage ("You", "Speaker 1", "Speaker 2", etc.)
- `timestamp_start` / `timestamp_end`: seconds from meeting start for the supporting passage

**Stage 2 — Constrained Generation (citation-anchored):** The artifact content (action item description, decision text, date) is generated ONLY from the anchored quotes extracted in Stage 1. The prompt explicitly prohibits the model from using any information not present in the provided quotes. [ASSUMED — G3 pattern from faithfulness research]

This two-stage approach prevents the model from generating plausible-but-ungrounded claims because the generation step only has access to the quotes it explicitly extracted, not the full model parametric memory.

### Citation Anchor Schema (D-01, D-02)

```typescript
// Source: Locked decision D-01 (04-CONTEXT.md)
interface CitationAnchor {
  quote_preview: string;        // First 10 words of the supporting passage (inline display)
  quote_full: string;           // Complete verbatim quote (shown on "Verify" expand)
  speaker_label: string;        // "You" | "Speaker 1" | "Speaker 2" | ...
  timestamp_start: number;      // Seconds from meeting start
  timestamp_end: number;        // Seconds from meeting start
  confidence: 'direct' | 'inferred';  // D-03: whether verbatim quote exists
}
```

**Confidence levels (D-03):**
- `'direct'`: A verbatim quote exists in the transcript that directly states the claim. Display: normal visual weight with "Verify" toggle.
- `'inferred'`: No verbatim quote — the artifact was inferred from context (e.g., an implicit agreement, a deadline inferred from "by end of quarter"). Display: reduced visual weight + "Inferred — no direct quote" badge. Item is shown but uncertainty is explicit. Never suppress.

### Conservative Date Handling

Dates extracted from meeting transcripts have a high hallucination risk because:
- Relative dates ("next Tuesday", "by end of month", "in two weeks") require accurate resolution against the meeting date
- LLMs frequently confuse relative-to-meeting-date vs. relative-to-today
- Meeting participants often speak ambiguously ("let's do this soon" → model might invent a date)

[ASSUMED] Conservative date handling rules for the extraction contract:

1. **Absolute dates only in structured output:** ISO 8601 date strings (e.g., `"2026-07-15"`) are the only form used in `due_date` fields. Relative expressions are resolved at extraction time using the meeting's `started_at` timestamp.

2. **Unresolvable relative dates → NULL:** If a deadline cannot be resolved to a specific calendar date (e.g., "soon", "eventually", "when we get a chance"), the `due_date` field is set to `null` and the raw expression is preserved in the `raw_deadline_text` field. The user resolves ambiguous dates during the confirm step.

3. **Inferred deadline → `confidence: 'inferred'`:** If a deadline is implied rather than stated (e.g., "we need this before the launch"), tag as `inferred` so the citation anchor shows the "Inferred — no direct quote" badge.

4. **Meeting date injection in prompt:** Every extraction prompt includes the meeting's `started_at` date in ISO 8601 format so the model can correctly resolve relative expressions.

### Proposed-with-Confirm UX Contract (D-04)

All extracted artifacts are proposals. The contract:

- **Nothing auto-writes to calendar or any external system.**
- Every action item, event, and date is in `status: 'proposed'` until the user explicitly confirms.
- The UI renders proposals in a distinct visual state (e.g., dotted border, "Pending your review" label).
- User actions: Confirm (accepts the artifact as-is), Edit-then-Confirm (user edits before accepting), or Dismiss (removes the proposal).
- Calendar export / `.ics` generation is only available for `status: 'confirmed'` items.
- The AI-SPEC must specify that the extraction pipeline NEVER triggers any external write without a user confirmation event.

---

## Zod Extraction Schema Design

### Philosophy: One Schema, Two Providers

The extraction schema is defined once in Zod and translated to provider-specific formats:
- OpenAI: `zodToJsonSchema(schema)` → `response_format: { type: 'json_schema', json_schema: { strict: true, schema: ... } }` [ASSUMED — from OpenAI Structured Outputs docs]
- Gemini: `zodToJsonSchema(schema)` → `generationConfig.responseJsonSchema` (Gemini 2.5+ supports full JSON Schema) [ASSUMED — from Gemini responseSchema docs]

This prevents the "provider switch breaks extraction" failure mode and ensures schema adherence at inference time — not just at parse time.

### Canonical Extraction Schema (Zod, TypeScript)

```typescript
// Source: Designed for this spec; compatible with RSCH-05 schema and CLAUDE.md stack decisions
import { z } from 'zod';

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

const ActionItemSchema = z.object({
  id: z.string().uuid(),
  description: z.string().describe("What must be done — derived ONLY from anchored quotes"),
  assignee_label: z.string().nullable().describe("Speaker label of assignee, or null if unattributed"),
  due_date: z.string().nullable().describe("ISO 8601 date string, or null if unresolvable"),
  raw_deadline_text: z.string().nullable().describe("Raw expression if due_date is null"),
  status: z.literal('proposed'),
  citations: z.array(CitationAnchorSchema).min(1),
});

const DecisionSchema = z.object({
  id: z.string().uuid(),
  description: z.string().describe("The decision made — derived ONLY from anchored quotes"),
  decision_maker_label: z.string().nullable(),
  status: z.literal('proposed'),
  citations: z.array(CitationAnchorSchema).min(1),
});

const ExtractedDateSchema = z.object({
  id: z.string().uuid(),
  description: z.string().describe("What the date is for"),
  date: z.string().nullable().describe("ISO 8601 date, or null if unresolvable"),
  raw_date_text: z.string().describe("Raw expression from transcript"),
  status: z.literal('proposed'),
  citations: z.array(CitationAnchorSchema).min(1),
});

const KeyPointSchema = z.object({
  text: z.string().describe("A single key point — must be grounded in transcript"),
  speaker_label: z.string().nullable(),
  citations: z.array(CitationAnchorSchema).min(1),
});

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

**Key contract rules enforced by this schema:**
- `citations: z.array(CitationAnchorSchema).min(1)` — every extracted item MUST have at least one citation; schema enforcement prevents uncited claims
- `status: z.literal('proposed')` — extraction always produces proposals; status upgrade happens via user action, not model output
- `due_date: z.string().nullable()` — forces the model to use null for unresolvable dates rather than fabricating one

### 5-Min Summary Card Schema

```typescript
// Source: Designed for this spec; per locked decisions D-05 through D-09
const SummaryCardSchema = z.object({
  meeting_id: z.string().uuid(),
  card_index: z.number().int().nonnegative().describe("Sequential card number, 0-indexed"),
  interval_start_seconds: z.number().describe("Seconds from meeting start"),
  interval_end_seconds: z.number().describe("Seconds from meeting start"),
  wall_time_label: z.string().describe("Human label, e.g., '10:00–10:05'"),

  // Structured content (not purely narrative — feeds Break Assist and Live Assistant context)
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

**Note on card content structure (Claude's Discretion area):** The hybrid format above (topic headline + key-point bullets + speaker contributions) is chosen over a pure narrative paragraph because: (a) bullets are faster to scan for Break Assist use case, (b) the `action_items_mentioned` field pre-seeds the end-of-meeting extraction, and (c) `speaker_contributions` is compatible with the citation model's speaker attribution requirement. This format is consistent with the end-of-meeting MOM structure — a standup-style card that looks like a section of the MOM.

---

## ContextEngine Architecture

### Component Overview

The ContextEngine is the central coordination component that manages all transcript context throughout a meeting session. It lives in the Electron main process (not the renderer) because it must coordinate DB writes, timer-triggered LLM calls, and IPC to the renderer.

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

### Rolling Window Token Budget

[ASSUMED] Token estimation for a typical meeting:

| Meeting Length | Estimated Tokens (dual-channel, diarized) | Within 1M Ceiling? |
|---------------|------------------------------------------|--------------------|
| 30 min | ~15,000–25,000 tokens | Yes |
| 1 hour | ~30,000–50,000 tokens | Yes |
| 2 hours | ~60,000–100,000 tokens | Yes |
| 4 hours | ~120,000–200,000 tokens | Yes |
| 8 hours (all-day) | ~240,000–400,000 tokens | Yes |
| 20 hours | ~600,000–1,000,000 tokens | Borderline |
| 40+ hours | >1,000,000 tokens | Overflow — epoch fires |

**Rolling window ceiling: 800,000 tokens** (locked decision D-10, confirmed as researcher choice from Claude's Discretion). This leaves 200K headroom in Gemini 2.5 Flash's 1M context window for the LLM system prompt, extraction instructions, and output buffer. For virtually all real-world meetings (even marathon all-day sessions), the epoch overflow system never fires. [ASSUMED — from token budget analysis and Gemini 2.5 Flash 1M context window specification]

**Token counting implementation:** Use `tiktoken` (OpenAI's open-source tokenizer, npm package) for token counting in the rolling window. Do not hand-roll a character-based estimator — off-by-one errors in token estimation cause either premature eviction (losing recent context) or silent overflow (passing a too-large context). Use `cl100k_base` encoding (compatible with GPT-4o and a reasonable approximation for Gemini). [ASSUMED — from chunking anti-pattern research in RSCH-05]

**Token ceiling trigger:** Fire epoch compression when the rolling window reaches **70% of the ceiling** (560,000 tokens), not 100%. This gives the compressor headroom to summarize the oldest segments before the window is actually full. [ASSUMED — from context management research (70-80% trigger is industry best practice)]

### Epoch Compression Protocol (D-11)

Fires only when the rolling window exceeds the 70% trigger (560K tokens).

**What gets compressed:** The oldest N transcript segments — enough to bring the rolling window back below 50% capacity after eviction. The exact N is determined by the TokenMonitor at compression time.

**Compression output (structured epoch summary):**
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

**Why structured (not narrative):** The epoch summary is used for semantic retrieval by the Live Assistant. Structured fields (decisions, action items, key points) give the embedding more discriminative signal than a narrative paragraph, improving retrieval precision. [ASSUMED — from general embedding best practices]

**Epoch embedding:** Each epoch summary is embedded as a single vector (concatenation of its fields as text) and stored in `vec_chunks` (RSCH-05 schema). The `text_preview` field in `vec_chunks` stores the epoch's `key_points` bullets for display without additional fetch.

### Embedding Model Selection (Claude's Discretion)

**Default: `text-embedding-3-small` (OpenAI)** [ASSUMED — recommended default]

| Property | Value | Notes |
|----------|-------|-------|
| Dimensions | 1536 | Matches RSCH-05 `vec_chunks` schema — no schema change needed |
| Cost | $0.02/1M tokens | Batch: $0.01/1M tokens |
| Provider constraint | Requires paid OpenAI API key | Consistent with existing LLM layer |
| Privacy mode alternative | Local Ollama embedding model (e.g., `nomic-embed-text`) | Same 768 or 1536 dim depending on model; requires schema variant or dimension padding |

[CITED: developers.openai.com/api/docs/models/text-embedding-3-small — 1536 dimensions, $0.02/1M tokens]

**Privacy mode embedding:** When the user has enabled on-device mode (D-09 in DEC-02), use a local Ollama embedding model. The AI-SPEC must specify that the embedding provider follows the same `baseURL` adapter pattern as the LLM provider — configurable, not hardcoded. [ASSUMED]

**Epoch embedding timing:** Embed immediately after epoch summary is generated (synchronous with compression). The embedding cost for a typical epoch summary (<500 tokens) is negligible (<$0.00001 per epoch at $0.02/1M tokens). [ASSUMED]

---

## Two-Speed Processing Architecture

### Speed 1: Real-Time Passive Path (Always On, No LLM During Meeting)

```
[Deepgram Nova-3 WebSocket]
    ↓ speech_final segments (streaming)
[TranscriptStore]
    ↓ writes to SQLCipher DB
[RollingWindow]
    ↓ in-memory token-counted view
[TokenMonitor]
    ↓ if > 70% ceiling: trigger EpochCompressor
[SummaryCardTimer] (every 5 min)
    ↓ trigger CardLLMCaller
    ↓ LLM: SummaryCardSchema (Zod, structured output)
    ↓ write SummaryCard to SQLCipher DB
    ↓ push card to renderer via IPC (display update)
```

**Key properties:**
- No user-visible LLM latency in the passive path (the 5-min card generation runs in the background)
- Transcript accumulation is instantaneous (Deepgram WebSocket push)
- The only LLM cost in the passive path is one card generation per 5-min interval (cheap: ~300-500 tokens in, ~200 tokens out; Gemini 2.5 Flash ~$0.30/$2.50 per M → ~$0.0001–$0.0003 per card)

### Speed 2: On-Demand Path (Fires on User Trigger)

**Live Assistant (D-12):**
```
[User triggers hotkey/wake word]
    ↓
[ContextComposer]
    ↓ assemble: rolling_window_text + summary_cards_text [+ epoch_summaries if overflow]
    ↓
[LLM call: Live Assistant]  — streaming response
    ↓
[Renderer IPC] — stream tokens to chat panel
    ↓
[ChatHistory] — append turn to session history for subsequent calls
```

Context composition order (priority stack):
1. System prompt (role, constraints, meeting metadata)
2. All summary cards generated so far (structured context for the full meeting history)
3. Rolling window content (verbatim recent transcript — up to ceiling)
4. Epoch summaries (top-N retrieved via sqlite-vec, if overflow meeting)
5. Chat history from this session
6. User's current question

**Break Assist digest (D-13):**
```
[User triggers "I'm back" button]
    ↓
[ContextComposer]
    ↓ assemble: transcript segments from break_start_timestamp to now
    ↓ plus: summary_cards generated during break window
    ↓
[LLM call: Break Assist digest]  — "While you were away" summary
    ↓
[Renderer IPC] — render digest above interval cards
```

### Speed 2B: End-of-Meeting Batch (Fires on Meeting End)

```
[User ends meeting]
    ↓
[ArtifactPipeline]
    ↓
[MAP phase — parallel]
    ├── Chunk 1 (transcript segment 0-5min) → LLM → partial extraction
    ├── Chunk 2 (transcript segment 5-10min) → LLM → partial extraction
    ├── ...
    └── Chunk N (transcript segment last-interval) → LLM → partial extraction
    ↓ (wait for all parallel calls to complete)
[REDUCE phase — single LLM call]
    ↓ input: all partial extractions + all summary cards
    ↓ output: MeetingArtifactsSchema (Zod-validated)
    ↓
[CitationValidator] — verify each artifact citation references a real transcript segment
    ↓
[DB write] — artifacts to SQLCipher
    ↓
[Renderer IPC] — render proposals to user
```

**Why map-reduce for the batch path:** [ASSUMED — from map-reduce summarization research]
- Parallelism reduces total batch wall time (all chunk extractions run concurrently)
- Each map chunk is small enough that citation accuracy is high (no cross-chunk confusion)
- The reduce step deduplicates action items mentioned multiple times across intervals
- The summary cards serve as a "pre-extracted" structured context for the reduce step, reducing the reduce LLM's hallucination risk

**Chunk boundary strategy for map phase:** Use the existing 5-min summary card intervals as natural chunk boundaries. Each map chunk corresponds exactly to one 5-min interval. This avoids re-chunking the transcript and aligns the map output with the card structure. [ASSUMED]

---

## Adversarial Evaluation Harness (GRND-03)

### Faithfulness Metric Definition

**Primary metric: Citation-Grounded Faithfulness Score (CGFS)**

This is a MeetingAssist-specific variant of the RAGAS faithfulness metric, adapted for the citation model defined in GRND-01. [ASSUMED — adapting RAGAS pattern to MeetingAssist's citation contract]

**Calculation:**
```
CGFS = (citation-verifiable items) / (total extracted items)
```

Where an item is "citation-verifiable" if and only if:
- The `quote_full` in its `CitationAnchor` appears verbatim (or near-verbatim, ≥90% token overlap) in the ground-truth transcript segment at the cited timestamp
- The claim derived from the quote does not introduce information beyond what the quote states

**Target threshold: CGFS ≥ 0.85** (85% of all extracted items must be citation-verifiable against the adversarial transcript). [ASSUMED — based on RAGAS standard recommendation of ≥0.8; set slightly higher at 0.85 for meeting artifacts where false action items are especially damaging to user trust]

**Secondary metric: Extrinsic Hallucination Rate (EHR)**

```
EHR = (items with no matching evidence in transcript) / (total extracted items)
```

**Target threshold: EHR ≤ 0.05** (≤5% of extracted items must be extrinsic hallucinations). [ASSUMED]

**Tertiary metric: Intrinsic Distortion Rate (IDR) — manual eval only**

Proportion of extracted items where the evidence exists in the transcript but the claim distorts it (wrong assignee, mangled date, inverted decision). This is a human-in-the-loop check because automated detection of subtle distortions is unreliable. [ASSUMED]

### Adversarial Transcript Corpus (v1)

**v1 corpus: Synthetic adversarial transcripts only** (per CONTEXT.md — real recordings deferred to post-launch)

**Corpus composition (researcher recommendation):**

| Category | Count | Description |
|----------|-------|-------------|
| Standard team syncs | 10 | 4–6 speakers, 30–60 min, general business discussion |
| Action-item-dense meetings | 10 | Multiple action items assigned to multiple speakers; some ambiguous |
| Date-heavy meetings | 10 | Multiple deadlines, relative dates ("next Tuesday"), unresolvable dates ("soon"), implicit deadlines |
| High speaker count | 5 | 7–8 speakers; diarization stress test for citation speaker attribution |
| Adversarial — fabrication bait | 10 | Transcripts containing plausible-but-unspoken commitments adjacent to real commitments; tests whether model extracts only what was actually said |
| Adversarial — attribution bait | 5 | Multiple speakers with similar names/roles; tests whether assignee is correctly attributed |
| Adversarial — implicit inference traps | 5 | Transcripts where a meeting "outcome" was discussed but never explicitly agreed; tests whether model correctly flags as `inferred` |
| Short/no-content | 5 | Transcripts with minimal actionable content; tests whether model correctly extracts nothing rather than fabricating |

**Total: 60 synthetic transcripts** for v1 eval corpus

**Corpus generation method (Claude's Discretion):** [ASSUMED — from synthetic dataset research]
Use an LLM (GPT-4o or Gemini 2.5 Pro) as a generator with the following pipeline:
1. Generate a realistic meeting scenario (participants, topic, outcomes)
2. Generate the full transcript with speaker turns and natural diarized format
3. Generate the ground-truth extraction: what action items, decisions, and dates should appear
4. For adversarial categories: inject plausible false commitments adjacent to real ones (without biasing the injected hallucination category in the prompt — let the model decide what to inject)
5. Human review pass: native-speaker verification of naturalness and ground-truth accuracy

**Corpus format:**
```typescript
interface AdversarialTestCase {
  transcript_id: string;
  category: string;
  transcript: string;                    // Full synthetic meeting transcript
  ground_truth: {
    action_items: GroundTruthItem[];
    decisions: GroundTruthItem[];
    dates: GroundTruthDateItem[];
  };
  adversarial_injections?: {             // For adversarial categories only
    description: string;                 // What was injected and where
    expected_behavior: 'not-extracted' | 'flagged-inferred';
  }[];
}
```

### Harness Architecture

The eval harness is a standalone test runner (not a production component):

```
[adversarial_corpus/]
    ├── test_01_standard_sync.json
    ├── test_02_action_dense.json
    └── ...
    ↓
[harness.ts]
    ↓ for each test case:
    ├── Run MeetingAssist ArtifactPipeline (end-of-meeting batch) against transcript
    ├── Collect MeetingArtifactsSchema output
    ├── Run citation verifier: check each quote_full against transcript
    ├── Compare extracted items against ground_truth
    ├── Compute per-case CGFS and EHR
    └── Aggregate scores
    ↓
[eval_report.json]
    ├── Overall CGFS (target ≥ 0.85)
    ├── Overall EHR (target ≤ 0.05)
    ├── Per-category breakdown
    └── Failed cases (for debugging)
```

**Harness implementation note:** The citation verifier must do fuzzy matching, not exact string match, because the LLM may extract a quote with minor whitespace or punctuation normalization. Use a 90% token-level overlap threshold as the "near-verbatim" criterion. [ASSUMED]

**When to run the harness:**
- Before any change to the extraction prompt
- Before any change to the Zod schema that affects citation fields
- At the start of the build milestone (baseline score)
- After each extraction-related PR in the build milestone

**Passing bar for shipping:** CGFS ≥ 0.85 AND EHR ≤ 0.05 across all categories AND no adversarial category scoring below CGFS 0.75. The harness is a gate, not advisory. [ASSUMED]

---

## Common Pitfalls

### Pitfall 1: Generating Artifact Content Before Extracting Quotes
**What goes wrong:** The model is prompted to "summarize action items with citations." It generates the action item description first (using parametric memory), then attaches a plausible-looking but fabricated quote. The quote may look real but not appear verbatim in the transcript.
**Why it happens:** Standard summarization prompts generate content freely, then justify after the fact.
**How to avoid:** Two-stage extraction protocol — evidence extraction stage MUST run before content generation stage. The generation prompt receives ONLY the extracted quotes, not the full transcript.
**Warning signs:** Quote fields that are paraphrases rather than verbatim text; quotes longer than the cited transcript passage; quotes that are grammatically polished versions of messy real speech.

### Pitfall 2: Token Counter Drift in Rolling Window
**What goes wrong:** The token counter uses a character-based approximation (e.g., `Math.ceil(text.length / 4)`). Over a 2-hour meeting, drift accumulates to ~15-20%. The rolling window appears safe at 750K tokens but is actually 850-900K — triggering silent context overflow.
**Why it happens:** Character-to-token ratios vary with content type (code, URLs, names all tokenize differently). Meeting transcripts with names, acronyms, and domain jargon have higher token density.
**How to avoid:** Use `tiktoken` (npm package) with `cl100k_base` encoding for accurate token counts. Never use character-based approximations in production. [ASSUMED — from RSCH-05 chunking anti-pattern]
**Warning signs:** LLM API errors for "context too long" when the window monitor shows <100% capacity.

### Pitfall 3: Epoch Compression Destroying Recent Context
**What goes wrong:** Epoch compression fires and compresses the MOST recent transcript segments (because they are at the "top" of an array), losing the user's last 10 minutes of discussion that they expect the Live Assistant to know about.
**Why it happens:** Array ordering confusion — the oldest segments are at the lowest index, but implementation compresses from the wrong end.
**How to avoid:** The epoch compressor MUST compress the OLDEST segments (lowest timestamp) first. Assert in tests that `epoch.covered_interval_end < rolling_window.oldest_segment_start` after every compression.
**Warning signs:** Live Assistant says "I don't have information about what was just discussed" on a recent topic.

### Pitfall 4: Summary Card Leaking Into Epoch System
**What goes wrong:** The ContextEngine uses summary cards as the input to epoch compression instead of raw transcript segments. Cards are display artifacts — they already lose information. Compressing compressed data creates garbage epoch summaries.
**Why it happens:** D-09 separation (cards vs epochs) is violated during implementation.
**How to avoid:** Epoch compression MUST read from `transcript_segments` in the TranscriptStore, not from `summary_cards`. These are separate tables; the code path must be explicitly different.
**Warning signs:** Epoch summaries that are shorter than expected; epoch summaries missing specific details that were in the transcript.

### Pitfall 5: Implicit Date Resolution Bug
**What goes wrong:** The extraction prompt says "by next Friday" and the model resolves it relative to its training cutoff date (August 2025) or relative to today's date (the deployment date), not relative to the meeting date.
**Why it happens:** The model's concept of "now" is ambiguous in extraction prompts.
**How to avoid:** Every extraction prompt MUST inject `meeting_date: "2026-06-26"` (ISO 8601 `started_at`) in the system context. Include explicit instructions: "Resolve all relative dates relative to the meeting date provided in meeting_date, not today's date."
**Warning signs:** Due dates in extracted action items that are in the past, or far in the future, when the meeting discussed near-term commitments.

### Pitfall 6: Provider-Specific Schema Drift
**What goes wrong:** The Zod schema is updated (e.g., a new field added to `ActionItemSchema`), but the Gemini `responseJsonSchema` is updated separately and manually. They drift apart. Gemini starts returning different fields than OpenAI.
**Why it happens:** Two code paths for the same logical schema.
**How to avoid:** Single source of truth: the Zod schema. Both OpenAI and Gemini paths use `zodToJsonSchema(ActionItemSchema)`. The schema-to-provider conversion happens at runtime, not at schema definition time.
**Warning signs:** TypeScript type errors on Gemini responses; fields present in OpenAI responses missing from Gemini responses.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (co-located with Vite 7 build, no extra config) |
| Config file | `vitest.config.ts` (Wave 0 gap — does not exist yet) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRND-01 | CitationAnchor schema validates correctly | unit | `npx vitest run tests/schemas/citation.test.ts` | No — Wave 0 |
| GRND-01 | `confidence: 'inferred'` flagged for items with no verbatim quote | unit | `npx vitest run tests/grounding/inference-flag.test.ts` | No — Wave 0 |
| GRND-01 | `status: 'proposed'` on all extracted artifacts | unit | `npx vitest run tests/schemas/artifacts.test.ts` | No — Wave 0 |
| GRND-01 | `due_date: null` for unresolvable relative dates | unit | `npx vitest run tests/grounding/date-handling.test.ts` | No — Wave 0 |
| GRND-02 | Rolling window token count stays below ceiling | unit | `npx vitest run tests/context/token-monitor.test.ts` | No — Wave 0 |
| GRND-02 | Epoch compression evicts OLDEST segments, not newest | unit | `npx vitest run tests/context/epoch-compressor.test.ts` | No — Wave 0 |
| GRND-02 | Summary cards NOT used as epoch compression input | unit | `npx vitest run tests/context/epoch-input-source.test.ts` | No — Wave 0 |
| GRND-03 | CGFS ≥ 0.85 across adversarial corpus | eval harness | `npx ts-node eval/harness.ts` | No — Wave 0 |
| GRND-03 | EHR ≤ 0.05 across adversarial corpus | eval harness | `npx ts-node eval/harness.ts` | No — Wave 0 |

**Note:** This is a planning-only phase. The tests listed above are PLANNED tests for the build milestone. The current phase deliverable is 04-AI-SPEC.md (the design contract), not test implementations. The test map feeds Phase 5 PRD and the build milestone's Wave 0.

### Wave 0 Gaps (for build milestone)
- [ ] `vitest.config.ts` — Vitest configuration for Electron + TypeScript project
- [ ] `tests/schemas/` directory — schema validation tests for Zod artifacts
- [ ] `tests/grounding/` directory — faithfulness contract unit tests
- [ ] `tests/context/` directory — ContextEngine behavior tests
- [ ] `eval/harness.ts` — adversarial evaluation harness runner
- [ ] `eval/corpus/` — 60 synthetic adversarial transcript JSON files

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user auth in this phase (spec-only) |
| V3 Session Management | Partially | Meeting session state in main process; SessionManager FSM in Phase 5 |
| V4 Access Control | No | Single-user desktop app; no multi-user access control needed in v1 |
| V5 Input Validation | Yes | Zod schema validation on all LLM outputs (strict mode); never trust raw LLM JSON |
| V6 Cryptography | Indirectly | Data written to SQLCipher DB (DEC-02); epoch embeddings inherit DB encryption |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via transcript content | Tampering | Separate transcript content from instructions in structured prompts; use system role for instructions, not user content |
| LLM output injection (malicious JSON in model response) | Tampering | Zod strict schema validation on all LLM outputs; reject/flag any response that fails schema validation |
| Citation forgery (model generates plausible-but-false quote) | Repudiation | Citation verifier cross-checks `quote_full` against `transcript_segments` DB before displaying; flag non-matching quotes |
| Epoch summary corruption (lossy compression distorts facts) | Tampering | Epoch summaries include `raw_segment_count` and `covered_interval` for auditability; original segments remain in DB |
| Sensitive meeting content in LLM API request | Information Disclosure | Deepgram `mip_opt_out=true` (confirmed RSCH-03); Gemini paid quota only (confirmed RSCH-03); no free-tier processing |

---

## Standard Stack (for this spec phase)

This phase produces a written spec, not code. The stack below is for the AI-SPEC document's implementation recommendations consumed by Phase 5 PRD and the build milestone.

### Core AI/Extraction Stack

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | latest | Schema definition for all extraction outputs | Locked in CLAUDE.md; provider-agnostic; single source of truth for OpenAI + Gemini schemas |
| `openai` | latest | LLM calls (provider-agnostic via baseURL) | Locked in CLAUDE.md; DNA-proven adapter pattern |
| `tiktoken` | latest | Token counting for rolling window | Most accurate tokenizer for the model family; prevents silent context overflow |
| `@google/generative-ai` | latest | Gemini 2.5 Flash calls (when not using OpenAI adapter) | Default artifact model per CLAUDE.md |

### Package Legitimacy Audit

> This is a spec/planning phase — no packages are installed during this phase. The table below documents the libraries the AI-SPEC recommends for the build milestone.

| Package | Registry | Notes | Verdict | Disposition |
|---------|----------|-------|---------|-------------|
| `zod` | npm | Widely used schema validation library; locked in CLAUDE.md | [ASSUMED] OK | Approved (locked decision) |
| `openai` | npm | Official OpenAI Node.js SDK; locked in CLAUDE.md | [ASSUMED] OK | Approved (locked decision) |
| `tiktoken` | npm | OpenAI's official tokenizer library (open source) | [ASSUMED] OK | Approved |
| `@google/generative-ai` | npm | Official Google Generative AI SDK | [ASSUMED] OK | Approved |

**Packages removed due to SLOP verdict:** None

**Note:** No packages are installed in this planning phase. Package legitimacy verification with `npm view` and `gsd-tools query package-legitimacy check` must be performed at the start of the build milestone before any `npm install` commands.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting for rolling window | Character-length / word-count estimator | `tiktoken` npm package | Off-by-one errors in token estimation cause silent context overflow; only accurate tokenizer in JS ecosystem |
| JSON schema from Zod | Manual JSON Schema objects | `zod-to-json-schema` (for OpenAI) / `zod` native Gemini responseJsonSchema path | Manual schemas drift from Zod types; schema-from-Zod guarantees type safety |
| Faithfulness evaluation | Custom string-matching scorer | RAGAS-style LLM-as-judge metric | String matching misses semantic equivalence; LLM judge catches subtle distortions |
| Provider-specific LLM clients | Per-provider API wrappers | OpenAI SDK `baseURL` adapter (locked in CLAUDE.md) | Already proven in DNA; switching providers requires no code change |
| In-memory token store for cross-session embeddings | Custom vector search | `sqlite-vec` in SQLCipher DB (locked in RSCH-05, CLAUDE.md) | Eliminates separate vector service; encryption inherited; schema already designed |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSON mode (`response_format: {type: 'json_object'}`) | Strict Structured Outputs (`strict: true` + JSON schema) | OpenAI August 2024; Gemini 2.5 (full JSON Schema) | Schema adherence guaranteed at inference time, not just parse time — no more missing keys or wrong types |
| Narrative-only LLM summaries | Structured + cited extraction (quote-backed, Zod-validated) | Industry best practice evolution 2023–2025 | Eliminates uncited hallucinations; enables automated citation verification |
| Sliding window only for long context | Hybrid: rolling window + epoch summarization + sqlite-vec RAG | 2024 | Keeps recent verbatim context for quality + handles arbitrarily long meetings cost-effectively |
| Human-labeled eval datasets for faithfulness | LLM-as-judge (RAGAS-style) reference-free eval | RAGAS paper (EACL 2024) | Enables automated faithfulness evaluation without human annotation at scale |

**Deprecated/outdated:**
- JSON mode (`response_format: {type: 'json_object'}`): Still functional but does not guarantee schema adherence — use Structured Outputs with strict mode instead
- Character-based token estimation: Accurate to ~±20% at best; use `tiktoken` for production

---

## Environment Availability

> This is a planning/spec phase — no external services are called during plan execution. The build milestone will require these dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 24 LTS | tiktoken, zod, openai SDK | [ASSUMED] Yes (per DNA spike report — Node 26.3.1 detected) | 26.3.1 (exceeds 24 LTS requirement) | — |
| Gemini API (paid quota) | Artifact LLM calls | [ASSUMED] Unknown at planning time | — | OpenAI GPT-4o via same adapter |
| OpenAI API | text-embedding-3-small, structured outputs | [ASSUMED] Unknown at planning time | — | Gemini embedding for cross-meeting RAG |
| SQLCipher DB | Transcript/artifact persistence | Via better-sqlite3-multiple-ciphers | — | No fallback — required |

**Missing dependencies with no fallback:**
- SQLCipher DB — required for all persistence; no in-memory alternative for production

**Missing dependencies with fallback:**
- Gemini API → OpenAI via baseURL adapter (same code, different key/endpoint)
- OpenAI embedding → Ollama local model (privacy mode path)

---

## Open Questions

1. **Prompt engineering for the two-stage extraction protocol**
   - What we know: evidence extraction before content generation is the correct pattern; the Zod schema enforces citations
   - What's unclear: optimal prompt structure for the two stages — whether they run as two separate LLM calls or as a single call with chain-of-thought forcing quote extraction first
   - Recommendation: specify as two separate calls in the AI-SPEC (cleaner separation of concerns); collapse to one call only if latency is a problem in the build milestone

2. **Map-reduce chunk boundary at meeting start/end**
   - What we know: 5-min intervals are the map chunk unit
   - What's unclear: what happens if a meeting ends mid-interval (e.g., 43 minutes — the last interval is 3 minutes, not 5)
   - Recommendation: always process the final partial interval as a full map chunk; the reduce step handles deduplication

3. **LLM model for epoch compression vs. summary cards**
   - What we know: Gemini 2.5 Flash is the default artifact model (CLAUDE.md); cost is ~$0.30/$2.50 per M tokens
   - What's unclear: whether epoch compression uses the same model as summary cards, or a cheaper model (e.g., Gemini 2.5 Flash Lite) since epoch summaries are internal infrastructure, not user-facing
   - Recommendation: Gemini 2.5 Flash Lite for epoch compression (internal, cost-optimized); Gemini 2.5 Flash for summary cards (user-facing display) and end-of-meeting batch

4. **Faithfulness harness runner — standalone or integrated into build milestone CI**
   - What we know: harness is eval tooling, not production code
   - What's unclear: whether the harness should be a standalone script or integrated into the Vitest test suite
   - Recommendation: standalone TypeScript script (`eval/harness.ts`) runnable via `npx ts-node` — not part of the Vitest suite (different runtime characteristics, slower than unit tests, run separately)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CGFS threshold of 0.85 is appropriate for meeting artifact faithfulness | §Faithfulness Metric | If too strict, valid inference-based extractions are penalized; if too loose, hallucinations pass |
| A2 | EHR threshold of 0.05 (≤5% extrinsic hallucination) is achievable with two-stage extraction | §Faithfulness Metric | If not achievable with prompt engineering, the threshold must be revised or the protocol changed |
| A3 | 800K token rolling window ceiling is appropriate for Gemini 2.5 Flash 1M context | §Token Budget Analysis | If Gemini's effective context window is lower than advertised, epoch compression fires more frequently |
| A4 | 70% trigger (560K tokens) for epoch compression gives adequate headroom | §ContextEngine Architecture | If headroom is insufficient, compressor fires mid-meeting at an inconvenient time |
| A5 | Standard 1-hour meeting generates ~30-50K tokens | §Token Budget Analysis | If meetings are more verbose, the 800K ceiling is hit sooner |
| A6 | Two-stage extraction (evidence first, content second) prevents quote fabrication | §Quote-Backed Extraction Protocol | Model may still fabricate quotes in Stage 1 if not adequately constrained; adversarial eval will reveal this |
| A7 | `tiktoken` with `cl100k_base` is a good enough approximation for Gemini token counts | §Token Budget Analysis | Gemini may have a different tokenization that diverges from cl100k_base; may need provider-specific tokenizer |
| A8 | 60 synthetic adversarial transcripts are sufficient for v1 eval corpus | §Adversarial Test Corpus | If 60 transcripts are too few to catch rare failure modes, increase corpus in post-launch iteration |
| A9 | `text-embedding-3-small` (1536 dims, $0.02/1M tokens) is the right default embedding model | §Embedding Model Selection | If user has no OpenAI API key, the default fails; need fallback path at setup |
| A10 | Hybrid summary card format (bullets + speaker contributions) is consistent with MOM format | §5-Min Summary Card Schema | If end-of-meeting MOM format diverges significantly, cards look inconsistent in the meeting record |

---

## Sources

### Primary (HIGH confidence)
- None — no Context7 or official docs confirmed via tool this session (this is a spec/planning phase; core findings are from prior planning artifacts)

### Secondary (MEDIUM confidence)
- `.planning/phases/03-deep-research/03-RSCH-05-DATA-MODEL.md` — sqlite-vec schema, chunking strategy, KNN query pattern, DEC-02 compatibility [VERIFIED from planning artifact]
- `.planning/phases/03-deep-research/03-RSCH-02-REPORT.md` — diarization approach, speaker label model, Nova-3 capabilities [VERIFIED from planning artifact]
- `.planning/phases/03-deep-research/03-RSCH-04-SPIKE-REPORT.md` — AudioTee.js validated as recommended system audio capture path [VERIFIED from planning artifact]
- `.planning/phases/02-foundational-decisions-adrs/02-DEC-02-data-handling-privacy.md` — SQLCipher persistence, safeStorage, retention decisions [VERIFIED from planning artifact]
- `.claude/CLAUDE.md` — Gemini 2.5 Flash as default model ($0.30/$2.50 per M), OpenAI SDK baseURL adapter, Zod, 1M context window [VERIFIED from project instructions]

### Tertiary (LOW confidence)
- WebSearch: RAGAS faithfulness metric mechanics, thresholds (≥0.8 production standard), LLM-as-judge pattern [ASSUMED — websearch]
- WebSearch: context window management strategies (70-80% trigger, ConversationSummaryBufferMemory hybrid pattern) [ASSUMED — websearch]
- WebSearch: map-reduce summarization for long documents (map-per-chunk, reduce-aggregate) [ASSUMED — websearch]
- WebSearch: OpenAI Structured Outputs `strict: true`, Zod integration via `zodToJsonSchema` [ASSUMED — websearch]
- WebSearch: Gemini 2.5+ `responseJsonSchema` supports full JSON Schema [ASSUMED — websearch]
- WebSearch: adversarial transcript generation (GPT-4 generator + verifier pipeline, QMSum/FAME datasets) [ASSUMED — websearch]
- WebSearch: hallucination taxonomy (extrinsic vs intrinsic, attribution errors, entity errors) [ASSUMED — websearch]
- WebSearch: `text-embedding-3-small` — 1536 dims, $0.02/1M tokens [CITED: developers.openai.com/api/docs/models/text-embedding-3-small]

---

## Project Constraints (from CLAUDE.md)

| Constraint | Directive |
|------------|-----------|
| Platform | macOS-first; macOS APIs (NSWindowSharingNone, LSUIElement) |
| Persistence | `better-sqlite3-multiple-ciphers` (SQLCipher) + `safeStorage`; `electron-store` for prefs only |
| LLM layer | OpenAI SDK `baseURL` provider-agnostic adapter; Gemini 2.5 Flash as default artifact model |
| Structured outputs | Zod schemas shared across providers; strict mode (`response_format` / `responseSchema`) |
| Vector search | `sqlite-vec` in same SQLCipher DB; no separate vector service |
| STT | Deepgram Nova-3; `mip_opt_out=true` on all requests (RSCH-03 confirmed) |
| Gemini constraint | Paid quota only; free tier disqualified (DEC-02 RSCH-03 confirmed) |
| Privacy/consent | All-party consent default; no concealed recording; transcribe-then-delete-raw-audio default |
| Version control | Every artifact committed and pushed (Stop-hook auto-push) |
| Milestone scope | Discovery/PRD only; no application code this milestone |

---

## Metadata

**Confidence breakdown:**
- Faithfulness contract design: MEDIUM — locked decisions from CONTEXT.md are authoritative; specific threshold values (CGFS 0.85, EHR 0.05) are assumed
- ContextEngine architecture: MEDIUM — architecture follows locked decisions precisely; token budget calculations are assumed estimates
- Adversarial evaluation harness: LOW — corpus size, category counts, and passing bar are researcher judgment with no external validation
- Zod schema examples: MEDIUM — schema is derived from locked decisions; Zod/OpenAI/Gemini integration patterns are from websearch (LOW) but aligned with CLAUDE.md (MEDIUM)

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (30 days — stable planning domain; Gemini pricing and context window specs may change faster)
