# Phase 8: ArtifactPipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 8-ArtifactPipeline
**Areas discussed:** Artifact parallelization, ArtifactReview UI scope, Pipeline ↔ FSM integration, CitationValidator implementation

---

## Artifact parallelization

### Stage 2 generation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 4 parallel LLM calls (Recommended) | Each artifact type gets its own Stage 2 call; Promise.all; faster wall-clock, per-artifact retry | ✓ |
| 1 combined LLM call | Single Stage 2 call returns all 4 types; simpler but single failure retries everything | |
| Sequential | One artifact at a time; slowest; only useful if one artifact depends on another | |

**User's choice:** 4 parallel LLM calls (Recommended)
**Notes:** Selected recommended option; enables per-artifact retry and keeps within 120-second budget.

### Stage 1 transcript handling

| Option | Description | Selected |
|--------|-------------|----------|
| Full transcript in one Stage 1 call (Recommended) | Gemini 2.5 Flash 1M context window handles 30-min meetings (~8-15k tokens) | ✓ |
| Chunked Stage 1 (windowed passes) | Break transcript into windows; more complex; only needed near token limits | |
| You decide | Leave to researcher based on tiktoken counts | |

**User's choice:** Full transcript in one Stage 1 call
**Notes:** Simple and correct given Gemini's context window; no chunking needed for v1.

### API key location

| Option | Description | Selected |
|--------|-------------|----------|
| .env → GEMINI_API_KEY (Recommended) | Same pattern as DEEPGRAM_API_KEY; Vite loadEnv; process.env in main process | ✓ |
| electron-store settings panel | User enters in settings UI; better UX but settings panel is Phase 9 | |
| Hardcoded for Phase 8, settings in Phase 9 | .env now; settings panel replaces for end users later | |

**User's choice:** .env → GEMINI_API_KEY
**Notes:** Consistent with established DEEPGRAM_API_KEY pattern; settings UX deferred to Phase 9.

---

## ArtifactReview UI scope

### UI completeness

| Option | Description | Selected |
|--------|-------------|----------|
| Functional skeleton — confirm/dismiss + Verify toggle only (Recommended) | Grouped list, Verify toggle, confirm/dismiss. Phase 9 polishes. | ✓ |
| Fully polished review panel | Match PRD visual design now; Phase 9 may redo anyway | |
| Headless / tests only | No renderer UI; ArtifactReview in Phase 9 entirely; misses ART-08/09 acceptance criteria | |

**User's choice:** Functional skeleton
**Notes:** Sufficient to satisfy ART-08/09; Phase 9 redesigns the full overlay anyway.

### Edit interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Inline textarea on the item (Recommended) | Click to edit, textarea appears, save button; simple; no modal | ✓ |
| Modal dialog | More room for MOM content; better for Phase 9 | |
| Defer edit to Phase 9 | Confirm/dismiss only in Phase 8; edit ships later | |

**User's choice:** Inline textarea on the item
**Notes:** Simple, sufficient for Phase 8 functional skeleton.

---

## Pipeline ↔ FSM integration

### Artifact delivery model

| Option | Description | Selected |
|--------|-------------|----------|
| Batch: all proposals pushed at once when pipeline finishes (Recommended) | Wait for all 4 parallel calls, push artifact-proposals-ready, then pipeline-complete | ✓ |
| Streaming: push each artifact type as it completes | Better UX but complex renderer state management; Phase 9 redesigns overlay anyway | |
| You decide | Leave to planner based on IPC channel design | |

**User's choice:** Batch — all proposals at once
**Notes:** Clean single-event model; streaming complexity not justified for Phase 8 skeleton UI.

### Error handling

| Option | Description | Selected |
|--------|-------------|----------|
| Fire pipeline-complete anyway, show empty review with error banner (Recommended) | FSM always advances to Complete; transcript is safe; user sees error message | ✓ |
| New FSM state: Error | Architecturally pure but adds complexity for a rare path | |
| Retry silently up to 3 times, then fail with banner | Whole pipeline retries before error; adds delay but increases success rate | |

**User's choice:** Fire pipeline-complete anyway, show error banner
**Notes:** Transcript safety is the priority; FSM simplicity preserved; no new states needed.

---

## CitationValidator implementation

### Similarity algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| Word token intersection / union (Jaccard) (Recommended) | Lowercase word tokens; |intersection|/|union| ≥ 0.90; pure TypeScript; no library | ✓ |
| Python SequenceMatcher ratio | Longest common subsequence; better for direct substrings; penalizes word-order changes | |
| Exact substring match | Strictest; rejects valid extractions that rephrase slightly | |

**User's choice:** Jaccard word token similarity
**Notes:** Handles paraphrased quotes; simple implementation; no dependency.

### Retry policy on validation failure

| Option | Description | Selected |
|--------|-------------|----------|
| Retry that item's Stage 2 call up to 2 times, then drop the item (Recommended) | Per-item retry; keeps working artifacts; log drops for eval harness | ✓ |
| Retry the full pipeline from Stage 2 | One failing item triggers full Stage 2 retry; expensive | |
| Include the item but mark it unverified | Show with 'unverified' badge; violates faithfulness contract | |

**User's choice:** Per-item retry, 2 attempts, then drop
**Notes:** Preserves faithfulness contract; dropped items logged for CGFS/EHR analysis in Phase 11.

---

## Claude's Discretion

- **Specific LLM prompt design:** Stage 1 (quote extraction) and Stage 2 (artifact generation constrained to Stage 1 quotes) prompt engineering left to researcher/planner. Constraint must be explicit in prompt.
- **Gemini structured output format:** Whether to use `response_mime_type: 'application/json'` + `response_schema` or OpenAI SDK `json_schema` format via `baseURL` — researcher to confirm for Gemini 2.5 Flash.
- **tiktoken encoding:** `cl100k_base` as conservative estimate for Gemini 2.5 Flash token counting; researcher to confirm or use as-is.

## Deferred Ideas

- **Streaming artifact delivery** — incremental push as each Stage 2 call completes; deferred to Phase 9 overlay redesign.
- **Action items without due dates in .ics** — sophisticated handling; Phase 8 skips undated items; v2 enhancement.
- **Named speaker attribution in artifacts** — "Speaker 1/2/3" → real names; v2 feature.
- **Eval corpus seeding** — building test fixtures in Phase 8 to reduce Phase 11 risk; noted as advisable but left to researcher recommendation.
