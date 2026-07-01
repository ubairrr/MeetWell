---
phase: 10-contextengine-break-assist
plan: "05"
subsystem: context-engine
tags:
  - context-engine
  - wiring
  - token-usage
  - session-lifecycle
dependency_graph:
  requires:
    - 10-04  # ContextEngine class
    - 10-02  # EmbeddingAdapter
  provides:
    - live ContextEngine session start/stop wired to SessionManager FSM
    - per-session token usage summary printed on session end
  affects:
    - src/main/index.ts
    - src/main/llm/LLMAdapter.ts
    - src/main/llm/EmbeddingAdapter.ts
tech_stack:
  added: []
  patterns:
    - optional onUsage callback pattern for LLM/embedding adapters
    - tokenAccumulator Map for cross-adapter usage aggregation
key_files:
  created: []
  modified:
    - src/main/index.ts
    - src/main/llm/LLMAdapter.ts
    - src/main/llm/EmbeddingAdapter.ts
decisions:
  - D-08: SummaryCardTimer lifecycle now owned exclusively by ContextEngine; index.ts does not hold a direct SummaryCardTimer reference
  - D-11: breakStartMs tracking and start-break handler unchanged — in-memory timestamp already correct
  - D-09: end-break handler unchanged — cards-only digest, ContextComposer not used
metrics:
  duration: "~15 minutes"
  completed: "2026-06-28T04:26:11Z"
  tasks_completed: 2
  files_modified: 3
status: complete
---

# Phase 10 Plan 05: ContextEngine Wiring Summary

ContextEngine wired into src/main/index.ts — SummaryCardTimer replaced, full context stack active during every meeting session, and per-session token usage summary added.

## What Was Built

### Task 1: Replace SummaryCardTimer with ContextEngine (ffddc35)

Five targeted edits to `src/main/index.ts`:

1. Removed `import { SummaryCardTimer }` — replaced with `import { ContextEngine }` and `import { EmbeddingAdapter }`
2. Removed `new SummaryCardTimer(db!, win!, summaryCardStore, llmAdapter)` — replaced with:
   - `const embeddingAdapter = new EmbeddingAdapter(geminiApiKey)`
   - `const contextEngine = new ContextEngine(db!, win!, summaryCardStore, llmAdapter, embeddingAdapter)`
3. `summaryCardTimer.start(currentMeetingId)` → `contextEngine.start(currentMeetingId)` inside the `Capturing && previous !== 'OnBreak'` guard (CTX-05 invariant preserved)
4. `summaryCardTimer.stop()` in Processing entry → `contextEngine.stop()`
5. `summaryCardTimer.stop()` in Idle entry → `contextEngine.stop()`

Break assist handlers (`breakStartMs` declaration, `start-break` handler, `end-break` handler) were not touched — verified 4 `breakStartMs` references remain.

### Task 2: Session token usage summary (fdb9f2d)

**LLMAdapter.ts:** Added optional `onUsage?: (model: string, inputTokens: number, outputTokens: number) => void` constructor parameter. Called after `generate()` (using `completion.usage.prompt_tokens / completion_tokens`) and after `stream()` (using `stream.finalChatCompletion().usage`).

**EmbeddingAdapter.ts:** Added same optional `onUsage` constructor parameter. Called after `embed()` using `response.usage.prompt_tokens ?? 0` with `0` for output tokens (embeddings have no output tokens). Skipped if `response.usage` is absent.

**index.ts additions:**
- `tokenAccumulator: Map<string, { input: number; output: number }>` at module scope
- `accumulateUsage(model, input, output)` — accumulates into Map
- `printTokenSummary()` — logs table if accumulator non-empty, then clears it
- Both `LLMAdapter` and `EmbeddingAdapter` constructors now receive `accumulateUsage` as third argument (using `undefined` for baseURL to preserve default)
- `printTokenSummary()` called as first statement in `Idle` state handler, before `contextEngine.stop()`

## Verification Results

| Check | Result |
|-------|--------|
| `tsc --noEmit` exits 0 | PASS |
| `npm run build` exits 0 | PASS |
| `SummaryCardTimer` count in index.ts == 0 | 0 |
| `ContextEngine` count in index.ts >= 2 | 2 |
| `contextEngine.start` count >= 1 | 1 |
| `contextEngine.stop` count >= 2 | 2 |
| `breakStartMs` count >= 2 | 4 |
| `EmbeddingAdapter` count in index.ts >= 2 | 2 |
| `printTokenSummary` count >= 2 | 2 |
| `onUsage` count in LLMAdapter.ts >= 1 | 5 |
| `onUsage` count in EmbeddingAdapter.ts >= 1 | 4 |

## Deviations from Plan

### Auto-added: stream() token reporting in LLMAdapter

The plan specified adding onUsage to `generate()` only. The `stream()` method also makes LLM calls and omitting it would silently miss tokens from any streaming usage. Added `stream.finalChatCompletion().usage` reporting after the streaming loop completes. This is a Rule 2 auto-add (correctness — the token summary would be incomplete without it).

Otherwise plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundary changes introduced. The `onUsage` callback is a pure in-process accumulator with no external exposure. No threat flags.

## Self-Check: PASSED

- `src/main/index.ts` modified and committed at ffddc35 and fdb9f2d
- `src/main/llm/LLMAdapter.ts` modified and committed at fdb9f2d
- `src/main/llm/EmbeddingAdapter.ts` modified and committed at fdb9f2d
- Both commits present in git log
- tsc --noEmit clean, npm run build clean
