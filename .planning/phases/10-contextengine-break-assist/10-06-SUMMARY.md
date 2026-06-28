---
phase: 10-contextengine-break-assist
plan: "06"
subsystem: testing
tags: [vitest, tiktoken, sqlite-vec, better-sqlite3-multiple-ciphers, sqlcipher, epoch-compression, token-threshold]

requires:
  - phase: 10-contextengine-break-assist
    provides: EpochCompressor, TokenMonitor, ContextComposer, RollingWindow — all implemented and ready for integration testing

provides:
  - Synthetic 60-minute pipeline integration test (contextengine-pipeline.test.ts) proving the token counting → threshold detection → LLM compression → DB write → watermark advance pipeline
  - End-to-end proof that EpochCompressor fires exactly once at 560K threshold (D-12a)
  - DB write assertions for epoch_summaries (D-12b) and vec_chunks (D-12c)
  - Token ceiling verification: countAfter < 800K (D-12d)
  - CTX-06 requirement fully satisfied

affects: [10-07-break-assist, verify-work]

tech-stack:
  added: []
  patterns:
    - "Temp-file SQLCipher DB pattern: openTestDb() creates a unique temp file, PRAGMA key before sqliteVec.load(), DDL inline to avoid Electron import side effects, afterEach fs.unlinkSync cleanup"
    - "Constructor-injection mocking: mockLLM and mockEmbedding passed as any to EpochCompressor — no module-level vi.mock() needed for integration test"
    - "Bulk insert via db.transaction() for seeding 1300 segments efficiently"
    - "60-second test timeout for tiktoken cl100k_base encoding 1300 segments"

key-files:
  created:
    - src/main/context/__tests__/contextengine-pipeline.test.ts
  modified: []

key-decisions:
  - "macOS case-insensitive filesystem collision: contextengine.test.ts and ContextEngine.test.ts resolve to the same inode — used contextengine-pipeline.test.ts as the distinct filename"
  - "1300 segments (not 1000): empirical measurement showed 2400-char Lorem ipsum encodes to ~479 tokens in cl100k_base, so 1000 segments yielded only 479K < 560K threshold; 1300 segments gives ~623K with comfortable margin"
  - "meetings FK row inserted before transcript_segments: transcript_segments.meeting_id has REFERENCES meetings(id) ON DELETE CASCADE, so FK constraint enforcement requires the parent meeting row first"
  - "Inline DDL in test file: avoids Electron module resolution side effects that would occur if importing from src/main/store/db.ts directly in a Node (non-Electron) test environment"

patterns-established:
  - "Pipeline integration test pattern: seed real data → call subsystem methods directly (not via setInterval) → assert DB state + ContextComposer shape"
  - "Empirical token calibration: measure actual tiktoken output for the chosen segment text, then calculate required segment count to safely exceed threshold"

requirements-completed:
  - CTX-06

coverage:
  - id: D1
    description: "EpochCompressor fires exactly once at 560K token threshold (D-12a)"
    requirement: CTX-06
    verification:
      - kind: integration
        ref: "src/main/context/__tests__/contextengine-pipeline.test.ts#EpochCompressor fires exactly once..."
        status: pass
    human_judgment: false
  - id: D2
    description: "Exactly one row written to epoch_summaries with correct JSON-serialized fields (D-12b)"
    requirement: CTX-06
    verification:
      - kind: integration
        ref: "src/main/context/__tests__/contextengine-pipeline.test.ts#EpochCompressor fires exactly once..."
        status: pass
    human_judgment: false
  - id: D3
    description: "Exactly one row written to vec_chunks after embedding (D-12c)"
    requirement: CTX-06
    verification:
      - kind: integration
        ref: "src/main/context/__tests__/contextengine-pipeline.test.ts#EpochCompressor fires exactly once..."
        status: pass
    human_judgment: false
  - id: D4
    description: "Token count after compression stays below 560K threshold and 800K ceiling (D-12a, D-12d)"
    requirement: CTX-06
    verification:
      - kind: integration
        ref: "src/main/context/__tests__/contextengine-pipeline.test.ts#EpochCompressor fires exactly once..."
        status: pass
    human_judgment: false
  - id: D5
    description: "RollingWindow watermark advances after compression; ContextComposer returns correct ContextWindow shape"
    requirement: CTX-06
    verification:
      - kind: integration
        ref: "src/main/context/__tests__/contextengine-pipeline.test.ts#EpochCompressor fires exactly once..."
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-06-28
status: complete
---

# Phase 10 Plan 06: Synthetic 60-Minute Pipeline Test Summary

