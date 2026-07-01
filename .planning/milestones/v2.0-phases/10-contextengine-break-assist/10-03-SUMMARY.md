---
phase: 10-contextengine-break-assist
plan: "03"
subsystem: context-engine
status: complete
tags:
  - context-engine
  - epoch-compression
  - tiktoken
  - llm
  - embedding
  - vec-chunks
  - tdd

dependency_graph:
  requires:
    - src/main/context/RollingWindow.ts (10-01 — markEvicted + getCoveredUntil)
    - src/main/llm/EmbeddingAdapter.ts (10-02 — embed() returns Float32Array(1536))
    - src/shared/schemas/index.ts (10-01 — EpochSummarySchema + StoredEpochSummary)
    - src/main/llm/LLMAdapter.ts (Phase 8 — generate() structured output)
    - transcript_segments table (DB DDL — sole data source)
    - epoch_summaries table (DB DDL — write target)
    - vec_chunks virtual table (DB DDL — embedding write target)
  provides:
    - src/main/context/EpochCompressor.ts (consumed by ContextEngine in 10-04)
    - compress(meetingId, currentTokenCount, rollingWindow) — full compression pipeline
  affects:
    - epoch_summaries (inserts one row per compression call)
    - vec_chunks (inserts one embedding row per compression call)
    - RollingWindow watermark (advances via markEvicted after each compression)

tech_stack:
  added: []
  patterns:
    - Single-encoder tiktoken pass with enc.free() in finally (T-10-01-A pattern)
    - try/catch around Steps 3–6 — compression failure cannot crash the meeting session
    - Float32Array direct insert into sqlite-vec vec0 virtual table
    - LLMAdapter structured output with Zod schema validation before DB write (T-10-03-A)
    - Dimension assertion (vector.length !== 1536) as secondary guard (T-10-03-B)
    - Data-source invariant: transcript_segments is the sole SELECT target (D-04, AI-SPEC §2.2 Pitfall 4)

key_files:
  created:
    - src/main/context/EpochCompressor.ts
  modified: []

decisions:
  - "Wrap Steps 3–6 (LLM, DB, embed) in try/catch returning null on failure — compression failure must not crash the meeting session per CLAUDE.md constraint"
  - "Block comment text avoids 'summary_cards' string literal to keep data-source invariant grep gate clean (grep -v '^\s*//' does not strip block comment lines)"
  - "accumulatedTokens from tiktoken pass is reused for token_count_compressed DB column — no re-encoding (plan D-02)"
  - "Float32Array copy (new Float32Array(vector)) passed to vec_chunks INSERT per plan specification, though EmbeddingAdapter already returns Float32Array"

metrics:
  duration: "~4 minutes"
  completed: "2026-06-28"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 10 Plan 03: EpochCompressor Summary

**One-liner:** EpochCompressor.compress() — tiktoken-gated oldest-segment eviction, LLM structured summarization, epoch_summaries + vec_chunks writes, RollingWindow watermark advance.

## What Was Built

`src/main/context/EpochCompressor.ts` — the core compression engine of the ContextEngine (D-01, D-02, D-04).

### Architecture

EpochCompressor is a stateless class (all state lives in RollingWindow and the DB) with a single public async method:

```typescript
compress(meetingId: string, currentTokenCount: number, rollingWindow: RollingWindow): Promise<StoredEpochSummary | null>
```

### Step-by-step Compression Pipeline

**Step 1 — Data-source invariant (D-04, AI-SPEC §2.2 Pitfall 4)**

Queries `transcript_segments WHERE meeting_id = ? AND timestamp_start > rollingWindow.getCoveredUntil() ORDER BY timestamp_start ASC`. This is the only SELECT in the method. Zero references to `summary_cards` or any display-artifact table in non-comment source lines — the data-source invariant is structurally enforced.

**Step 2 — Eviction target calculation**

`tokensToEvict = currentTokenCount - TARGET_TOKEN_FLOOR (400_000)`. Single tiktoken `cl100k_base` encoder created once; walks oldest segments accumulating token counts until `accumulatedTokens >= tokensToEvict`. `enc.free()` called in `finally` block — prevents WASM memory accumulation (T-10-01-A pattern from TokenMonitor). Returns `null` immediately if `toCompress` is empty.

