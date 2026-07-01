# Phase 10: ContextEngine + Break Assist - Context

**Gathered:** 2026-06-28
**Status:** Ready for planning

<domain>
## Phase Boundary

The full ContextEngine stack is operational: `ContextEngine.ts` orchestrates `TokenMonitor`, `EpochCompressor`, and `ContextComposer`. `EpochCompressor` compresses the oldest transcript segments into `epoch_summaries` when the rolling window hits 560K tokens (70% of 800K ceiling), and the `EmbeddingAdapter` stores each epoch as a 1536-dim vector in `vec_chunks` using the Gemini text-embedding API. Break Assist completes end-to-end: `break_start_timestamp` is recorded on "Going on Break" and the digest (on "I'm Back") correctly filters `summary_cards` to those generated during the break window. A Vitest-based 60-minute synthetic test verifies that `EpochCompressor` fires exactly once at the 560K threshold without memory pressure.

Requirements: CTX-01 through CTX-06 (6 requirements).

</domain>

<decisions>
## Implementation Decisions

### Epoch Window Definition
- **D-01:** Epoch window is **token-count-based**. `TokenMonitor` counts tokens in `transcript_segments` via `tiktoken cl100k_base`. When the rolling window reaches **560,000 tokens** (70% of 800K ceiling), `EpochCompressor` fires.
- **D-02:** `EpochCompressor` compresses the **oldest segments first** (lowest timestamp). It evicts enough segments to bring the rolling window below 50% capacity. The exact N of segments to evict is determined by `TokenMonitor` at compression time — planner picks the implementation.
- **D-03:** Each epoch produces one `epoch_summaries` DB record in the **structured `EpochSummarySchema`** format defined in AI-SPEC §2.5: `epoch_id`, `decisions[]`, `action_items[]`, `key_points[]`, `speaker_contributions`. This is a Zod schema — use `zod-to-json-schema` to derive the LLM response schema (same pattern as Phase 8 `ArtifactPipeline`).
- **D-04:** `EpochCompressor` reads from `transcript_segments` ONLY — **never from `summary_cards`** (AI-SPEC §2.2 Pitfall 4, hardcoded constraint).

### Embedding Strategy
- **D-05:** Epoch embeddings use **Gemini text-embedding only** for v1. No OpenAI API key field added to SettingsPanel. The `EmbeddingAdapter` calls Gemini's text-embedding model via the same `openai` SDK + `baseURL` pattern used for LLM calls. Output dimension: **1536** (matches `vec_chunks float[1536]` schema). If Gemini doesn't natively output 1536 dims, use `output_dimensionality: 1536` parameter (researcher to confirm Gemini model name + parameter support).
- **D-06:** Each epoch summary is embedded as a **single concatenated text string** (all structured fields joined) → one vector per epoch stored in `vec_chunks`. The `text_preview` field in `vec_chunks` stores the epoch's `key_points` bullets.

### ContextComposer Scope
- **D-07:** `ContextComposer` is **v1 infrastructure for the v2 Live Assistant** — it is NOT wired into any active v1 user flow. It returns a `ContextWindow` (`rollingSegments[]` + `epochSummaries[]`) and is tested via the synthetic 60-minute Vitest test. The `ContextEnginePort` interface (`start(meetingId)`, `stop()`, `getContext(): ContextWindow`, `onEpochCompressed(cb)`) is implemented per ARCHITECTURE.md §6.8.
- **D-08:** `SummaryCardTimer` (Phase 9) is **NOT retrofitted** to go through `ContextComposer`. It continues to query `transcript_segments` directly for its 5-minute window. ArtifactPipeline (Phase 8) is also NOT touched.

