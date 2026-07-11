---
phase: 10-contextengine-break-assist
plan: "04"
subsystem: context-engine
status: complete
tags:
  - context-engine
  - context-composer
  - context-window
  - orchestrator
  - tdd

dependency_graph:
  requires:
    - src/main/context/RollingWindow.ts (10-01 — getCoveredUntil + reset)
    - src/main/context/TokenMonitor.ts (10-01 — start/stop polling)
    - src/main/context/EpochCompressor.ts (10-03 — compress() pipeline)
    - src/main/context/SummaryCardTimer.ts (Phase 9 — lifecycle managed here)
    - src/main/llm/EmbeddingAdapter.ts (10-02 — passed to EpochCompressor)
    - src/shared/schemas/index.ts (10-01 — StoredEpochSummary interface)
    - better-sqlite3-multiple-ciphers (pre-existing — passed to sub-constructors)
    - electron BrowserWindow (pre-existing — passed to SummaryCardTimer)
  provides:
    - src/main/context/ContextComposer.ts — getContext() DB read layer
    - src/main/context/ContextEngine.ts — ContextEnginePort orchestrator
    - ContextWindow interface (consumed by 10-06 60-minute test + v2 Live Assistant)
    - ContextEnginePort interface (consumed by index.ts wiring in 10-05)
  affects:
    - src/main/context/ (two new modules added; 6 modules now in directory)
    - 10-05: index.ts will call ContextEngine.start/stop instead of SummaryCardTimer directly

tech_stack:
  added: []
  patterns:
    - TDD red/green per task with per-task commits
    - vi.hoisted() + vi.mock() pattern for sub-module dependency injection in tests
    - SQL-matching mock DB (vi.fn().mockImplementation SQL string dispatch)
    - Idempotency guard in start() to prevent duplicate TokenMonitor intervals (T-10-04-A)
    - onThreshold async callback with try/catch — compression failure cannot crash session
    - Pure synchronous DB read utility pattern (ContextComposer has no side effects)

key_files:
  created:
    - src/main/context/ContextComposer.ts
    - src/main/context/ContextEngine.ts
    - src/main/context/__tests__/ContextComposer.test.ts
    - src/main/context/__tests__/ContextEngine.test.ts

decisions:
  - "ContextComposer uses SQL-string dispatch in mock (not call-order-sensitive mockReturnValueOnce) for robustness"
  - "ContextEngine constructor does not use 'private readonly db' shorthand — db is passed to sub-constructors but not stored as a class property; avoids TS6138 unused-property error"
  - "ContextEnginePort is imported as a type only in the test file (not used at runtime); named export remains in ContextEngine.ts for index.ts wiring in 10-05"
  - "onThreshold callback captures meetingId by closure (not this.currentMeetingId) — safe because TokenMonitor.stop() clears the interval before stop() resets currentMeetingId"

metrics:
  duration: "~4 minutes"
  completed: "2026-06-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Phase 10 Plan 04: ContextComposer + ContextEngine Summary

**One-liner:** ContextComposer synchronous DB read layer assembling rollingSegments + epochSummaries, and ContextEngine orchestrator managing SummaryCardTimer + TokenMonitor + EpochCompressor + ContextComposer lifetimes — full ContextEngine stack ready for index.ts wiring.

## What Was Built

Two new modules completing the Phase 10 ContextEngine stack, implemented with TDD (RED commit → GREEN commit per task):

### Task 1: ContextComposer (src/main/context/ContextComposer.ts)

DB-query layer that assembles a `ContextWindow` from two synchronous SELECT calls:

**Exported interfaces:**
- `TranscriptSegmentRow`: `{ id, meeting_id, speaker_label, channel, timestamp_start, timestamp_end, text }`
- `ContextWindow`: `{ rollingSegments: TranscriptSegmentRow[], epochSummaries: StoredEpochSummary[] }`

**Method: `getContext(meetingId: string, coveredUntil: number = 0): ContextWindow`**

- **Query 1 — rolling segments:** `SELECT ... FROM transcript_segments WHERE meeting_id = ? AND timestamp_start > ? ORDER BY timestamp_start ASC`. Only returns segments not yet compressed (after the RollingWindow watermark).
- **Query 2 — epoch summaries:** `SELECT ... FROM epoch_summaries WHERE meeting_id = ? ORDER BY covered_interval_start ASC`. Returns ALL epochs for the meeting (no coveredUntil filter). Maps `_json` columns via `JSON.parse()` to produce `StoredEpochSummary` with typed arrays/records.

**Design constraint (D-07):** ContextComposer is v1 infrastructure only. It has no side effects, fires no timers, touches no IPC, and pushes nothing to the renderer. The v2 Live Assistant chat UI is the first production consumer.

### Task 2: ContextEngine (src/main/context/ContextEngine.ts)

Orchestrator that creates and manages all four context subsystem lifetimes:

**Exported interface:**
```typescript
export interface ContextEnginePort {
  start(meetingId: string): void
  stop(): void
  getContext(): ContextWindow | null
  onEpochCompressed(cb: (summary: StoredEpochSummary) => void): void
}
```