**Vitest integration test seeding 1300 SQLCipher transcript segments (~623K tokens) to verify EpochCompressor fires exactly once at 560K threshold and leaves the rolling window below 800K (CTX-06, D-12, D-13)**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-28T10:00:00Z
- **Completed:** 2026-06-28T10:10:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `contextengine-pipeline.test.ts` — the end-to-end correctness proof for the ContextEngine data pipeline
- All four D-12 assertions pass: (a) compress called exactly once, (b) 1 epoch_summaries row, (c) 1 vec_chunks row, (d) countAfter < 800K
- Test runs in ~1.1 seconds (well within the 60-second timeout) against a real SQLCipher temp-file DB with 1300 seeded segments
- No real LLM or embedding API calls — mockLLM and mockEmbedding injected via constructor
- 50/50 tests pass across all 5 context __tests__ files (no regressions)

## Task Commits

1. **Task 1: Synthetic 60-minute pipeline test (CTX-06)** - `7d62d31` (test)

## Files Created/Modified

- `src/main/context/__tests__/contextengine-pipeline.test.ts` — New integration test: seeds 1300 transcript segments, calls countTokens/compress directly, asserts 4 D-12 invariants, verifies ContextComposer shape post-compression

## Decisions Made

- **macOS case-insensitive filesystem**: `contextengine.test.ts` and `ContextEngine.test.ts` resolve to the same inode on HFS+. Used `contextengine-pipeline.test.ts` as the distinct filename to avoid overwriting the existing unit test file.
- **1300 segments instead of 1000**: Empirical measurement showed the 2400-char Lorem ipsum text encodes to ~479 tokens in cl100k_base (not ~600 as estimated at ~4 chars/token). 1000 segments produced only 479K < 560K threshold. 1300 segments give ~623K with a 63K margin.
- **meetings FK row required**: `transcript_segments.meeting_id` has `REFERENCES meetings(id) ON DELETE CASCADE`. Inserting segments without a parent meeting row causes a FK constraint violation. Added `seedMeeting()` helper.
- **Inline DDL**: Importing from `src/main/store/db.ts` in the Node test environment would trigger Electron imports (`app`, `safeStorage`). Inlined the DDL in the test file to avoid that resolution chain.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] macOS case-insensitive filesystem: `contextengine.test.ts` collides with `ContextEngine.test.ts`**
- **Found during:** Task 1 (first write attempt via Bash heredoc)
- **Issue:** `cat > contextengine.test.ts` on macOS HFS+ silently writes to the existing `ContextEngine.test.ts`, overwriting 20 unit tests with the new pipeline test content
- **Fix:** Restored `ContextEngine.test.ts` to its original unit-test content (matching the git-tracked version), then created `contextengine-pipeline.test.ts` as the distinct filename for the new test
- **Files modified:** `src/main/context/__tests__/ContextEngine.test.ts` (restored), `src/main/context/__tests__/contextengine-pipeline.test.ts` (new)
- **Verification:** All 50 tests pass across 5 test files; `git status` confirms ContextEngine.test.ts is unchanged from HEAD

**2. [Rule 1 - Bug] Token count calibration: 1000 segments produced 479K tokens, not 600K as estimated**
- **Found during:** Task 1 (first test run showed `expected 479000 to be greater than 560000`)
- **Issue:** The 2400-char Lorem ipsum text encodes to ~479 tokens in cl100k_base (~5 chars/token for Latin text), not ~600 as the plan estimated (~4 chars/token)
- **Fix:** Increased segment count from 1000 to 1300 (producing ~623K tokens with a comfortable margin above 560K)
- **Files modified:** `src/main/context/__tests__/contextengine-pipeline.test.ts`
- **Verification:** countBefore = 623K > 560K threshold, test passes

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs — macOS filesystem constraint and token calibration)
**Impact on plan:** Both fixes necessary for the test to run correctly. No scope creep.

## Issues Encountered

- macOS HFS+ case-insensitive filesystem caused the initial write to overwrite the existing test file. Caught immediately on first test run, restored, and mitigated by choosing a distinct filename with a `-pipeline` suffix.
- tiktoken encoding: Latin-script Lorem ipsum text has higher char/token ratio (~5:1) than typical English prose (~4:1). Adjusted segment count to compensate.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The test creates temp-file SQLCipher DBs with afterEach cleanup — no persistence beyond the test run (T-10-06-A satisfied).

## Known Stubs

None — the test uses real EpochCompressor, TokenMonitor, ContextComposer, and RollingWindow implementations against a real SQLCipher DB. Only LLM and embedding are mocked (no external API calls in tests).

## Next Phase Readiness

- CTX-06 requirement fully satisfied with a passing integration test
- All four D-12 correctness invariants proven
- Ready for Phase 10-07: Break Assist implementation

---
*Phase: 10-contextengine-break-assist*
*Completed: 2026-06-28*
