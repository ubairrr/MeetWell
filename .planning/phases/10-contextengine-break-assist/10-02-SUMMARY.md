---
phase: 10-contextengine-break-assist
plan: "02"
subsystem: llm
tags: [embedding, gemini, openai-sdk, vector, float32array]
status: complete

dependency_graph:
  requires:
    - openai SDK (Phase 8 — already installed)
  provides:
    - src/main/llm/EmbeddingAdapter (imported by EpochCompressor 10-03, ContextEngine 10-04)
  affects:
    - vec_chunks INSERT path (dimension guard prevents schema corruption)

tech_stack:
  added: []
  patterns:
    - openai SDK via baseURL adapter to Gemini embedding endpoint (same pattern as LLMAdapter)
    - Constructor injection for test mocking (apiKey + optional baseURL)

key_files:
  created:
    - src/main/llm/EmbeddingAdapter.ts
  modified: []

decisions:
  - "gemini-embedding-001 with dimensions:1536 confirmed as the only working call shape (Attempt 4)"
  - "Float32Array return type chosen for direct compatibility with sqlite-vec INSERT"
  - "EmbeddingDimensionError thrown on length mismatch — guards T-10-02-B (vec_chunks schema corruption)"

metrics:
  duration: "continuation agent — Task 2 only (Task 1 was a blocking checkpoint)"
  completed: "2026-06-28"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 10 Plan 02: EmbeddingAdapter Summary

EmbeddingAdapter implemented: Gemini text-embedding via openai SDK baseURL adapter, producing verified 1536-dim Float32Array with dimension assertion guard.

## What Was Built

`src/main/llm/EmbeddingAdapter.ts` — a single-responsibility module that converts text to a 1536-dimensional `Float32Array` via the Gemini `gemini-embedding-001` model, using the same openai SDK + baseURL adapter pattern as `LLMAdapter`.

### Confirmed Call Shape (from human probe)

The checkpoint (Task 1) verified that only one call shape out of five attempts produces 1536 dimensions:

| Attempt | Model | Parameter | Result |
|---------|-------|-----------|--------|
| 1 | text-embedding-004 | dimensions: 1536 | FAILED — model not found |
| 2 | text-embedding-004 | extra_body | FAILED — unknown field |
| 3 | gemini-embedding-001 | (default) | FAILED — returns 3072 dims |
| 4 | gemini-embedding-001 | dimensions: 1536 | **PASS — returns exactly 1536** |
| 5 | gemini-embedding-001 | extra_body | FAILED — unknown field |

Implementation uses Attempt 4: `client.embeddings.create({ model: 'gemini-embedding-001', input: text, dimensions: 1536 })`.

### Key Design Decisions

- **Constructor injection:** `(apiKey: string, baseURL?: string)` — downstream tests (10-06) can inject a mock baseURL without a real API key.
- **Dimension assertion:** `embedding.length !== 1536` throws `EmbeddingDimensionError` before returning — prevents silent model changes from corrupting the `vec_chunks` virtual table schema (T-10-02-B).
- **Float32Array return:** Direct float array compatible with `sqlite-vec` binary INSERT format.
- **No chunking in embed():** Per D-06, callers concatenate all epoch fields before calling; this method is a pure text→vector converter.
- **No Electron imports:** Pure Node module — runnable in tests without an Electron environment.

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c 'Float32Array' EmbeddingAdapter.ts` | 3 (declaration, assertion, return) |
| `grep -c '1536' EmbeddingAdapter.ts` | 3 (constant, dimensions param, assertion) |
| `grep -c 'electron' EmbeddingAdapter.ts` | 0 |
| tsc errors from EmbeddingAdapter.ts | 0 |

Note: `npx tsc --noEmit --project tsconfig.node.json` exits with code 2 due to **pre-existing errors** in `CaptureService.ts`, `DeepgramClient.ts`, `index.ts`, `ArtifactPipeline.ts`, and `TranscriptStore.ts`. None are caused by this plan's changes. These are logged as deferred items.

## Commits

| Hash | Description |
|------|-------------|
| 6ed49cc | feat(10-02): implement EmbeddingAdapter with gemini-embedding-001 dimensions:1536 |

## Deviations from Plan

None — plan executed exactly as written. The checkpoint resolved before this agent ran; Task 2 implemented the confirmed call shape without modification.

## Known Stubs

None — EmbeddingAdapter.ts is a complete, wired implementation with no placeholder values.

## Threat Surface Scan

No new network endpoints beyond the Gemini embedding API already scoped in the plan's threat model (T-10-02-A, T-10-02-B, T-10-02-C). No new auth paths, file access patterns, or schema changes at trust boundaries introduced by this plan.

## Deferred Items (pre-existing, out of scope)

Pre-existing TypeScript errors in unrelated files noted for awareness:
- `src/main/capture/CaptureService.ts` — unused `db` property
- `src/main/capture/DeepgramClient.ts` — missing module + boolean/string type mismatch
- `src/main/index.ts` — `app.dock` possibly undefined + unused variable
- `src/main/pipeline/ArtifactPipeline.ts` — `is_calendar_event` optional vs required mismatch
- `src/main/transcript/TranscriptStore.ts` — unused `db` property

These existed before this plan and are not caused by `EmbeddingAdapter.ts`.

## Self-Check: PASSED

- [x] `src/main/llm/EmbeddingAdapter.ts` exists and was committed (6ed49cc)
- [x] Float32Array used (3 occurrences)
- [x] 1536 appears 3 times (constant + dimensions param + assertion)
- [x] No electron imports
- [x] Constructor accepts (apiKey, baseURL?)
- [x] No STATE.md or ROADMAP.md modifications