**Private fields (all created in constructor):**
- `summaryCardTimer: SummaryCardTimer` — Phase 9, 5-minute card generation
- `tokenMonitor: TokenMonitor` — 30-second tiktoken polling against 560K threshold
- `epochCompressor: EpochCompressor` — LLM compression pipeline (Phase 10-03)
- `contextComposer: ContextComposer` — synchronous DB read layer (this plan)
- `rollingWindow: RollingWindow` — in-memory watermark (Phase 10-01)
- `currentMeetingId: string | null` — session state
- `epochCallbacks: Array<...>` — registered onEpochCompressed listeners

**`start(meetingId)` sequence:**
1. Idempotency guard (T-10-04-A): if `currentMeetingId !== null`, call `stop()` first
2. Set `currentMeetingId = meetingId`
3. `summaryCardTimer.start(meetingId)`
4. `tokenMonitor.start(meetingId, rollingWindow, async (count) => { ... })`
   - onThreshold fires `epochCompressor.compress(meetingId, count, rollingWindow)`
   - If summary non-null, calls all registered `epochCallbacks`
   - Wrapped in `try/catch` — compression failure logs and returns, session continues

**`stop()` sequence:**
1. `summaryCardTimer.stop()`
2. `tokenMonitor.stop()`
3. `rollingWindow.reset()`
4. `currentMeetingId = null`

**`getContext()`:** Returns `null` if not started; otherwise delegates to `contextComposer.getContext(currentMeetingId, rollingWindow.getCoveredUntil())`.

**SummaryCardTimer constraint (D-08):** SummaryCardTimer is NOT retrofitted — it continues to query `transcript_segments` directly for its 5-minute window. ContextEngine only manages its start/stop lifecycle.

## TDD Gate Compliance

Both tasks followed strict RED → GREEN cycle:

| Task | RED commit | GREEN commit | Tests |
|------|-----------|-------------|-------|
| 1 — ContextComposer | `81ee904` | `c894b62` | 14 passing |
| 2 — ContextEngine | `4470534` | `1e9fe6f` | 18 passing |

Total new tests: 32. Combined with prior Phase 10 tests: 47 tests across all 4 context module test files, all passing.

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript compile | `npx tsc --noEmit --project tsconfig.node.json` | 0 errors in new files |
| ContextEnginePort present | `grep -c 'ContextEnginePort' ContextEngine.ts` | **2** — PASS |
| SummaryCardTimer managed | `grep -c 'SummaryCardTimer' ContextEngine.ts` | **6** — PASS |
| rollingWindow.reset present | `grep -c 'rollingWindow.reset' ContextEngine.ts` | **1** — PASS |
| epochCallbacks present | `grep -c 'epochCallbacks' ContextEngine.ts` | **3** — PASS |
| ContextWindow exported | `grep -c 'ContextWindow' ContextComposer.ts` | **5** — PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Compilation fix] Removed `private readonly` from `db` constructor parameter**

- **Found during:** TypeScript verification after Task 2 GREEN
- **Issue:** `private readonly db` in the constructor shorthand creates a class property. Since `db` is only passed to sub-constructors (not accessed as `this.db` later), TypeScript emits TS6138 "Property 'db' is declared but its value is never read."
- **Fix:** Changed `private readonly db: Database.Database` to `db: Database.Database` — plain parameter, not a class property. All sub-constructors receive `db` directly.
- **Files modified:** `src/main/context/ContextEngine.ts` (constructor parameter only)
- **Tests affected:** None — all 18 ContextEngine tests continued to pass

**2. [Rule 1 - Compilation fix] Removed unused `ContextEnginePort` from test runtime import**

- **Found during:** TypeScript verification after Task 2 GREEN
- **Issue:** TS6133 "ContextEnginePort is declared but its value is never read" — imported as a value but used only as a structural documentation comment, not as a TypeScript type assertion.
- **Fix:** Removed `ContextEnginePort` from `import { ContextEngine, ContextEnginePort }` — changed to `import { ContextEngine }` only. The interface is still exported from `ContextEngine.ts` for `index.ts` consumption in 10-05.
- **Files modified:** `src/main/context/__tests__/ContextEngine.test.ts` (import line only)

## Known Stubs

None. Both modules are complete implementations. `= null` and `= []` initializations are operational state (not stubs):
- `currentMeetingId = null` — correct initial state before any session begins
- `epochCallbacks = []` — correct initial state before any listener registers

## Threat Surface Scan

All two STRIDE threats from the plan are handled:

| Threat ID | Mitigation Applied |
|-----------|--------------------|
| T-10-04-A (DoS — double-start concurrent intervals) | `if (currentMeetingId !== null) this.stop()` guard in `start()` before any timer setup |
| T-10-04-B (Info disclosure — ContextWindow exposure) | ContextWindow not pushed to renderer in v1 (D-07); getContext() is internal/test-only |

No new trust boundaries or network endpoints introduced by these two files.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `81ee904` | test | RED — ContextComposer failing tests (14 tests, module not found) |
| `c894b62` | feat | GREEN — ContextComposer DB read layer implementation |
| `4470534` | test | RED — ContextEngine failing tests (17 tests, module not found) |
| `1e9fe6f` | feat | GREEN — ContextEngine orchestrator implementation + compilation fixes |

## Self-Check: PASSED