### Break Assist Completion
- **D-09:** Break Assist stays at the **Phase 9 behavior** — `BreakAssistDigest` shows only summary cards from the break window, newest first. No LLM narrative digest call on "I'm Back". `ContextComposer` is NOT used for the break digest (it's infrastructure for the v2 Live Assistant).
- **D-10:** The break digest shows **cards-only always** — epoch summaries are NOT displayed to the user even if an epoch was compressed during the break. Epoch summaries are context engine infrastructure, not a display artifact.
- **D-11:** `break_start_timestamp` must be recorded in the `meetings` table (or held in-memory in `SessionManager`) when the user triggers "Going on Break", so `SummaryCardStore` can filter cards by `created_at >= break_start_timestamp` for the digest.

### 60-Minute Test
- **D-12:** The 60-minute test is a **Vitest unit test** in `src/main/context/__tests__/`. It seeds the DB with enough synthetic `transcript_segments` rows to reach 560K tokens, runs `ContextEngine`, and asserts: (a) `EpochCompressor` fires exactly once, (b) one `epoch_summaries` record is created, (c) one `vec_chunks` embedding is stored, (d) rolling window stays below 800K ceiling after compression.
- **D-13:** "60-minute" refers to simulated transcript volume (enough tokens to exceed the threshold), not real wall-clock time. The test uses synthetic segments with the minimum content needed to reach 560K tokens.

### Claude's Discretion
- **Gemini embedding model name + `output_dimensionality` parameter:** Researcher to confirm which Gemini embedding model supports 1536 dims via the openai SDK `baseURL` adapter (e.g., `text-embedding-004` with `dimensions: 1536`, or `gemini-embedding-exp-03-07`). The 1536-dim output must match `vec_chunks float[1536]` schema — no schema migration permitted.
- **Exact N of segments to evict in each epoch:** `TokenMonitor` calculates this at compression time to bring the rolling window below 50% capacity. Leave exact formula to planner.
- **`ContextEngine.ts` internal architecture:** How `ContextEngine` orchestrates `SummaryCardTimer` (already exists), `TokenMonitor`, `EpochCompressor`, and `ContextComposer`. Whether it subclasses or composes. Leave to planner per ARCHITECTURE.md §6.8.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 10: ContextEngine + Break Assist" — goal, 5 success criteria, CTX-01–CTX-06
- `.planning/REQUIREMENTS.md` §"ContextEngine + Break Assist" — CTX-01 through CTX-06 with full acceptance criteria text

### ContextEngine architecture (primary authority)
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` §2 — Full ContextEngine + Two-Speed Architecture spec; §2.2 Pitfall 4 (EpochCompressor must read transcript_segments ONLY); §2.5 Epoch Compression Protocol (560K threshold, oldest-first, EpochSummarySchema, embedding model); §2.3 Component overview diagram; §2.6 Speed 1 passive path; §2.7 Speed 2 Live Assistant context composition (v2 — infrastructure built in v1)
- `.planning/phases/04-ai-grounding-context-spec-ai-spec/04-AI-SPEC.md` §2.9 — Break Assist Digest spec (Break Assist is manual-trigger only; v1 = cards + no LLM narrative per Phase 9 Phase context D-11)

### Module map & interfaces
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` §6.8 — ContextEngine module (`src/main/context/`): `ContextEngine.ts`, `TokenMonitor.ts`, `EpochCompressor.ts`, `ContextComposer.ts`; `ContextWindow` interface; `ContextEnginePort` interface
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` §6.5 — EmbeddingAdapter (`src/main/context/` or `src/main/llm/`): 1536-dim Gemini embedding, `vec_chunks` write path
- `.planning/phases/05-prd-finalization/05-ARCHITECTURE.md` §5 DB DDL — `epoch_summaries` and `vec_chunks` table definitions; sqlite-vec `vec0` virtual table

### Zod schemas
- `src/shared/schemas/index.ts` — `EpochSummarySchema` (if already defined from Phase 8/9 or must be added); `SummaryCardSchema` (Phase 9, reused for digest window query)

### Phase 9 phase context (Break Assist decisions locked there)
- `.planning/phases/09-overlay-ui-live-summary-board/09-CONTEXT.md` — D-10 (Going on Break), D-11 (I'm Back → cards only, no LLM call), D-12 (empty break message). Phase 10 completes break_start_timestamp tracking to enable correct card window filtering; UI behavior is unchanged.

### Existing Phase 9 reusable assets
- `src/main/context/SummaryCardTimer.ts` — timer already in `context/`; Phase 10 `ContextEngine.ts` manages its lifecycle (start/stop tied to Capturing state)
- `src/main/store/SummaryCardStore.ts` — Phase 9; Phase 10 reads from it to filter cards for break digest window
- `src/main/llm/LLMAdapter.ts` — Phase 8 LLM adapter; `EpochCompressor` reuses for its structured LLM call
- `src/main/session/SessionManager.ts` — FSM already has OnBreak state; Phase 10 adds `break_start_timestamp` tracking in the `Capturing → OnBreak` transition
- `src/renderer/src/components/BreakAssistDigest.tsx` — Phase 9 component; Phase 10 may need to ensure it correctly filters to break-window cards (verify IPC payload includes correct timestamp filtering)

### Feature scope (v1 vs v2 boundary)
- `.planning/phases/05-prd-finalization/05-FEATURE-SPEC.md` §4.1 — Live Assistant interactive chat UI is **Deferred v2**; ContextEngine + ContextComposer are built as v1 infrastructure; RAG retrieval (vec_chunks semantic query) is v2 only

### Build order
- `.planning/phases/05-prd-finalization/05-BUILD-ORDER.md` §"Phase 10" — acceptance criteria, success criteria #1–5, performance requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/main/context/SummaryCardTimer.ts` — already in `context/`; Phase 10 `ContextEngine.ts` wraps it and manages its start/stop lifecycle
- `src/main/llm/LLMAdapter.ts` — `EpochCompressor` calls this for its structured LLM call (same as Phase 8/9 pattern); pass `EpochSummarySchema` as the Zod schema
- `src/main/store/db.ts` — `epoch_summaries` and `vec_chunks` DDL already present; Phase 10 writes to both
- `src/main/session/SessionManager.ts` — add `break_start_timestamp` field to FSM state on `Capturing → OnBreak` transition
- `src/renderer/src/components/BreakAssistDigest.tsx` — renderer component from Phase 9; verify IPC push from main includes only cards with `created_at >= break_start_timestamp`
- `tiktoken` — already in deps from prior phases; `cl100k_base` encoding for `TokenMonitor`

### Established Patterns
- **Main process owns all LLM/DB/context logic:** `ContextEngine`, `TokenMonitor`, `EpochCompressor`, `ContextComposer`, and `EmbeddingAdapter` all live in `src/main/context/`. No context logic in the renderer.
- **Zod schemas as single source of truth:** `EpochSummarySchema` must be defined in `src/shared/schemas/index.ts`; use `zod-to-json-schema` to derive the LLM structured output schema. Never hand-author JSON schema.
- **openai SDK + baseURL for both LLM and embedding calls:** Same adapter pattern as Phase 8/9; Gemini embedding is called via the same SDK.
- **transcript_segments is the only source of truth for context:** Both `SummaryCardTimer` (Phase 9, D-01) and `EpochCompressor` (Phase 10, D-04) read from `transcript_segments`. This constraint is a hard invariant — enforce in code review and tests.
- **IPC push model:** ContextEngine pushes `epoch-compressed` event to renderer (if needed for UI feedback). Pattern mirrors `summary-card-ready`.

### Integration Points
- `src/main/index.ts` — wire `ContextEngine.start(meetingId)` on `PreCapture → Capturing` FSM transition; `ContextEngine.stop()` on `Capturing → Complete`; record `break_start_timestamp` on `Capturing → OnBreak` IPC handler
- `src/main/session/SessionManager.ts` — extend `OnBreak` state entry action to capture `Date.now()` as `break_start_timestamp`; pass to IPC handler so main can filter cards for digest
- `src/preload/index.ts` — add `epoch-compressed` listen channel if renderer needs epoch feedback (verify against existing 18-channel allowlist in ARCHITECTURE.md §7)

</code_context>

<specifics>
## Specific Ideas

- **EpochCompressor is a rare-path correctness safeguard.** Per AI-SPEC §2.4: typical 60-minute meetings produce ~24,000 tokens (130 WPM × 2 speakers × 60 min). The 560K threshold fires only in pathological 40+ hour meetings. The Vitest test uses a synthetic fixture (seeded with enough rows to reach 560K artificially) — not real audio.
- **ContextComposer is infrastructure only in v1.** It is built and tested via the Vitest synthetic test (`getContext()` returns a valid `ContextWindow`), but is not called by any v1 user-facing flow. The v2 Live Assistant chat UI is the first production consumer.
- **Break digest window correctness:** `break_start_timestamp` must be recorded at the instant the user presses "Going on Break" (not when the FSM state change completes). Filter: `summary_cards WHERE created_at >= break_start_timestamp AND created_at <= end_break_timestamp`. This is the fix that completes CTX-04 end-to-end.

</specifics>

<deferred>
## Deferred Ideas

- **RAG retrieval (vec_chunks semantic search):** vec_chunks is populated with epoch embeddings in Phase 10, but semantic retrieval queries are v2 (Live Assistant chat UI). The v2 work is the `ContextComposer` retrieval path and the Live Assistant hotkey trigger — not the DB schema or embedding storage.
- **"While you were away" LLM narrative digest:** AI-SPEC §2.9 describes a narrative LLM call that assembles transcript_segments + summary_cards from the break window into a TL;DR. This is v2 when the Live Assistant ContextComposer is wired into user-facing flows. Phase 10 keeps the Phase 9 behavior (cards only, no LLM narrative).
- **Cross-meeting search UX:** sqlite-vec DB schema and epoch embeddings are v1 infrastructure. The search UX querying across past meetings is post-launch v2.

</deferred>

---

*Phase: 10-ContextEngine + Break Assist*
*Context gathered: 2026-06-28*