**Steps 3–6 — LLM + DB + Embed + Watermark (wrapped in try/catch)**

- **Step 3:** Calls `LLMAdapter.generate(EpochSummarySchema, ...)` with structured output. Zod schema validation at LLM response parse time prevents DB corruption from malformed responses (T-10-03-A mitigation).
- **Step 4:** Writes exactly one `epoch_summaries` row via parameterised INSERT. Array/object fields serialised as JSON strings. `token_count_compressed` reuses `accumulatedTokens` from Step 2 — no re-encoding.
- **Step 5:** Concatenates `decisions + action_items + key_points` → calls `EmbeddingAdapter.embed()` → asserts `vector.length === 1536` (secondary guard against model dimension changes, T-10-03-B) → writes exactly one `vec_chunks` row via parameterised INSERT passing `new Float32Array(vector)` as the embedding blob.
- **Step 6:** Calls `rollingWindow.markEvicted(coveredEnd)` to advance the watermark. Returns `StoredEpochSummary` built from INSERT values (avoids round-trip SELECT).

If any step throws, the catch logs `[EpochCompressor] compression failed — session continues` and returns `null`.

### Constants

- `TARGET_TOKEN_FLOOR = 400_000` — 50% of 800K ceiling (D-02); evict oldest segments to bring remaining count below this
- `EPOCH_SYSTEM_PROMPT` — instructs LLM to extract decisions, action_items, key_points, speaker_attributions from explicit transcript content only (T-10-03-D prompt injection mitigation)

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript compile | `npx tsc --noEmit --project tsconfig.node.json` | 0 errors from EpochCompressor.ts (pre-existing errors in other files unchanged) |
| Data-source invariant | `grep -v '^\s*//' EpochCompressor.ts \| grep -c 'summary_cards'` | **0** — PASS |
| transcript_segments queried | `grep -c 'transcript_segments' EpochCompressor.ts` | **6** — PASS |
| epoch_summaries written | `grep -c 'epoch_summaries' EpochCompressor.ts` | **4** — PASS |
| vec_chunks written | `grep -c 'vec_chunks' EpochCompressor.ts` | **6** — PASS |
| markEvicted called | `grep -c 'markEvicted' EpochCompressor.ts` | **3** — PASS |
| enc.free called | `grep -c 'enc.free' EpochCompressor.ts` | **2** (try + finally) — PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Verification gate] Block comment text avoids `summary_cards` literal**

- **Found during:** Post-implementation verification (Check 1 initially failed)
- **Issue:** The data-source invariant gate (`grep -v '^\s*//'`) only strips `//` lines, not block comment lines starting with ` * `. The JSDoc for `TranscriptRow` originally contained `Never query summary_cards or any other display-artifact table` — a false positive that caused the gate to fail.
- **Fix:** Rephrased to `Never query display-artifact tables (epoch display artifacts, card tables)` — the intent and protection are preserved without the triggering literal.
- **Files modified:** `src/main/context/EpochCompressor.ts` (line 44 of JSDoc only)

None of the plan's structural requirements changed.

## Known Stubs

None. EpochCompressor.ts is a complete implementation. It is not yet wired into a calling class — that wiring is ContextEngine's responsibility in Plan 10-04.

## Threat Surface Scan

All four threat items from the plan's STRIDE register are mitigated by the implementation:

| Threat ID | Mitigation Applied |
|-----------|--------------------|
| T-10-03-A (Tampering — LLM response → epoch_summaries) | EpochSummarySchema Zod validation in LLMAdapter.generate() before DB write |
| T-10-03-B (Tampering — vec_chunks INSERT) | `vector.length !== 1536` assertion before INSERT |
| T-10-03-C (Information Disclosure — transcript → Gemini) | Gemini paid plan constraint from Phase 8 LLMAdapter; safeStorage key management |
| T-10-03-D (Tampering — prompt injection via transcript) | Transcript content in user role only; system prompt holds instructions; structured output schema rejects free-form injection |

No new threat surface beyond what was scoped in the plan.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `78228fc` | feat | implement EpochCompressor — LLM compression, epoch_summaries write, vec_chunks embed |

## Self-Check: PASSED
